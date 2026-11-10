# Generation improvements — October 8, 2026

## Implemented behavior

- Optional structured context and stable requirement IDs, explicit mapping/unmapped criteria, and duplicate warnings.
- Nonempty expected results/manual steps and references validated against the requirement catalog.
- Full supported assertion vocabulary in the generation prompt; no registration-specific shared instruction.
- Independent case validation, one targeted repair, accepted-case retention, protected expected outcomes, and manual fallback when page evidence is unavailable.
- Exact-URL inspection cache with explicit refresh, relevant-control ranking, form scopes, and expanded bounded field metadata.
- Controlled same-origin page captures with optional private authentication, required setup descriptions, bounds and expiry.
- Generation jobs with progress, cancellation, reload/reconnect recovery, and timing/repair/cache metrics.
- Selected regeneration preserving untouched cases/review states in a new revision. Revision conflicts, changed outcomes, incomplete replacements, and failed persistence preserve the original revision.
- Separate provider, quality, job, inspection, and state modules; changed code and related compiler/schema modules formatted for readability.
- Deterministic benchmark corpus and opt-in real-provider benchmark, with raw output reports for human review.

The service remains loopback-only. No remote publication or deployment was performed.

## Review and bug fixes

A fresh independent reviewer identified envelope repair losing original expectations, reconnect overwriting newer edits, and unavailable state selections becoming impossible to clear. Those were fixed and rechecked. Additional reproductions cover malformed expected-value types, changed expectations during regeneration, save failures advancing the in-memory revision, saved multiline criteria collapsing during reload, duplicate capture starts, and expired capture recovery.

Legacy test fixtures were updated to use requirement IDs and generation job endpoints. Existing UI assertions, execution verdicts, and expected product outcomes were preserved. The full test command now limits file concurrency to two to reduce browser contention.

## Benchmarks

`npm run benchmark:generation`: 11 deterministic fixtures / 19 cases, zero fixture-expectation failures. Six deliberately invalid cases are included; the fixture valid fraction is not an AI quality score.

The real Codex CLI generated eight manual cases across three synthetic scenarios, with no repair requests, no duplicate groups, and no unmapped supplied criteria. Durations were approximately 11.2, 17.2, and 13.2 seconds. See [raw live report](verification/generation-live-2026-10-08.json).

These observations verify the real CLI path and structural output. They do not establish a speedup versus the former generator or equal semantic coverage. The role fixture included an inferred reload/persistence assertion, so generated expectations still need product review.

## Verification

- `npm test`: **132 passed**, zero failures, canceled, or skipped tests; approximately 23.5 seconds.
- Focused browser regressions verified saved multiline-criteria reload, reconnect, captured-state removal, duplicate/expired capture recovery, and manual suite cleanup.
- `npm run test:browser`: **3 passed**, zero failures.
- `node scripts/benchmark-generation.cjs`: zero fixture-expectation failures.
- JavaScript syntax checks and `git diff --check` passed.
