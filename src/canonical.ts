import { createHash } from 'node:crypto';
import type { BehaviorTrace } from './types.js';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

export function behaviorFingerprint(trace: BehaviorTrace): string {
  return sha256({
    traceVersion: trace.traceVersion,
    scenarios: [...trace.scenarios]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((scenario) => ({ id: scenario.id, status: scenario.status, observations: scenario.observations })),
  });
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}
