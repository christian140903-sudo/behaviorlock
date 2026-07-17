import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { behaviorFingerprint } from './canonical.js';
import { loadContract, loadTrace } from './load.js';
import { renderReport } from './render.js';
import { compareBehavior } from './runtime.js';

export const BEHAVIORLOCK_VERSION = '0.1.0';
const pathsSchema = { baseline: z.string().min(1), candidate: z.string().min(1), contract: z.string().min(1).optional() };

function jsonResult(payload: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }; }

export function createBehaviorlockServer(): McpServer {
  const server = new McpServer(
    { name: 'behaviorlock', version: BEHAVIORLOCK_VERSION },
    { instructions: 'Behaviorlock compares recorded observable behavior. It does not call models, execute agents, inspect hidden reasoning, or decide semantic quality. Use deterministic contracts for tool use, permission decisions, outcomes, structure, sequences, sets, ranks, and numeric budgets. Unknown is not compatible.' },
  );

  server.registerTool('behaviorlock_validate', {
    title: 'Validate Behaviorlock Inputs',
    description: 'Validate a behavior contract and optional portable trace files without comparing them.',
    inputSchema: z.object({ contract: z.string().min(1), traces: z.array(z.string().min(1)).max(100).optional() }),
  }, async ({ contract, traces }) => {
    const loaded = await loadContract(contract);
    const parsedTraces = await Promise.all((traces ?? []).map((path) => loadTrace(path)));
    return jsonResult({ valid: true, project: loaded.contract.project, scenarios: loaded.contract.scenarios.length, traces: parsedTraces.map((item) => ({ candidate: item.trace.run.candidate, scenarios: item.trace.scenarios.length })) });
  });

  server.registerTool('behaviorlock_compare', {
    title: 'Compare Agent Behavior',
    description: 'Compare a baseline and candidate trace against deterministic observable-behavior contracts.',
    inputSchema: z.object(pathsSchema),
  }, async ({ baseline, candidate, contract }) => jsonResult(await compareBehavior(baseline, candidate, contract ?? process.env.BEHAVIORLOCK_CONTRACT ?? 'behaviorlock.json')));

  server.registerTool('behaviorlock_explain', {
    title: 'Explain Behavior Assertion',
    description: 'Compare traces and return one assertion with selected baseline/candidate values and the exact reason.',
    inputSchema: z.object({ ...pathsSchema, assertion: z.string().min(1) }),
  }, async ({ baseline, candidate, contract, assertion }) => {
    const report = await compareBehavior(baseline, candidate, contract ?? process.env.BEHAVIORLOCK_CONTRACT ?? 'behaviorlock.json');
    const result = report.scenarios.flatMap((scenario) => scenario.assertions).find((item) => item.id === assertion);
    return jsonResult(result ?? { error: 'not_found', assertion });
  });

  server.registerTool('behaviorlock_fingerprint', {
    title: 'Fingerprint Observable Behavior',
    description: 'Create a stable SHA-256 fingerprint of scenario status and observations, excluding run metadata.',
    inputSchema: z.object({ trace: z.string().min(1) }),
  }, async ({ trace }) => {
    const loaded = await loadTrace(trace);
    return jsonResult({ runId: loaded.trace.run.id, candidate: loaded.trace.run.candidate, fingerprint: behaviorFingerprint(loaded.trace) });
  });

  server.registerTool('behaviorlock_render', {
    title: 'Render Behavior Report',
    description: 'Compare traces and render JSON, Markdown, standalone HTML, SARIF, or JUnit XML.',
    inputSchema: z.object({ ...pathsSchema, format: z.enum(['json', 'markdown', 'html', 'sarif', 'junit']).default('markdown') }),
  }, async ({ baseline, candidate, contract, format }) => ({ content: [{ type: 'text' as const, text: renderReport(await compareBehavior(baseline, candidate, contract ?? process.env.BEHAVIORLOCK_CONTRACT ?? 'behaviorlock.json'), format) }] }));

  const contractSchema = readFileSync(new URL('../../behaviorlock.schema.json', import.meta.url), 'utf8');
  const traceSchema = readFileSync(new URL('../../trace.schema.json', import.meta.url), 'utf8');
  const exampleContract = readFileSync(new URL('../../examples/behaviorlock.json', import.meta.url), 'utf8');
  server.registerResource('contract-schema', 'behaviorlock://schema/contract', { description: 'Behaviorlock contract JSON Schema', mimeType: 'application/schema+json' }, async () => ({ contents: [{ uri: 'behaviorlock://schema/contract', mimeType: 'application/schema+json', text: contractSchema }] }));
  server.registerResource('trace-schema', 'behaviorlock://schema/trace', { description: 'Portable behavior trace JSON Schema', mimeType: 'application/schema+json' }, async () => ({ contents: [{ uri: 'behaviorlock://schema/trace', mimeType: 'application/schema+json', text: traceSchema }] }));
  server.registerResource('example', 'behaviorlock://example', { description: 'Complete behavior compatibility contract', mimeType: 'application/json' }, async () => ({ contents: [{ uri: 'behaviorlock://example', mimeType: 'application/json', text: exampleContract }] }));
  server.registerPrompt('gate-agent-upgrade', { description: 'Design a deterministic observable-behavior contract before changing an agent' }, async () => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text: 'Before upgrading the model, prompt, memory, or tools, define representative scenarios and record a baseline trace. Contract only observable behavior: tool sequence, arguments after redaction, permission decisions, output structure, postcondition verdicts, and bounded metrics. Avoid hidden reasoning and vague semantic quality. Compare the candidate trace with behaviorlock_compare; report drifted and unknown exactly.' } }] }));
  return server;
}
