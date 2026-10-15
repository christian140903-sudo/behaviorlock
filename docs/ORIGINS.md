# Origin

Behaviorlock extracts a reusable mechanism from Christian Bucher's private
AI-assisted development setup without publishing its identity rules, personal memory,
session logs, hard-coded paths, or subjective scoring weights.

That setup contained an identity-drift monitor, explicit prediction-error loops,
anti-performance checks, permission decisions, quality gates, and recovery
prompts. The valuable general problem was not “score this personality.” It was:
how can an agent change models, prompts, memory, or tools without silently
changing the behaviors people depend on?

A market collision scan found active tools that run model suites and compare
semantic, factual, formatting, and statistical outcomes. Behaviorlock therefore
uses a narrower design: it does not run models or judge semantics. It consumes
portable, already-recorded observations and evaluates explicit deterministic
compatibility contracts. That makes it suitable as a small CI and MCP layer
under any existing evaluation harness.

The working strategy name was Driftglass. That name was rejected before release
because active 2026 repositories already use it for data-pipeline anomaly
detection and generative-art regression testing. Behaviorlock was unoccupied on
npm and GitHub at the pre-release check.
