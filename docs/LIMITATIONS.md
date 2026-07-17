# Limitations

- Behaviorlock trusts the supplied trace files. It does not attest that a trace
  came from a particular model, prompt, harness, or production execution.
- It compares declared observations, not hidden reasoning, subjective quality,
  semantic equivalence, factual truth, safety, fairness, or consciousness.
- A passing gate covers only the scenarios and assertions in the contract.
  Missing scenarios and weak selectors can create false confidence.
- New candidate scenarios are unknown for relational matchers until a baseline
  exists. Unknown is intentionally not compatible.
- Numeric comparisons operate on one supplied value per selector. They are not
  statistical benchmarks or significance tests.
- `set_same` ignores duplicate counts and order. Use `sequence_same` when either
  matters.
- A rank order is policy supplied by the contract author, not a universal
  ordering. Reversing it reverses the compatibility decision.
- Behavior fingerprints are content digests, not signatures or provenance
  attestations.
- Reports can contain selected values from traces. Redact sensitive inputs
  before recording or publishing trace files.
- Version `0.1.x` is an early public schema. Incompatible migrations will be
  documented before a stable release.
