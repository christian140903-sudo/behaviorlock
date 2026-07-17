import { z } from 'zod';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema),
]));

const idSchema = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/);
const pointerSchema = z.string().max(4_000).refine((value) => value === '' || value.startsWith('/'), 'Selector must be an RFC 6901 JSON Pointer.');

export const matcherSchema = z.union([
  z.object({ op: z.literal('exists') }).strict(),
  z.object({ op: z.literal('equals'), value: jsonValueSchema }).strict(),
  z.object({ op: z.literal('same') }).strict(),
  z.object({ op: z.literal('contains'), value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]) }).strict(),
  z.object({ op: z.literal('allowlist'), values: z.array(jsonValueSchema).min(1).max(500) }).strict(),
  z.object({ op: z.literal('set_same') }).strict(),
  z.object({ op: z.literal('sequence_same') }).strict(),
  z.object({ op: z.literal('number_delta'), maxAbsolute: z.number().finite().nonnegative().optional(), maxRelative: z.number().finite().nonnegative().optional() }).strict()
    .refine((value) => value.maxAbsolute !== undefined || value.maxRelative !== undefined, 'number_delta requires maxAbsolute or maxRelative.'),
  z.object({ op: z.literal('rank_not_lower'), order: z.array(z.string().min(1).max(200)).min(2).max(100) }).strict()
    .refine((value) => new Set(value.order).size === value.order.length, 'rank order values must be unique.'),
]);

const assertionSchema = z.object({
  id: idSchema,
  statement: z.string().trim().min(5).max(20_000),
  severity: z.enum(['error', 'warning', 'info']).optional(),
  selector: pointerSchema,
  matcher: matcherSchema,
  limitations: z.array(z.string().trim().min(1).max(4_000)).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
}).strict();

const scenarioContractSchema = z.object({
  id: idSchema,
  description: z.string().trim().min(1).max(4_000).optional(),
  assertions: z.array(assertionSchema).min(1).max(200),
}).strict();

export const behaviorContractSchema = z.object({
  $schema: z.string().url().optional(),
  schemaVersion: z.literal(1),
  project: z.object({ name: z.string().trim().min(1).max(500), repository: z.string().url().optional() }).strict(),
  scenarios: z.array(scenarioContractSchema).min(1).max(500),
}).strict().superRefine((contract, context) => {
  const scenarios = new Set<string>();
  const assertions = new Set<string>();
  for (const [scenarioIndex, scenario] of contract.scenarios.entries()) {
    if (scenarios.has(scenario.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate scenario id: ${scenario.id}`, path: ['scenarios', scenarioIndex, 'id'] });
    scenarios.add(scenario.id);
    for (const [assertionIndex, assertion] of scenario.assertions.entries()) {
      if (assertions.has(assertion.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate assertion id: ${assertion.id}`, path: ['scenarios', scenarioIndex, 'assertions', assertionIndex, 'id'] });
      assertions.add(assertion.id);
    }
  }
});

const scenarioTraceSchema = z.object({
  id: idSchema,
  status: z.enum(['completed', 'error', 'skipped']),
  observations: z.record(jsonValueSchema),
}).strict();

export const behaviorTraceSchema = z.object({
  $schema: z.string().url().optional(),
  traceVersion: z.literal(1),
  run: z.object({
    id: z.string().trim().min(1).max(500),
    candidate: z.string().trim().min(1).max(500),
    createdAt: z.string().datetime().optional(),
    metadata: z.record(jsonValueSchema).optional(),
  }).strict(),
  scenarios: z.array(scenarioTraceSchema).max(5_000),
}).strict().superRefine((trace, context) => {
  const ids = new Set<string>();
  for (const [index, scenario] of trace.scenarios.entries()) {
    if (ids.has(scenario.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate scenario id: ${scenario.id}`, path: ['scenarios', index, 'id'] });
    ids.add(scenario.id);
  }
});
