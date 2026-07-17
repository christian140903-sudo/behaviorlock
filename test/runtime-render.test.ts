import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { behaviorFingerprint, canonicalJson, sha256 } from '../src/canonical.js';
import { loadContract, loadTrace } from '../src/load.js';
import { renderHtml, renderJunit, renderMarkdown, renderReport, renderSarif, writeReports } from '../src/render.js';
import { compareBehavior } from '../src/runtime.js';
import type { BehaviorTrace } from '../src/types.js';

const examples = fileURLToPath(new URL('../../examples/', import.meta.url));
const contractPath = join(examples, 'behaviorlock.json');
const baselinePath = join(examples, 'baseline.trace.json');
const candidatePath = join(examples, 'candidate.trace.json');

test('loads the bundled contract and traces', async () => {
  assert.equal((await loadContract(contractPath)).contract.scenarios.length, 3);
  assert.equal((await loadTrace(baselinePath)).trace.run.candidate, 'model-a / prompt-v3');
});

test('invalid JSON names the broken file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'behaviorlock-invalid-'));
  const path = join(root, 'broken.json');
  await writeFile(path, '{broken');
  await assert.rejects(loadTrace(path), /Invalid JSON in broken\.json/);
});

test('compares the bundled upgrade with one honest unknown', async () => {
  const report = await compareBehavior(baselinePath, candidatePath, contractPath, { runId: 'fixed', generatedAt: '2026-07-17T12:00:00.000Z' });
  assert.equal(report.runId, 'fixed');
  assert.equal(report.summary.compatible, 6);
  assert.equal(report.summary.drifted, 0);
  assert.equal(report.summary.unknown, 1);
  assert.equal(report.summary.gatePassed, true);
  assert.equal(report.summary.strictGatePassed, false);
});

test('report digest covers all report data except itself', async () => {
  const report = await compareBehavior(baselinePath, candidatePath, contractPath, { runId: 'fixed', generatedAt: '2026-07-17T12:00:00.000Z' });
  const base = { ...report };
  delete (base as Partial<typeof report>).reportDigest;
  assert.equal(report.reportDigest, sha256(base));
});

test('behavior fingerprint excludes run metadata', () => {
  const trace = (id: string, candidate: string): BehaviorTrace => ({ traceVersion: 1, run: { id, candidate, createdAt: '2026-07-17T00:00:00.000Z' }, scenarios: [{ id: 'one', status: 'completed', observations: { value: 1 } }] });
  assert.equal(behaviorFingerprint(trace('a', 'model-a')), behaviorFingerprint(trace('b', 'model-b')));
});

test('behavior fingerprint changes with observable behavior', () => {
  const trace = (value: number): BehaviorTrace => ({ traceVersion: 1, run: { id: 'run', candidate: 'model' }, scenarios: [{ id: 'one', status: 'completed', observations: { value } }] });
  assert.notEqual(behaviorFingerprint(trace(1)), behaviorFingerprint(trace(2)));
});

test('behavior fingerprint ignores scenario order', () => {
  const scenarioA = { id: 'a', status: 'completed' as const, observations: { value: 1 } };
  const scenarioB = { id: 'b', status: 'completed' as const, observations: { value: 2 } };
  const trace = (scenarios: BehaviorTrace['scenarios']): BehaviorTrace => ({ traceVersion: 1, run: { id: 'run', candidate: 'model' }, scenarios });
  assert.equal(behaviorFingerprint(trace([scenarioA, scenarioB])), behaviorFingerprint(trace([scenarioB, scenarioA])));
});

test('canonical JSON recursively sorts object keys', () => assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 3 } }), '{"a":{"b":3,"d":2},"z":1}'));

test('Markdown includes fingerprints, statuses, reasons, and limitations', async () => {
  const output = renderMarkdown(await compareBehavior(baselinePath, candidatePath, contractPath));
  assert.match(output, /Behaviorlock report/);
  assert.match(output, /model-a \/ prompt-v3/);
  assert.match(output, /escalation-path-baselined/);
  assert.match(output, /New scenarios remain unknown/);
});

test('HTML escapes report-controlled markup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'behaviorlock-html-'));
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  contract.project.name = '<script>alert(1)</script>';
  const modified = join(root, 'contract.json');
  await writeFile(modified, JSON.stringify(contract));
  const output = renderHtml(await compareBehavior(baselinePath, candidatePath, modified));
  assert.doesNotMatch(output, /<script>alert\(1\)<\/script>/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(output, /name="robots" content="noindex"/);
});

test('SARIF includes only drifted and unknown assertions', async () => {
  const report = await compareBehavior(baselinePath, candidatePath, contractPath);
  const parsed = JSON.parse(renderSarif(report));
  assert.equal(parsed.version, '2.1.0');
  assert.equal(parsed.runs[0].results.length, 1);
  assert.equal(parsed.runs[0].results[0].ruleId, 'behaviorlock/escalation-path-baselined');
});

test('JUnit maps drift to failures and unknown to skipped', async () => {
  const output = renderJunit(await compareBehavior(baselinePath, candidatePath, contractPath));
  assert.match(output, /tests="7" failures="0" skipped="1"/);
  assert.match(output, /<skipped message=/);
});

test('all five report formats render', async () => {
  const report = await compareBehavior(baselinePath, candidatePath, contractPath);
  for (const format of ['json', 'markdown', 'html', 'sarif', 'junit'] as const) assert.ok(renderReport(report, format).length > 50, format);
});

test('writeReports writes and deduplicates selected formats', async () => {
  const output = await mkdtemp(join(tmpdir(), 'behaviorlock-reports-'));
  const paths = await writeReports(await compareBehavior(baselinePath, candidatePath, contractPath), output, ['json', 'markdown', 'json']);
  assert.deepEqual(paths, [join(output, 'behaviorlock-report.json'), join(output, 'behaviorlock-report.md')]);
  for (const path of paths) assert.ok((await readFile(path, 'utf8')).length > 50);
});
