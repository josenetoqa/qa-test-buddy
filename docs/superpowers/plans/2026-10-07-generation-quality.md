# Generation Quality Implementation Plan

> Execution: primary implements generation core; independent workers own inspection and UI; integration and fresh review follow.

**Goal:** Improve case trustworthiness, review effort, and measurable generation efficiency.
**Architecture:** Dedicated quality, provider, generation, inspection/state modules integrated with existing immutable suites.
**Tech Stack:** Node 20+, CommonJS, vanilla JS, Playwright.
**Spec:** docs/superpowers/specs/2026-10-07-generation-quality-design.md

## Global constraints
- Local only, no new dependencies; maintain existing execution approval and revision behavior.
- 1–8 cases and at most 12 operations per case. No arbitrary generated source execution.
- Never send cookies, storage state, or input values to AI.

## Review focus
- Canceled jobs must not save late results; exercise with delayed fake provider.
- Regeneration must reject concurrent revision changes; exercise with changed revision.
- Missing DOM must not produce runnable guesses; test fallback.
- Partial repair must preserve valid cases and expected outcomes; test malformed mixed response.
- Extra context and capture selection must participate in stale-input detection; browser test.

## Tasks
- [x] Quality: tests for blank steps/results, requirement IDs, duplicates and coverage; implement generation-quality.cjs and connect suite validation.
- [x] Provider/service: tests for single repair, fallback, metrics, cancellation, bounded jobs/cache and optimistic regeneration; extract provider adapter and implement service.
- [x] Inspection/states: worker tests and implements read-only metadata, captured same-origin states, expiry, cancellation and privacy.
- [x] UI: worker tests and implements optional context, coverage, metrics, jobs/reconnect/cancel and case regeneration/capture controls.
- [x] Benchmark/docs: deterministic corpus plus opt-in live runner, documentation and API contracts.
- [x] Integration: full tests, browser verification, fresh code review, address findings and record results.

## Interfaces
Quality exports catalogFor(input), assessCases(raw,input), qualityFor(suite), validateManual(item,catalog?). Generation service exports createGenerationService(deps) with start(input),get(id),cancel(id),generate(input),close(). Suite storage exports replaceCases(id,revision,replacements,metadata). Inspector exports inspectPage(url,options), readControls(page); captured states manager exports start,capture,getMany,list,closeCapture,close.

## Validation commands
`node --test test/generation-quality.test.cjs test/generation-service.test.cjs`
`npm test`
`npm run test:browser`
`npm run benchmark:generation`

## Ledger
- Pre-flight: shared interfaces above agreed in worker assignments. Existing synchronous endpoint retained for compatibility. Native local implementation authorized by user; no repeated design gate.

- Quality/provider/UI/capture modules implemented with focused regression tests.
- Independent review found envelope-repair expectation loss, reconnect edit overwrite, and missing state selection recovery; all addressed and rechecked.
- Additional regressions protect save failure revision integrity and saved multiline criteria.
- Final full regression: 132 passed, zero failures; no remote publication.
- Standalone browser suite: 3 passed; documentation links and syntax/diff checks passed.
