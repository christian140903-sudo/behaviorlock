import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPointer } from '../src/pointer.js';
import { behaviorContractSchema, behaviorTraceSchema, matcherSchema } from '../src/schemas.js';
import type { JsonValue } from '../src/types.js';

const root: JsonValue = { observations: { tools: ['search', 'read'], nested: { 'a/b': { '~key': 7 } }, nullable: null } };

test('empty pointer selects the root', () => assert.deepEqual(selectPointer(root, ''), { found: true, value: root }));
test('selects nested object values', () => assert.deepEqual(selectPointer(root, '/observations/tools'), { found: true, value: ['search', 'read'] }));
test('selects array items', () => assert.deepEqual(selectPointer(root, '/observations/tools/1'), { found: true, value: 'read' }));
test('decodes escaped slash tokens', () => assert.deepEqual(selectPointer(root, '/observations/nested/a~1b/~0key'), { found: true, value: 7 }));
test('preserves explicit null values', () => assert.deepEqual(selectPointer(root, '/observations/nullable'), { found: true, value: null }));
test('rejects pointers without a leading slash', () => assert.deepEqual(selectPointer(root, 'observations/tools'), { found: false }));
test('rejects missing object keys', () => assert.deepEqual(selectPointer(root, '/observations/missing'), { found: false }));
test('rejects missing array indexes', () => assert.deepEqual(selectPointer(root, '/observations/tools/9'), { found: false }));
test('rejects non-canonical array indexes', () => assert.deepEqual(selectPointer(root, '/observations/tools/01'), { found: false }));

function contract(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    project: { name: 'fixture' },
    scenarios: [{ id: 'scenario', assertions: [{ id: 'assertion', statement: 'The behavior remains stable.', selector: '/observations/value', matcher: { op: 'same' } }] }],
    ...overrides,
  };
}

function trace(overrides: Record<string, unknown> = {}) {
  return { traceVersion: 1, run: { id: 'run', candidate: 'candidate' }, scenarios: [{ id: 'scenario', status: 'completed', observations: { value: true } }], ...overrides };
}

test('accepts a minimal behavior contract', () => assert.equal(behaviorContractSchema.safeParse(contract()).success, true));
test('rejects unknown contract fields', () => assert.equal(behaviorContractSchema.safeParse({ ...contract(), surprise: true }).success, false));
test('rejects malformed scenario IDs', () => assert.equal(behaviorContractSchema.safeParse(contract({ scenarios: [{ id: 'Bad ID', assertions: [] }] })).success, false));
test('rejects duplicate scenario IDs', () => {
  const scenario = contract().scenarios[0];
  const parsed = behaviorContractSchema.safeParse(contract({ scenarios: [scenario, scenario] }));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /Duplicate scenario id/);
});
test('rejects duplicate assertion IDs across scenarios', () => {
  const assertion = contract().scenarios[0]?.assertions[0];
  const parsed = behaviorContractSchema.safeParse(contract({ scenarios: [{ id: 'one', assertions: [assertion] }, { id: 'two', assertions: [assertion] }] }));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /Duplicate assertion id/);
});
test('rejects non-pointer selectors', () => assert.equal(behaviorContractSchema.safeParse(contract({ scenarios: [{ id: 'scenario', assertions: [{ id: 'assertion', statement: 'The behavior remains stable.', selector: 'bad', matcher: { op: 'same' } }] }] })).success, false));
test('accepts every matcher kind', () => {
  const matchers = [
    { op: 'exists' }, { op: 'equals', value: { ok: true } }, { op: 'same' }, { op: 'contains', value: 'x' },
    { op: 'allowlist', values: ['a', 'b'] }, { op: 'set_same' }, { op: 'sequence_same' },
    { op: 'number_delta', maxAbsolute: 1 }, { op: 'number_delta', maxRelative: 0.2 },
    { op: 'rank_not_lower', order: ['bad', 'good'] },
  ];
  for (const matcher of matchers) assert.equal(matcherSchema.safeParse(matcher).success, true, matcher.op);
});
test('number_delta requires a budget', () => assert.equal(matcherSchema.safeParse({ op: 'number_delta' }).success, false));
test('rank order values must be unique', () => assert.equal(matcherSchema.safeParse({ op: 'rank_not_lower', order: ['same', 'same'] }).success, false));
test('accepts a minimal portable trace', () => assert.equal(behaviorTraceSchema.safeParse(trace()).success, true));
test('rejects duplicate trace scenario IDs', () => {
  const scenario = trace().scenarios[0];
  const parsed = behaviorTraceSchema.safeParse(trace({ scenarios: [scenario, scenario] }));
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.message, /Duplicate scenario id/);
});
test('rejects invalid trace status', () => assert.equal(behaviorTraceSchema.safeParse(trace({ scenarios: [{ id: 'scenario', status: 'maybe', observations: {} }] })).success, false));
test('rejects non-JSON observation values', () => assert.equal(behaviorTraceSchema.safeParse(trace({ scenarios: [{ id: 'scenario', status: 'completed', observations: { bad: Number.NaN } }] })).success, false));
