# Contract Reference

Behaviorlock evaluates assertions grouped by representative scenario. Assertion
IDs are globally unique so CLI and MCP explanation calls are unambiguous.

## Scenario root

Every selector runs against this shape:

```json
{
  "id": "scenario-id",
  "status": "completed",
  "observations": {}
}
```

Use `/status` to contract execution status or `/observations/...` for harness
output. JSON Pointer escaping follows RFC 6901: `~1` represents `/` and `~0`
represents `~`.

## Severity and gates

`error` is the default severity. The default gate requires every error assertion
to be compatible. `--strict` requires warning and info assertions too.

## Status rules

- `compatible`: the matcher relationship is satisfied.
- `drifted`: the candidate contradicts a defined relationship or required
  candidate value is absent.
- `unknown`: the relationship cannot be computed, including a missing baseline
  for a relational matcher or an incompatible value type.

A scenario is drifted if any assertion drifted, otherwise unknown if any
assertion is unknown, otherwise compatible.

## Recording guidance

Keep traces narrow and derived. Good observations include:

- ordered tool names;
- redacted argument keys or schemas;
- explicit allow/ask/deny permission decisions;
- structured output formats and required fields;
- independently checked outcome verdicts;
- latency, token, retry, or cost values with honest single-run limitations.

Do not record secrets, hidden reasoning, complete personal conversations, or
private memory stores merely because JSON can hold them.
