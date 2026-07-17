# Security Policy

Security fixes target the latest `0.1.x` release while the public schemas evolve.

Report suspected vulnerabilities through GitHub's private security-advisory flow
for `christian140903-sudo/behaviorlock`. Do not include real credentials,
private prompts, personal memory, or production traces in a report.

The comparison runtime does not call models, access the network, or execute
commands. The stdio MCP server can read paths explicitly supplied by its client;
run it with least-privilege filesystem access. Review reports before publishing
because selected trace values can appear in output artifacts.
