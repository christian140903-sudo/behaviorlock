# Security Model

## Intended use

Behaviorlock is a local CLI, TypeScript library, CI gate, and stdio MCP server.
It reads explicit JSON contract and trace paths, evaluates deterministic
matchers, and optionally writes reports.

## Execution boundary

- No model or provider is called.
- No network request is made by the comparison runtime.
- No arbitrary command, plugin, expression, template, regex, or user JavaScript
  is executed.
- Selectors are RFC 6901 JSON Pointers, not JSONPath expressions.
- Input size is ultimately bounded by the local process memory; schema arrays
  have explicit item limits, but file bytes are not currently streamed.

## Trust boundaries

1. The contract author is trusted to choose meaningful scenarios, selectors,
   severities, rank orders, and budgets.
2. Trace JSON is untrusted data but trusted evidence provenance. Validation
   prevents executable values, not fabricated observations.
3. The MCP client can request any local JSON path the process can read. Run the
   server with least-privilege filesystem access.
4. Generated HTML and XML escape report-controlled strings. JSON and Markdown
   remain data artifacts and should be reviewed before publication.
5. SHA-256 fingerprints detect content changes; they do not identify the author
   or prove when and where a trace was produced.

## Privacy

Behaviorlock does not need raw prompts, responses, chain-of-thought, credentials,
or personal memory. Prefer small derived observations such as tool names,
redacted argument shapes, permission decisions, format labels, externally
verified verdicts, and bounded metrics.
