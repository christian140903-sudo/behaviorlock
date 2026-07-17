import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBehavior, evaluateMatcher, summarizeBehavior } from '../src/evaluate.js';
import type { BehaviorContract, BehaviorTrace, JsonValue, SelectedValue } from '../src/types.js';

const missing: SelectedValue = { found: false };
const selected = (value: JsonValue): SelectedValue => ({ found: true, value });

test('exists passes for a selected null', () => assert.equal(evaluateMatcher({ op: 'exists' }, missing, selected(null)).status, 'compatible'));
test('exists drifts for a missing candidate', () => assert.equal(evaluateMatcher({ op: 'exists' }, missing, missing).status, 'drifted'));
test('equals compares nested JSON structurally', () => assert.equal(evaluateMatcher({ op: 'equals', value: { a: 1, b: 2 } }, missing, selected({ b: 2, a: 1 })).status, 'compatible'));
test('equals detects changed values', () => assert.equal(evaluateMatcher({ op: 'equals', value: 'expected' }, missing, selected('changed')).status, 'drifted'));
test('contains supports string substrings', () => assert.equal(evaluateMatcher({ op: 'contains', value: 'ready' }, missing, selected('system ready now')).status, 'compatible'));
test('contains supports structural array membership', () => assert.equal(evaluateMatcher({ op: 'contains', value: 2 }, missing, selected([1, 2, 3])).status, 'compatible'));
test('contains rejects object haystacks', () => assert.equal(evaluateMatcher({ op: 'contains', value: 'x' }, missing, selected({ x: true })).status, 'drifted'));
test('allowlist supports structural JSON values', () => assert.equal(evaluateMatcher({ op: 'allowlist', values: [{ safe: true }] }, missing, selected({ safe: true })).status, 'compatible'));
test('allowlist detects values outside the list', () => assert.equal(evaluateMatcher({ op: 'allowlist', values: ['ask', 'deny'] }, missing, selected('allow')).status, 'drifted'));
test('same compares candidate to baseline', () => assert.equal(evaluateMatcher({ op: 'same' }, selected(['a']), selected(['a'])).status, 'compatible'));
test('same is unknown without a baseline', () => assert.equal(evaluateMatcher({ op: 'same' }, missing, selected('new')).status, 'unknown'));
test('set_same ignores order and duplicates', () => assert.equal(evaluateMatcher({ op: 'set_same' }, selected(['a', 'b', 'a']), selected(['b', 'a'])).status, 'compatible'));
test('set_same detects set changes', () => assert.equal(evaluateMatcher({ op: 'set_same' }, selected(['a', 'b']), selected(['a', 'c'])).status, 'drifted'));
test('set_same is unknown for scalar values', () => assert.equal(evaluateMatcher({ op: 'set_same' }, selected('a'), selected('a')).status, 'unknown'));
test('sequence_same preserves order', () => assert.equal(evaluateMatcher({ op: 'sequence_same' }, selected(['a', 'b']), selected(['b', 'a'])).status, 'drifted'));
test('number_delta passes within absolute budget', () => assert.equal(evaluateMatcher({ op: 'number_delta', maxAbsolute: 2 }, selected(10), selected(12)).status, 'compatible'));
test('number_delta fails outside relative budget', () => assert.equal(evaluateMatcher({ op: 'number_delta', maxRelative: 0.1 }, selected(100), selected(120)).status, 'drifted'));
test('number_delta applies every configured budget', () => assert.equal(evaluateMatcher({ op: 'number_delta', maxAbsolute: 50, maxRelative: 0.1 }, selected(100), selected(120)).status, 'drifted'));
test('number_delta handles zero baseline exactly', () => {
  assert.equal(evaluateMatcher({ op: 'number_delta', maxRelative: 0 }, selected(0), selected(0)).status, 'compatible');
  assert.equal(evaluateMatcher({ op: 'number_delta', maxRelative: 1 }, selected(0), selected(1)).status, 'drifted');
});
test('number_delta is unknown for non-numbers', () => assert.equal(evaluateMatcher({ op: 'number_delta', maxAbsolute: 1 }, selected('1'), selected('2')).status, 'unknown'));
test('rank_not_lower passes equal and improved values', () => {
  const matcher = { op: 'rank_not_lower' as const, order: ['allow', 'ask', 'deny'] };
  assert.equal(evaluateMatcher(matcher, selected('ask'), selected('ask')).status, 'compatible');
  assert.equal(evaluateMatcher(matcher, selected('ask'), selected('deny')).status, 'compatible');
});
test('rank_not_lower detects regression', () => assert.equal(evaluateMatcher({ op: 'rank_not_lower', order: ['allow', 'ask', 'deny'] }, selected('deny'), selected('allow')).status, 'drifted'));
test('rank_not_lower is unknown for unranked values', () => assert.equal(evaluateMatcher({ op: 'rank_not_lower', order: ['allow', 'deny'] }, selected('ask'), selected('deny')).status, 'unknown'));
test('missing candidate scenario makes assertions unknown', () => {
  const contract: BehaviorContract = { schemaVersion: 1, project: { name: 'fixture' }, scenarios: [{ id: 'missing', assertions: [{ id: 'present', statement: 'The scenario remains present.', selector: '', matcher: { op: 'exists' } }] }] };
  const empty = (candidate: string): BehaviorTrace => ({ traceVersion: 1, run: { id: candidate, candidate }, scenarios: [] });
  const results = evaluateBehavior(contract, empty('baseline'), empty('candidate'));
  assert.equal(results[0]?.assertions[0]?.status, 'unknown');
  assert.equal(results[0]?.status, 'unknown');
});
test('scenario status aggregates drift before unknown', () => {
  const contract: BehaviorContract = { schemaVersion: 1, project: { name: 'fixture' }, scenarios: [{ id: 'one', assertions: [
    { id: 'drift', statement: 'Value remains the same.', selector: '/observations/value', matcher: { op: 'same' } },
    { id: 'unknown', statement: 'New value has a baseline.', selector: '/observations/new', matcher: { op: 'same' } },
  ] }] };
  const baseline: BehaviorTrace = { traceVersion: 1, run: { id: 'a', candidate: 'a' }, scenarios: [{ id: 'one', status: 'completed', observations: { value: 1 } }] };
  const candidate: BehaviorTrace = { traceVersion: 1, run: { id: 'b', candidate: 'b' }, scenarios: [{ id: 'one', status: 'completed', observations: { value: 2, new: true } }] };
  assert.equal(evaluateBehavior(contract, baseline, candidate)[0]?.status, 'drifted');
});
test('default gate ignores warning drift but strict gate does not', () => {
  const contract: BehaviorContract = { schemaVersion: 1, project: { name: 'fixture' }, scenarios: [{ id: 'one', assertions: [
    { id: 'required', statement: 'Required value is stable.', selector: '/observations/a', matcher: { op: 'same' } },
    { id: 'advisory', statement: 'Advisory value is stable.', severity: 'warning', selector: '/observations/b', matcher: { op: 'same' } },
  ] }] };
  const trace = (id: string, b: number): BehaviorTrace => ({ traceVersion: 1, run: { id, candidate: id }, scenarios: [{ id: 'one', status: 'completed', observations: { a: 1, b } }] });
  const summary = summarizeBehavior(evaluateBehavior(contract, trace('a', 1), trace('b', 2)));
  assert.equal(summary.gatePassed, true);
  assert.equal(summary.strictGatePassed, false);
  assert.equal(summary.drifted, 1);
});
