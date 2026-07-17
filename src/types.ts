export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AssertionSeverity = 'error' | 'warning' | 'info';
export type AssertionStatus = 'compatible' | 'drifted' | 'unknown';
export type ScenarioExecutionStatus = 'completed' | 'error' | 'skipped';

export type Matcher =
  | { op: 'exists' }
  | { op: 'equals'; value: JsonValue }
  | { op: 'same' }
  | { op: 'contains'; value: JsonPrimitive }
  | { op: 'allowlist'; values: JsonValue[] }
  | { op: 'set_same' }
  | { op: 'sequence_same' }
  | { op: 'number_delta'; maxAbsolute?: number; maxRelative?: number }
  | { op: 'rank_not_lower'; order: string[] };

export interface BehaviorAssertion {
  id: string;
  statement: string;
  severity?: AssertionSeverity;
  selector: string;
  matcher: Matcher;
  limitations?: string[];
  tags?: string[];
}

export interface ScenarioContract {
  id: string;
  description?: string;
  assertions: BehaviorAssertion[];
}

export interface BehaviorContract {
  $schema?: string;
  schemaVersion: 1;
  project: {
    name: string;
    repository?: string;
  };
  scenarios: ScenarioContract[];
}

export interface BehaviorScenarioTrace {
  id: string;
  status: ScenarioExecutionStatus;
  observations: Record<string, JsonValue>;
}

export interface BehaviorTrace {
  $schema?: string;
  traceVersion: 1;
  run: {
    id: string;
    candidate: string;
    createdAt?: string;
    metadata?: Record<string, JsonValue>;
  };
  scenarios: BehaviorScenarioTrace[];
}

export interface SelectedValue {
  found: boolean;
  value?: JsonValue;
}

export interface AssertionResult {
  id: string;
  scenarioId: string;
  statement: string;
  severity: AssertionSeverity;
  selector: string;
  matcher: Matcher;
  status: AssertionStatus;
  reason: string;
  baseline: SelectedValue;
  candidate: SelectedValue;
  limitations: string[];
  tags: string[];
}

export interface ScenarioResult {
  id: string;
  description?: string;
  baselineStatus?: ScenarioExecutionStatus;
  candidateStatus?: ScenarioExecutionStatus;
  status: AssertionStatus;
  assertions: AssertionResult[];
}

export interface BehaviorSummary {
  total: number;
  compatible: number;
  drifted: number;
  unknown: number;
  scenarios: number;
  compatibleScenarios: number;
  driftedScenarios: number;
  unknownScenarios: number;
  gatePassed: boolean;
  strictGatePassed: boolean;
}

export interface BehaviorReport {
  reportVersion: 1;
  runId: string;
  generatedAt: string;
  project: BehaviorContract['project'];
  contractFile: string;
  baseline: {
    runId: string;
    candidate: string;
    fingerprint: string;
  };
  candidate: {
    runId: string;
    candidate: string;
    fingerprint: string;
  };
  summary: BehaviorSummary;
  scenarios: ScenarioResult[];
  reportDigest: string;
}

export type ReportFormat = 'json' | 'markdown' | 'html' | 'sarif' | 'junit';
