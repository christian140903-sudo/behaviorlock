import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { behaviorFingerprint, sha256 } from './canonical.js';
import { evaluateBehavior, summarizeBehavior } from './evaluate.js';
import { loadContract, loadTrace } from './load.js';
import type { BehaviorReport } from './types.js';

export interface CompareOptions { generatedAt?: string; runId?: string }

export async function compareBehavior(
  baselinePath: string,
  candidatePath: string,
  contractPath = 'behaviorlock.json',
  options: CompareOptions = {},
): Promise<BehaviorReport> {
  const [{ contract, path }, { trace: baseline }, { trace: candidate }] = await Promise.all([
    loadContract(contractPath), loadTrace(baselinePath), loadTrace(candidatePath),
  ]);
  const scenarios = evaluateBehavior(contract, baseline, candidate);
  const base = {
    reportVersion: 1 as const,
    runId: options.runId ?? `behavior_${randomUUID()}`,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    project: contract.project,
    contractFile: basename(path),
    baseline: { runId: baseline.run.id, candidate: baseline.run.candidate, fingerprint: behaviorFingerprint(baseline) },
    candidate: { runId: candidate.run.id, candidate: candidate.run.candidate, fingerprint: behaviorFingerprint(candidate) },
    summary: summarizeBehavior(scenarios),
    scenarios,
  };
  return { ...base, reportDigest: sha256(base) };
}
