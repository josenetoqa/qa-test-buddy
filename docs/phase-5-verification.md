# Phase 5 verification

Added allowlisted exact role/label/text/testId locators, trusted click/fill and visible/text/value/count/URL assertions, structured operation edits creating immutable revisions, invalidation of prior review/locator verification, and read-only current-page locator inspection. Verification metadata creates a new revision; ambiguity resets readiness and blocks review.

`node --test test/locators.test.cjs test/compiler.test.cjs test/suites.test.cjs` passed five focused tests. The locator test launches actual Chromium against an owned HTTP fixture: duplicate matches are ambiguous, hidden matches remain hidden, absent matches remain absent; an instrumented click endpoint is never requested. Later actions are explicitly labeled unverified in their future page state. Verification has a 30-second lifetime and always closes the browser.

Limit: the probe cannot establish expected business behavior or later DOM states because it performs no action. UI/editor acceptance is verified by the coordinator separately.
