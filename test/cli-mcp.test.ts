import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = fileURLToPath(new URL('../src/index.js', import.meta.url));
const examples = fileURLToPath(new URL('../../examples/', import.meta.url));
const contract = join(examples, 'behaviorlock.json');
const baseline = join(examples, 'baseline.trace.json');
const candidate = join(examples, 'candidate.trace.json');

function run(args: string[], cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { cwd });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function cleanEnv(extra: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries({ ...process.env, ...extra }).filter((item): item is [string, string] => typeof item[1] === 'string'));
}

function toolText(result: unknown): string {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
  if (!content || content.type !== 'text' || typeof content.text !== 'string') throw new Error('Expected text MCP result.');
  return content.text;
}

test('help documents the source-only comparison boundary', async () => {
  const result = await run(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /deterministic compatibility gates/);
  assert.match(result.stdout, /behaviorlock compare/);
});

test('init writes a valid starter contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'behaviorlock-init-'));
  const result = await run(['init'], root);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(await readFile(join(root, 'behaviorlock.json'), 'utf8'));
  assert.equal(parsed.scenarios[0].assertions[0].matcher.op, 'rank_not_lower');
});

test('init refuses to replace a contract without force', async () => {
  const root = await mkdtemp(join(tmpdir(), 'behaviorlock-init-'));
  await writeFile(join(root, 'behaviorlock.json'), '{}');
  const result = await run(['init'], root);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /already exists/);
});

test('validate accepts a contract and multiple traces', async () => {
  const result = await run(['validate', contract, baseline, candidate]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.traces.length, 2);
});

test('fingerprint emits stable behavior identity', async () => {
  const result = await run(['fingerprint', baseline]);
  assert.equal(result.code, 0);
  assert.match(JSON.parse(result.stdout).fingerprint, /^[a-f0-9]{64}$/);
});

test('compare passes default gate and writes reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'behaviorlock-cli-'));
  const result = await run(['compare', baseline, candidate, contract, '--out', root, '--formats', 'json,junit']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Behaviorlock PASS/);
  await access(join(root, 'behaviorlock-report.json'));
  await access(join(root, 'behaviorlock-report.xml'));
});

test('strict compare fails the bundled unknown', async () => {
  const result = await run(['compare', baseline, candidate, contract, '--strict', '--no-write']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /^Behaviorlock FAIL \(strict\) — /);
});

test('compare JSON is machine readable', async () => {
  const result = await run(['compare', baseline, candidate, contract, '--json', '--no-write']);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).summary.unknown, 1);
});

test('explain returns one assertion and its selected values', async () => {
  const result = await run(['explain', 'permission-not-weaker', baseline, candidate, contract]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.baseline.value, 'ask');
  assert.equal(parsed.candidate.value, 'deny');
});

test('unknown commands exit with runtime/configuration code 2', async () => {
  const result = await run(['no-such-command']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Unknown command/);
});

test('MCP server exposes tools, resources, prompt, comparison, and fingerprint', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, 'serve'], env: cleanEnv({ BEHAVIORLOCK_CONTRACT: contract }) });
  const client = new Client({ name: 'behaviorlock-tests', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
      'behaviorlock_compare', 'behaviorlock_explain', 'behaviorlock_fingerprint', 'behaviorlock_render', 'behaviorlock_validate',
    ]);
    assert.deepEqual((await client.listResources()).resources.map((resource) => resource.uri).sort(), [
      'behaviorlock://example', 'behaviorlock://schema/contract', 'behaviorlock://schema/trace',
    ]);
    assert.equal((await client.listPrompts()).prompts[0]?.name, 'gate-agent-upgrade');
    const compared = JSON.parse(toolText(await client.callTool({ name: 'behaviorlock_compare', arguments: { baseline, candidate } })));
    assert.equal(compared.summary.gatePassed, true);
    const fingerprinted = JSON.parse(toolText(await client.callTool({ name: 'behaviorlock_fingerprint', arguments: { trace: baseline } })));
    assert.match(fingerprinted.fingerprint, /^[a-f0-9]{64}$/);
    const explained = JSON.parse(toolText(await client.callTool({ name: 'behaviorlock_explain', arguments: { baseline, candidate, assertion: 'permission-not-weaker' } })));
    assert.equal(explained.status, 'compatible');
    assert.match(toolText(await client.callTool({ name: 'behaviorlock_render', arguments: { baseline, candidate, format: 'markdown' } })), /Behaviorlock report/);
    const resource = await client.readResource({ uri: 'behaviorlock://schema/trace' });
    const content = resource.contents[0];
    if (!content || !('text' in content)) throw new Error('Expected schema text resource.');
    assert.equal(JSON.parse(content.text).title, 'Behaviorlock Portable Trace');
  } finally { await client.close(); }
});
