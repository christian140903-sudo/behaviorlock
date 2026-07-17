#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from './cli.js';
import { startServer } from './serve.js';

export { behaviorFingerprint, canonicalJson, sha256 } from './canonical.js';
export { evaluateBehavior, evaluateMatcher, summarizeBehavior } from './evaluate.js';
export { loadContract, loadTrace } from './load.js';
export { selectPointer } from './pointer.js';
export { renderHtml, renderJunit, renderMarkdown, renderReport, renderSarif, writeReports } from './render.js';
export { compareBehavior } from './runtime.js';
export { behaviorContractSchema, behaviorTraceSchema, matcherSchema } from './schemas.js';
export { BEHAVIORLOCK_VERSION, createBehaviorlockServer } from './server.js';
export type * from './types.js';

const isMain = process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const command = process.argv[2];
  if (command === 'serve' || (command === undefined && !process.stdin.isTTY)) {
    startServer().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; });
  } else {
    runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; });
  }
}
