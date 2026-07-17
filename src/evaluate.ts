import { canonicalJson } from './canonical.js';
import { selectPointer } from './pointer.js';
import type {
  AssertionResult,
  AssertionStatus,
  BehaviorAssertion,
  BehaviorContract,
  BehaviorScenarioTrace,
  BehaviorSummary,
  BehaviorTrace,
  JsonPrimitive,
  JsonValue,
  Matcher,
  ScenarioResult,
  SelectedValue,
} from './types.js';

export function evaluateBehavior(contract: BehaviorContract, baseline: BehaviorTrace, candidate: BehaviorTrace): ScenarioResult[] {
  const baselineById = new Map(baseline.scenarios.map((scenario) => [scenario.id, scenario]));
  const candidateById = new Map(candidate.scenarios.map((scenario) => [scenario.id, scenario]));
  return contract.scenarios.map((scenario) => {
    const baselineScenario = baselineById.get(scenario.id);
    const candidateScenario = candidateById.get(scenario.id);
    const assertions = scenario.assertions.map((assertion) => evaluateAssertionForScenario(assertion, scenario.id, baselineScenario, candidateScenario));
    return {
      id: scenario.id,
      ...(scenario.description === undefined ? {} : { description: scenario.description }),
      ...(baselineScenario === undefined ? {} : { baselineStatus: baselineScenario.status }),
      ...(candidateScenario === undefined ? {} : { candidateStatus: candidateScenario.status }),
      status: aggregateStatus(assertions.map((result) => result.status)),
      assertions,
    };
  });
}

export function evaluateMatcher(matcher: Matcher, baseline: SelectedValue, candidate: SelectedValue): { status: AssertionStatus; reason: string } {
  if (matcher.op === 'exists') {
    return candidate.found
      ? { status: 'compatible', reason: 'Candidate value exists.' }
      : { status: 'drifted', reason: 'Candidate value is missing.' };
  }
  if (!candidate.found) return { status: 'drifted', reason: 'Candidate selector did not resolve.' };

  if (matcher.op === 'equals') {
    return equal(candidate.value, matcher.value)
      ? { status: 'compatible', reason: 'Candidate equals the contract value.' }
      : { status: 'drifted', reason: 'Candidate differs from the contract value.' };
  }
  if (matcher.op === 'contains') return contains(candidate.value, matcher.value)
    ? { status: 'compatible', reason: 'Candidate contains the required value.' }
    : { status: 'drifted', reason: 'Candidate does not contain the required value.' };
  if (matcher.op === 'allowlist') return matcher.values.some((value) => equal(candidate.value, value))
    ? { status: 'compatible', reason: 'Candidate value is allowed.' }
    : { status: 'drifted', reason: 'Candidate value is outside the allowlist.' };

  if (!baseline.found) return { status: 'unknown', reason: 'Baseline selector did not resolve for a relational matcher.' };

  if (matcher.op === 'same') return equal(baseline.value, candidate.value)
    ? { status: 'compatible', reason: 'Candidate matches the baseline.' }
    : { status: 'drifted', reason: 'Candidate differs from the baseline.' };
  if (matcher.op === 'set_same') {
    if (!Array.isArray(baseline.value) || !Array.isArray(candidate.value)) return { status: 'unknown', reason: 'set_same requires arrays on both sides.' };
    return equal(asCanonicalSet(baseline.value), asCanonicalSet(candidate.value))
      ? { status: 'compatible', reason: 'Candidate set matches the baseline set.' }
      : { status: 'drifted', reason: 'Candidate set differs from the baseline set.' };
  }
  if (matcher.op === 'sequence_same') {
    if (!Array.isArray(baseline.value) || !Array.isArray(candidate.value)) return { status: 'unknown', reason: 'sequence_same requires arrays on both sides.' };
    return equal(baseline.value, candidate.value)
      ? { status: 'compatible', reason: 'Candidate sequence matches the baseline sequence.' }
      : { status: 'drifted', reason: 'Candidate sequence differs from the baseline sequence.' };
  }
  if (matcher.op === 'number_delta') {
    if (typeof baseline.value !== 'number' || typeof candidate.value !== 'number') return { status: 'unknown', reason: 'number_delta requires finite numbers on both sides.' };
    const absolute = Math.abs(candidate.value - baseline.value);
    const absoluteOkay = matcher.maxAbsolute === undefined || absolute <= matcher.maxAbsolute;
    const relative = baseline.value === 0 ? (candidate.value === 0 ? 0 : Number.POSITIVE_INFINITY) : absolute / Math.abs(baseline.value);
    const relativeOkay = matcher.maxRelative === undefined || relative <= matcher.maxRelative;
    return absoluteOkay && relativeOkay
      ? { status: 'compatible', reason: `Numeric drift is within budget (absolute ${formatNumber(absolute)}, relative ${formatNumber(relative)}).` }
      : { status: 'drifted', reason: `Numeric drift exceeds budget (absolute ${formatNumber(absolute)}, relative ${formatNumber(relative)}).` };
  }
  if (typeof baseline.value !== 'string' || typeof candidate.value !== 'string') return { status: 'unknown', reason: 'rank_not_lower requires string values on both sides.' };
  const baselineRank = matcher.order.indexOf(baseline.value);
  const candidateRank = matcher.order.indexOf(candidate.value);
  if (baselineRank < 0 || candidateRank < 0) return { status: 'unknown', reason: 'A rank value is not present in the configured order.' };
  return candidateRank >= baselineRank
    ? { status: 'compatible', reason: 'Candidate rank is equal to or better than baseline.' }
    : { status: 'drifted', reason: 'Candidate rank is worse than baseline.' };
}

export function summarizeBehavior(scenarios: ScenarioResult[]): BehaviorSummary {
  const assertions = scenarios.flatMap((scenario) => scenario.assertions);
  const assertionCount = (status: AssertionStatus) => assertions.filter((result) => result.status === status).length;
  const scenarioCount = (status: AssertionStatus) => scenarios.filter((result) => result.status === status).length;
  return {
    total: assertions.length,
    compatible: assertionCount('compatible'),
    drifted: assertionCount('drifted'),
    unknown: assertionCount('unknown'),
    scenarios: scenarios.length,
    compatibleScenarios: scenarioCount('compatible'),
    driftedScenarios: scenarioCount('drifted'),
    unknownScenarios: scenarioCount('unknown'),
    gatePassed: assertions.filter((assertion) => assertion.severity === 'error').every((assertion) => assertion.status === 'compatible'),
    strictGatePassed: assertions.every((assertion) => assertion.status === 'compatible'),
  };
}

function evaluateAssertionForScenario(
  assertion: BehaviorAssertion,
  scenarioId: string,
  baselineScenario: BehaviorScenarioTrace | undefined,
  candidateScenario: BehaviorScenarioTrace | undefined,
): AssertionResult {
  const baseline = baselineScenario === undefined ? { found: false } : selectPointer(baselineScenario as unknown as JsonValue, assertion.selector);
  const candidate = candidateScenario === undefined ? { found: false } : selectPointer(candidateScenario as unknown as JsonValue, assertion.selector);
  const evaluated = candidateScenario === undefined
    ? { status: 'unknown' as const, reason: 'Candidate trace does not contain this scenario.' }
    : evaluateMatcher(assertion.matcher, baseline, candidate);
  return {
    id: assertion.id,
    scenarioId,
    statement: assertion.statement,
    severity: assertion.severity ?? 'error',
    selector: assertion.selector,
    matcher: assertion.matcher,
    status: evaluated.status,
    reason: evaluated.reason,
    baseline,
    candidate,
    limitations: assertion.limitations ?? [],
    tags: assertion.tags ?? [],
  };
}

function contains(value: JsonValue | undefined, expected: JsonPrimitive): boolean {
  if (typeof value === 'string' && typeof expected === 'string') return value.includes(expected);
  if (Array.isArray(value)) return value.some((item) => equal(item, expected));
  return false;
}

function equal(a: unknown, b: unknown): boolean { return canonicalJson(a) === canonicalJson(b); }
function asCanonicalSet(values: JsonValue[]): string[] { return [...new Set(values.map((value) => canonicalJson(value)))].sort(); }
function aggregateStatus(statuses: AssertionStatus[]): AssertionStatus { return statuses.includes('drifted') ? 'drifted' : statuses.includes('unknown') ? 'unknown' : 'compatible'; }
function formatNumber(value: number): string { return Number.isFinite(value) ? Number(value.toFixed(6)).toString() : 'infinite'; }
