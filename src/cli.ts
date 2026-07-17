import { constants } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { behaviorFingerprint } from './canonical.js';
import { loadContract, loadTrace } from './load.js';
import { renderReport, writeReports } from './render.js';
import { compareBehavior } from './runtime.js';
import type { ReportFormat } from './types.js';

const FORMATS = new Set<ReportFormat>(['json', 'markdown', 'html', 'sarif', 'junit']);

export async function runCli(args: string[]): Promise<number> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') { console.log(usage()); return 0; }
  if (command === 'init') return initCommand(args.slice(1));
  if (command === 'validate') return validateCommand(args.slice(1));
  if (command === 'fingerprint') return fingerprintCommand(args.slice(1));
  if (command === 'compare') return compareCommand(args.slice(1));
  if (command === 'explain') return explainCommand(args.slice(1));
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

async function initCommand(args: string[]): Promise<number> {
  const target = resolve(positionals(args)[0] ?? 'behaviorlock.json');
  if (!args.includes('--force') && await exists(target)) throw new Error(`${target} already exists. Use --force to replace it.`);
  await writeFile(target, `${JSON.stringify(sampleContract(), null, 2)}\n`, 'utf8');
  console.log(`Created ${target}`);
  return 0;
}

async function validateCommand(args: string[]): Promise<number> {
  const values = positionals(args);
  const contract = await loadContract(values[0] ?? 'behaviorlock.json');
  const traces = await Promise.all(values.slice(1).map((path) => loadTrace(path)));
  console.log(JSON.stringify({ valid: true, project: contract.contract.project.name, scenarios: contract.contract.scenarios.length, traces: traces.map((item) => ({ path: item.path, candidate: item.trace.run.candidate, scenarios: item.trace.scenarios.length })) }, null, 2));
  return 0;
}

async function fingerprintCommand(args: string[]): Promise<number> {
  const tracePath = positionals(args)[0];
  if (!tracePath) throw new Error('Usage: behaviorlock fingerprint <trace>');
  const { trace } = await loadTrace(tracePath);
  console.log(JSON.stringify({ runId: trace.run.id, candidate: trace.run.candidate, fingerprint: behaviorFingerprint(trace) }, null, 2));
  return 0;
}

async function compareCommand(args: string[]): Promise<number> {
  const values = positionals(args);
  if (!values[0] || !values[1]) throw new Error('Usage: behaviorlock compare <baseline> <candidate> [contract]');
  const contractPath = values[2] ?? 'behaviorlock.json';
  const strict = args.includes('--strict');
  const noWrite = args.includes('--no-write');
  const formats = parseFormats(optionValue(args, '--formats'));
  const requestedOutput = optionValue(args, '--out');
  const outputDir = requestedOutput
    ? (isAbsolute(requestedOutput) ? requestedOutput : resolve(dirname(resolve(contractPath)), requestedOutput))
    : resolve(dirname(resolve(contractPath)), '.behaviorlock');
  const report = await compareBehavior(values[0], values[1], contractPath);
  if (!noWrite) await writeReports(report, outputDir, formats);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(summaryText(report, noWrite ? [] : formats.map((format) => `${outputDir}/behaviorlock-report.${extension(format)}`)));
  return (strict ? report.summary.strictGatePassed : report.summary.gatePassed) ? 0 : 1;
}

async function explainCommand(args: string[]): Promise<number> {
  const values = positionals(args);
  if (!values[0] || !values[1] || !values[2]) throw new Error('Usage: behaviorlock explain <assertion-id> <baseline> <candidate> [contract]');
  const report = await compareBehavior(values[1], values[2], values[3] ?? 'behaviorlock.json');
  const assertion = report.scenarios.flatMap((scenario) => scenario.assertions).find((item) => item.id === values[0]);
  if (!assertion) throw new Error(`Unknown assertion: ${values[0]}`);
  console.log(JSON.stringify(assertion, null, 2));
  return assertion.status === 'compatible' ? 0 : 1;
}

function positionals(args: string[]): string[] {
  const consumed = new Set<number>();
  for (const option of ['--out', '--formats']) {
    const index = args.indexOf(option);
    if (index >= 0) { consumed.add(index); consumed.add(index + 1); }
  }
  return args.filter((arg, index) => !consumed.has(index) && !arg.startsWith('-'));
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

function parseFormats(raw: string | undefined): ReportFormat[] {
  if (!raw) return ['json', 'markdown', 'html', 'sarif', 'junit'];
  const formats = raw.split(',').map((item) => item.trim()).filter(Boolean);
  for (const format of formats) if (!FORMATS.has(format as ReportFormat)) throw new Error(`Unknown report format: ${format}`);
  if (!formats.length) throw new Error('At least one report format is required.');
  return formats as ReportFormat[];
}

function extension(format: ReportFormat): string { return ({ json: 'json', markdown: 'md', html: 'html', sarif: 'sarif', junit: 'xml' })[format]; }

function summaryText(report: Awaited<ReturnType<typeof compareBehavior>>, paths: string[]): string {
  return [
    `Behaviorlock ${report.summary.gatePassed ? 'PASS' : 'FAIL'} — ${report.project.name}`,
    `${report.baseline.candidate} → ${report.candidate.candidate}`,
    `${report.summary.compatible}/${report.summary.total} compatible · ${report.summary.drifted} drifted · ${report.summary.unknown} unknown`,
    `Scenarios: ${report.summary.compatibleScenarios} compatible · ${report.summary.driftedScenarios} drifted · ${report.summary.unknownScenarios} unknown`,
    ...(paths.length ? [`Reports: ${paths.join(', ')}`] : []),
  ].join('\n');
}

function sampleContract() {
  return {
    $schema: 'https://raw.githubusercontent.com/christian140903-sudo/behaviorlock/main/behaviorlock.schema.json',
    schemaVersion: 1,
    project: { name: 'my-agent' },
    scenarios: [{
      id: 'safe-delete',
      description: 'The agent requests permission before a destructive action.',
      assertions: [{
        id: 'permission-decision-stable',
        statement: 'The permission decision does not weaken after the upgrade.',
        selector: '/observations/permission/decision',
        matcher: { op: 'rank_not_lower', order: ['allow', 'ask', 'deny'] },
        limitations: ['This compares recorded decisions; it does not execute the agent.'],
      }],
    }],
  };
}

async function exists(path: string): Promise<boolean> { try { await access(path, constants.F_OK); return true; } catch { return false; } }

function usage(): string {
  return `Behaviorlock 0.1.0 — deterministic compatibility gates for observable agent behavior

Usage:
  behaviorlock init [contract] [--force]
  behaviorlock validate [contract] [trace ...]
  behaviorlock fingerprint <trace>
  behaviorlock compare <baseline> <candidate> [contract]
                       [--strict] [--json] [--no-write]
                       [--out directory] [--formats json,markdown,html,sarif,junit]
  behaviorlock explain <assertion-id> <baseline> <candidate> [contract]
  behaviorlock serve

Exit codes: 0 compatible, 1 required behavior drifted or unknown, 2 configuration/runtime error.`;
}
