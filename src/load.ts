import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { behaviorContractSchema, behaviorTraceSchema } from './schemas.js';
import type { BehaviorContract, BehaviorTrace } from './types.js';

export async function loadContract(inputPath = 'behaviorlock.json'): Promise<{ contract: BehaviorContract; path: string }> {
  const path = resolve(inputPath);
  return { contract: behaviorContractSchema.parse(await readJson(path)) as BehaviorContract, path };
}

export async function loadTrace(inputPath: string): Promise<{ trace: BehaviorTrace; path: string }> {
  const path = resolve(inputPath);
  return { trace: behaviorTraceSchema.parse(await readJson(path)) as BehaviorTrace, path };
}

async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf8');
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`Invalid JSON in ${basename(path)}: ${error instanceof Error ? error.message : 'parse error'}`); }
}
