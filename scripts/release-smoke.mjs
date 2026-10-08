import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, options);
    let stdout = '', stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`)));
  });
}

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { version } = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
const serverJson = JSON.parse(await readFile(join(projectRoot, 'server.json'), 'utf8'));
assert.equal(serverJson.version, version, 'server.json version must match package.json');
assert.ok(serverJson.packages.every((item) => item.version === version), 'server.json package versions must match package.json');
const scratch = await mkdtemp(join(tmpdir(), 'behaviorlock-pack-'));
let tarball;
try {
  const packed = await run('npm', ['pack', '--json', '--ignore-scripts'], { cwd: projectRoot });
  const metadata = JSON.parse(packed.stdout);
  assert.equal(metadata.length, 1);
  tarball = join(projectRoot, metadata[0].filename);
  const names = metadata[0].files.map((file) => file.path);
  for (const required of ['dist/src/index.js', 'dist/src/index.d.ts', 'README.md', 'behaviorlock.schema.json', 'trace.schema.json', 'examples/behaviorlock.json', 'server.json']) assert.ok(names.includes(required), `packed artifact is missing ${required}`);
  await writeFile(join(scratch, 'package.json'), '{"name":"behaviorlock-smoke","private":true,"type":"module"}\n');
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: scratch });
  const help = await run(join(scratch, 'node_modules', '.bin', 'behaviorlock'), ['--help'], { cwd: scratch });
  assert.match(help.stdout, /deterministic compatibility gates/i);
  assert.ok(help.stdout.startsWith(`Behaviorlock ${version} `), `help must name version ${version}`);
  await run(process.execPath, ['--input-type=module', '--eval', `import { BEHAVIORLOCK_VERSION, selectPointer } from 'behaviorlock'; if (BEHAVIORLOCK_VERSION !== '${version}' || selectPointer({a:1}, '/a').value !== 1) process.exit(1);`], { cwd: scratch });
  const installed = JSON.parse(await readFile(join(scratch, 'node_modules', 'behaviorlock', 'package.json'), 'utf8'));
  assert.equal(installed.version, version);
  console.log(`Release smoke passed: ${basename(tarball)} (${names.length} files)`);
} finally {
  if (tarball) await rm(tarball, { force: true });
  await rm(scratch, { recursive: true, force: true });
}
