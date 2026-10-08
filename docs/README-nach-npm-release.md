# README after the npm release (prepared, not applied)

Prepared on 2026-10-08 for version 0.1.1. Nothing here is live: `README.md`
keeps the release-tarball instructions until `behaviorlock` is actually on npm
(`npm view behaviorlock` returned 404 on 2026-10-08).

## How it is applied

npmjs.com shows the README that is inside the published package. So the swap
happens in the publish checkout, before `npm publish`:

```bash
git apply docs/README-nach-npm-release.patch
```

After a successful publish, the same patch is committed to the repository,
together with the release date in `CHANGELOG.md` and `CITATION.cff`. If
`git apply` refuses, `README.md` changed after the patch was made: nothing is
applied, nothing is published; regenerate the patch from the blocks below.

This file and the patch are excluded from the npm package (`files` in
`package.json`).

## Lines that change in README.md

| Where | Today | After the release |
|---|---|---|
| Badges | GitHub release badge, `v0.1.0` | npm version badge |
| *Try it in two minutes*, first paragraph | "Behaviorlock is not on npm. The commands below use the package attached to the v0.1.0 GitHub release." | "Requires Node.js 20 or newer." only |
| Claude Code command | `npx -y https://github.com/…/behaviorlock-0.1.0.tgz serve` | `npx -y behaviorlock serve` |
| Any MCP client, `args` | tarball URL | `"behaviorlock"` |
| Global install | `npm install -g <tarball URL>` | `npm install -g behaviorlock` |
| *Reports and CI* | "using the release package", `npx -y <tarball URL>` | "using the npm package", `npx -y behaviorlock@0.1.1` (pinned, so a CI gate does not change under you) |
| *TypeScript API* | `npm install <tarball URL>` | `npm install behaviorlock` |
| *What it does not do* | "Known issue in 0.1.0: `compare --strict` prints `PASS` …" | "Fixed in 0.1.1: in 0.1.0, `compare --strict` printed `PASS` …" |
| *Status* | "`0.1.0` as a GitHub release (2026-07-17), not on npm" | "`0.1.1` on npm (first release: 0.1.0 as a GitHub release, 2026-07-17)" |

## Prepared block: Try it in two minutes

````markdown
## Try it in two minutes

Requires Node.js 20 or newer.

**Claude Code** (stdio MCP server):

```bash
claude mcp add behaviorlock -- npx -y behaviorlock serve
```

**Any MCP client:**

```json
{
  "mcpServers": {
    "behaviorlock": {
      "command": "npx",
      "args": ["-y", "behaviorlock", "serve"],
      "env": {
        "BEHAVIORLOCK_CONTRACT": "/absolute/path/to/behaviorlock.json"
      }
    }
  }
}
```
````

(The patch keeps the existing one-entry-per-line layout of `args`; the block
above is the same content.)

## Outside README.md

- `CHANGELOG.md`: `## 0.1.1 — unreleased` becomes the publish date (the
  publish commands set it in the publish checkout).
- `CITATION.cff`: `version: 0.1.1`, `date-released: <publish date>` (not part
  of the npm package; commit after the publish).
- Profile README (`christian140903-sudo/christian140903-sudo`): status and
  table can say "on npm" for behaviorlock once `npm view behaviorlock version`
  prints `0.1.1`.
- Optional, separate decision: a `v0.1.1` tag and GitHub release on the
  published commit; listing in the MCP Registry (`server.json` and `mcpName`
  are ready for it).
