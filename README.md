# Behaviorlock

**Upgrade the model. Keep the agent's promises.**

Behaviorlock is a deterministic compatibility gate for observable AI-agent
behavior. Record framework-neutral traces before and after a model, prompt,
memory, policy, or tool change; then contract the behaviors that must stay
stable: tool sequences, permission decisions, output structure, outcome
verdicts, sets, ranks, and bounded numeric metrics.

[![CI](https://github.com/christian140903-sudo/behaviorlock/actions/workflows/ci.yml/badge.svg)](https://github.com/christian140903-sudo/behaviorlock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-53e6a7.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-53e6a7.svg)](package.json)

```text
representative scenarios
          │
          ├── baseline.trace.json  (model A / prompt v3)
          └── candidate.trace.json (model B / prompt v4)
                          │
                          ▼
                  behaviorlock.json
             selectors + deterministic matchers
                          │
                          ▼
      compatible · drifted · unknown + CI gate
                          │
                          ▼
        JSON · Markdown · HTML · SARIF · JUnit
```

Behaviorlock does not call a model, judge prose semantically, or inspect hidden
reasoning. Your existing harness produces JSON observations. Behaviorlock makes
the compatibility decision reproducible and reviewable.

## Why another behavior tool?

Model-evaluation platforms are useful when a team wants to run providers,
score semantic quality, or use an LLM judge. Behaviorlock owns a smaller layer:
**given two already-recorded runs, did the declared observable behavior remain
compatible?**

That boundary has practical consequences:

- no provider API keys, model adapters, prompts, or network calls;
- no judge model that can change the final answer;
- no hidden chain-of-thought capture;
- no arbitrary shell execution;
- the same JSON inputs always produce the same statuses and fingerprints;
- a new scenario without a baseline is `unknown`, not silently compatible.

## Quick start

Requires Node.js 20 or newer.

```bash
git clone https://github.com/christian140903-sudo/behaviorlock.git
cd behaviorlock
npm ci
npm test
node dist/src/index.js compare \
  examples/baseline.trace.json \
  examples/candidate.trace.json \
  examples/behaviorlock.json
```

The bundled comparison has six compatible assertions and one honest unknown.
The default gate passes because required behavior is compatible; `--strict`
also requires warning and informational assertions.

## The portable trace

Any framework can emit the trace. Behaviorlock only requires scenario status
and JSON observations:

```json
{
  "$schema": "https://raw.githubusercontent.com/christian140903-sudo/behaviorlock/main/trace.schema.json",
  "traceVersion": 1,
  "run": { "id": "candidate-001", "candidate": "model-b / prompt-v4" },
  "scenarios": [
    {
      "id": "destructive-action",
      "status": "completed",
      "observations": {
        "permission": { "decision": "deny" },
        "tools": ["request_permission", "delete_item", "verify_absence"],
        "outcome": { "verdict": "satisfied" }
      }
    }
  ]
}
```

Trace metadata is excluded from the behavior fingerprint. Scenario order is
normalized; array order inside observations remains behavior and is preserved.

Review and redact traces before storing them. Behaviorlock deliberately does
not collect provider transcripts for you.

## The contract

```json
{
  "$schema": "https://raw.githubusercontent.com/christian140903-sudo/behaviorlock/main/behaviorlock.schema.json",
  "schemaVersion": 1,
  "project": { "name": "support-agent" },
  "scenarios": [
    {
      "id": "destructive-action",
      "assertions": [
        {
          "id": "permission-not-weaker",
          "statement": "The permission decision does not weaken after upgrade.",
          "severity": "error",
          "selector": "/observations/permission/decision",
          "matcher": {
            "op": "rank_not_lower",
            "order": ["allow", "ask", "deny"]
          },
          "limitations": [
            "This compares recorded decisions; it does not prove every destructive prompt was tested."
          ]
        }
      ]
    }
  ]
}
```

Selectors are RFC 6901 JSON Pointers evaluated against the whole scenario, so
contracts can observe `/status` as well as `/observations/...`.

## Deterministic matchers

| Matcher | Candidate is compatible when |
|---|---|
| `exists` | the selector resolves, including explicit `null` |
| `equals` | it structurally equals a contract value |
| `same` | it structurally equals the baseline value |
| `contains` | a string contains text or an array contains a JSON value |
| `allowlist` | it structurally equals one allowed value |
| `set_same` | its array has the same unique members, ignoring order |
| `sequence_same` | its array preserves exact order and values |
| `number_delta` | absolute and/or relative drift stays within budget |
| `rank_not_lower` | its configured rank is equal to or better than baseline |

Relational matchers return `unknown` when the baseline selector is absent.
Type mismatches that make a comparison undefined also return `unknown`.

## CLI

```bash
behaviorlock init
behaviorlock validate behaviorlock.json baseline.json candidate.json
behaviorlock fingerprint candidate.json
behaviorlock compare baseline.json candidate.json behaviorlock.json
behaviorlock compare baseline.json candidate.json behaviorlock.json --strict
behaviorlock compare baseline.json candidate.json behaviorlock.json \
  --formats json,markdown,html,sarif,junit --out artifacts
behaviorlock explain permission-not-weaker baseline.json candidate.json behaviorlock.json
```

Exit codes:

- `0`: every `error` assertion is compatible;
- `1`: required behavior drifted or is unknown;
- `2`: invalid input or runtime failure.

## Reports and CI

- JSON carries the complete machine-readable comparison and report digest.
- Markdown is designed for upgrade review and pull requests.
- HTML is standalone, escaped, and marked `noindex`.
- SARIF exposes drift and unknowns to code-scanning interfaces.
- JUnit maps drift to failures and unknowns to skipped tests.

```yaml
- run: npm ci
- run: npm test
- run: node dist/src/index.js compare baseline.json candidate.json behaviorlock.json
```

## MCP server

From a clone, build once and point an MCP client at the absolute entry path:

```json
{
  "mcpServers": {
    "behaviorlock": {
      "command": "node",
      "args": ["/absolute/path/to/behaviorlock/dist/src/index.js", "serve"],
      "env": {
        "BEHAVIORLOCK_CONTRACT": "/absolute/path/to/behaviorlock.json"
      }
    }
  }
}
```

The stdio server exposes five tools:

- `behaviorlock_validate`
- `behaviorlock_compare`
- `behaviorlock_explain`
- `behaviorlock_fingerprint`
- `behaviorlock_render`

It also exposes the contract schema, trace schema, bundled example, and the
`gate-agent-upgrade` prompt.

## TypeScript API

```ts
import { compareBehavior, renderReport } from 'behaviorlock';

const report = await compareBehavior(
  './baseline.trace.json',
  './candidate.trace.json',
  './behaviorlock.json',
);

console.log(report.summary.gatePassed);
console.log(renderReport(report, 'markdown'));
```

## Trust boundary

Behaviorlock proves that two supplied traces satisfy a declared deterministic
relationship. It does not prove trace authenticity, scenario coverage, model
quality, safety, fairness, or production correctness. A harness can record the
wrong thing; a narrow contract can omit important behavior; redacted traces can
lose context. Limitations belong next to each assertion for exactly this reason.

Read the [security model](docs/SECURITY-MODEL.md),
[limitations](docs/LIMITATIONS.md), [contract reference](docs/CONTRACTS.md),
and [origin](docs/ORIGINS.md).

## Development

```bash
npm install
npm test
npm run test:coverage
npm run smoke:pack
```

MIT licensed. Created by Christian Bucher; developed with AI assistance under
human direction and review.
