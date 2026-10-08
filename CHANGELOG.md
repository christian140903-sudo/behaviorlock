# Changelog

## Unreleased

- Raise the `@modelcontextprotocol/sdk` floor to `^1.32.1` and refresh the
  lockfile. `npm audit` on a fresh clone goes from 7 findings (1 critical,
  3 high, 3 moderate; all transitive through the SDK's HTTP and OAuth parts,
  which the stdio server does not use) to 0. Installs from the v0.1.0 release
  tarball already resolve SDK 1.32.1, since the tarball carries no lockfile.

## 0.1.0 — 2026-07-17

- Define a framework-neutral portable behavior-trace format.
- Compare observable behavior with nine deterministic matcher types.
- Preserve honest compatible, drifted, and unknown states.
- Gate required behavior separately from advisory assertions.
- Generate stable behavior fingerprints and report digests.
- Export JSON, Markdown, standalone HTML, SARIF, and JUnit XML.
- Provide CLI, TypeScript SDK, JSON Schemas, and stdio MCP server surfaces.
