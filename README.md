# Behaviorlock

**Fails your CI when an agent's recorded behavior drifts after a model, prompt, memory, or tool change.**

[![CI](https://github.com/christian140903-sudo/behaviorlock/actions/workflows/ci.yml/badge.svg)](https://github.com/christian140903-sudo/behaviorlock/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/christian140903-sudo/behaviorlock?display_name=tag)](https://github.com/christian140903-sudo/behaviorlock/releases/tag/v0.1.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-53e6a7.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-53e6a7.svg)](package.json)

Behaviorlock compares two runs your harness already recorded, a baseline and a
candidate, against a contract of behaviors that must stay stable: tool
sequences, permission decisions, output structure, outcome verdicts, sets,
ranks, and bounded numeric metrics. It is for teams that change the model,
prompt, memory, policy, or tools under an existing agent. It does not call a
model, judge prose, or inspect hidden reasoning.

**If you maintain skills without writing code:** Behaviorlock does not read your
prompts or judge your texts. It compares values your tooling already records
before and after a change — and tells you which of the ones you declared
important moved further than you allow. Example: a newsletter skill after a
model update. Your harness records the length, whether the call to action is
present and which salutation was used. The contract says: length may vary by
20 %, the call to action must stay, the salutation must be one of the allowed
forms. Behaviorlock reports each of these as compatible, drifted or unknown — in
plain sentences you wrote yourself, such as *"The call to action is still
present"* or *"The permission decision does not weaken after upgrade."*
Behaviorlock does not interpret those sentences; the check itself is a short
JSON rule next to each one (see *The contract* below).

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

## Try it in two minutes

Behaviorlock is not on npm. The commands below use the package attached to the
[v0.1.0 GitHub release](https://github.com/christian140903-sudo/behaviorlock/releases/tag/v0.1.0).
Requires Node.js 20 or newer.

**Claude Code** (stdio MCP server):

```bash
claude mcp add behaviorlock -- npx -y https://github.com/christian140903-sudo/behaviorlock/releases/download/v0.1.0/behaviorlock-0.1.0.tgz serve
```

**Any MCP client:**

```json
{
  "mcpServers": {
    "behaviorlock": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/christian140903-sudo/behaviorlock/releases/download/v0.1.0/behaviorlock-0.1.0.tgz",
        "serve"
      ],
      "env": {
        "BEHAVIORLOCK_CONTRACT": "/absolute/path/to/behaviorlock.json"
      }
    }
  }
}
```

`BEHAVIORLOCK_CONTRACT` is optional. The server offers the prompt
`gate-agent-upgrade`, which walks the agent through defining scenarios,
recording a baseline, and comparing a candidate with `behaviorlock_compare`.
The tools read the file paths the client passes to them.

### See a pass and a drift on the bundled example

```bash
git clone https://github.com/christian140903-sudo/behaviorlock.git && cd behaviorlock
npm ci && npm run build
node dist/src/index.js compare \
  examples/baseline.trace.json \
  examples/candidate.trace.json \
  examples/behaviorlock.json --no-write
```

```text
Behaviorlock PASS — Support agent upgrade
model-a / prompt-v3 → model-b / prompt-v4
6/7 compatible · 0 drifted · 1 unknown
Scenarios: 2 compatible · 0 drifted · 1 unknown
```

Between the two runs the candidate tightened a permission (`ask` → `deny`),
answered in Markdown instead of JSON (both allowed), called the same two tools
in a different order, and got 18 % slower (budget: 25 %). None of that breaks
the contract. One scenario exists only in the candidate; it is reported as
`unknown`, not as compatible. The default gate passes because every `error`
assertion is compatible; `--strict` also requires the warning and info
assertions and therefore fails on that `unknown`.

Now weaken the permission instead and run the same check:

```bash
sed 's/"deny"/"allow"/' examples/candidate.trace.json > drifted.trace.json
node dist/src/index.js compare \
  examples/baseline.trace.json drifted.trace.json examples/behaviorlock.json --no-write
echo "exit code: $?"
```

```text
Behaviorlock FAIL — Support agent upgrade
model-a / prompt-v3 → model-b / prompt-v4
5/7 compatible · 1 drifted · 1 unknown
Scenarios: 1 compatible · 1 drifted · 1 unknown
exit code: 1
```

`node dist/src/index.js explain permission-not-weaker examples/baseline.trace.json drifted.trace.json examples/behaviorlock.json`
prints the one assertion with both selected values (`ask`, `allow`) and the
reason: `Candidate rank is worse than baseline.`

Without `--no-write`, `compare` also writes all five report formats to
`.behaviorlock/` next to the contract.

To get a `behaviorlock` command without a clone:
`npm install -g https://github.com/christian140903-sudo/behaviorlock/releases/download/v0.1.0/behaviorlock-0.1.0.tgz`.

## Why it exists

When you swap the model under an agent, rewrite its prompt, or add a tool, most
of its behavior may change, but some of it must not: it still asks before
deleting, still calls tools in the approved order, still returns a format your
code can parse. A manual spot check covers some of that once; Behaviorlock
repeats the same declared checks on every change.

A golden-file diff of the two bundled traces flags every difference: the stricter
permission, the new format, the reordered tools, the latency change, and the new
scenario. It treats `ask → deny` (stricter, fine) and `ask → allow` (weaker, not
fine) the same way: as a difference. Behaviorlock checks only what the contract
declares, in the direction the contract gives.

Model-evaluation platforms are useful when a team wants to run providers, score
semantic quality, or use an LLM judge. Behaviorlock owns a smaller layer:
**given two already-recorded runs, did the declared observable behavior remain
compatible?** In practice that means:

- no provider API keys, model adapters, prompts, or network calls;
- no judge model that can change the final answer;
- no hidden chain-of-thought capture;
- no arbitrary shell execution;
- the same JSON inputs always produce the same statuses and fingerprints;
- a new scenario without a baseline is `unknown`, not silently compatible.

**Behaviorlock or [agent-invariants](https://github.com/christian140903-sudo/agent-invariants)?**
Both compare a baseline with a candidate, and both are mine. agent-invariants
checks rules over an ordered event stream inside a run (approval before a
payment tool, no work after a stop, retry limits). Behaviorlock compares values
you chose to record (a decision, a tool list, a verdict, a number) between two
runs. Use agent-invariants when the rule is about the order of events; use
Behaviorlock when the question is whether a recorded value moved in a direction
you declared unacceptable.

## How it works

### The portable trace

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

### The contract

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

### Deterministic matchers

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

### CLI

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

From a clone, use `node dist/src/index.js` in place of `behaviorlock`.

Exit codes:

- `0`: every `error` assertion is compatible;
- `1`: required behavior drifted or is unknown;
- `2`: invalid input or runtime failure.

### Reports and CI

- JSON carries the complete machine-readable comparison and report digest.
- Markdown is designed for upgrade review and pull requests.
- HTML is standalone, escaped, and marked `noindex`.
- SARIF lists drifted and unknown assertions as findings.
- JUnit maps drift to failures and unknowns to skipped tests.

A CI step in your own project, using the release package:

```yaml
- run: >
    npx -y https://github.com/christian140903-sudo/behaviorlock/releases/download/v0.1.0/behaviorlock-0.1.0.tgz
    compare baseline.trace.json candidate.trace.json behaviorlock.json
    --formats markdown,sarif,junit --out behaviorlock-reports
```

The step fails when required behavior drifted or is unknown (exit code `1`) and
on invalid input (exit code `2`).

### MCP server

The stdio server (see *Try it in two minutes*) exposes five tools:

- `behaviorlock_validate`
- `behaviorlock_compare`
- `behaviorlock_explain`
- `behaviorlock_fingerprint`
- `behaviorlock_render`

It also exposes the contract schema, trace schema, bundled example, and the
`gate-agent-upgrade` prompt. From a clone, you can point a client at
`node /absolute/path/to/behaviorlock/dist/src/index.js serve` after
`npm ci && npm run build`.

### TypeScript API

After `npm install https://github.com/christian140903-sudo/behaviorlock/releases/download/v0.1.0/behaviorlock-0.1.0.tgz`:

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

## Verify it yourself

```bash
git clone https://github.com/christian140903-sudo/behaviorlock.git && cd behaviorlock
npm ci && npm test        # expected: 73 passing (last verified 2026-10-08, Node 22, fresh clone)
```

What the 73 tests cover: all nine matchers including their `unknown` cases and
the default and strict gates; JSON Pointer selection and schema validation of
contracts and traces; the comparison runtime, fingerprints, and all five report
formats; the CLI commands with exit codes `0`, `1` and `2`; and the stdio MCP
server end to end (tools, resources, prompt, a comparison over stdio).

What they do not cover: no real agent or model run (all traces are small
hand-written fixtures); no CLI test with a drifted `error` assertion (drift is
tested at the function level; the drift example above runs it through the CLI);
SARIF and JUnit output are checked for content, not validated against the
official schemas or uploaded to a code-scanning service; CI runs on Linux only
(Node 20, 22, 24); no tests with large traces.

The drift example in *Try it in two minutes* triggers the failure case on your
machine. Two more checks:

```bash
npm run test:coverage   # same tests with Node's coverage report
npm run smoke:pack      # packs the package, installs it in a temp project, runs the CLI and imports the SDK
```

## What it does not do

- **It does not record traces or run your agent.** Your harness writes the
  JSON, and Behaviorlock trusts it: it does not attest that a trace came from a
  particular model, prompt, harness, or production run.
- **It does not judge quality.** No semantic equivalence, factual truth,
  safety, fairness, or hidden reasoning. A passing gate covers only the
  scenarios and assertions in the contract; missing scenarios and weak
  selectors create false confidence.
- **It does not prevent drift; it reports it.** Whether a drifted run blocks a
  release depends on how you wire the exit code into CI.
- **Numbers are single values, not benchmarks.** `number_delta` compares one
  recorded value per selector, with no statistics.
- **Fingerprints are content digests**, not signatures or provenance.
- **Known issue in 0.1.0:** `compare --strict` prints `PASS` in the summary
  line when only the default gate passed, but correctly exits with `1`. Rely on
  the exit code.

Details: [limitations](docs/LIMITATIONS.md), [security model](docs/SECURITY-MODEL.md),
[contract reference](docs/CONTRACTS.md).

## How this was built

Most of the code was written by AI coding agents under my direction. I wrote the
specification, set the constraints, decided what to test, reviewed the result
and rejected what did not hold. Release decisions and every claim in this README
are mine.

The public history starts at the finished 0.1.0 code (one commit on
2026-07-17); the agent sessions behind it are not published. The idea comes
from a private agent system of mine; this repository extracts the general
mechanism without that system's rules, memory, or logs
([ORIGINS.md](docs/ORIGINS.md)).

## Status

`0.1.0` as a GitHub release (2026-07-17), not on npm · experimental · single
maintainer · no known external users · last verified 2026-10-08.

Referenced by MediaPlural/agent-proven: its
[`agent-regression` skill](https://github.com/MediaPlural/agent-proven/blob/fe920e4/skills/agent-regression/SKILL.md)
points to Behaviorlock for deterministic trace comparison. That is a pointer in
another project's documentation, not a usage report.

Version `0.1.x` is an early public schema; incompatible changes will be
documented before a stable release. Please report security issues through the
private process in [SECURITY.md](SECURITY.md).

## License

MIT © Christian Bucher
