# Phase 1 verification

Implemented strict operation validation, per-case canonical operations (legacy steps alias retained), stable UUID/display IDs, immutable review/edit revisions, exact stored revision resolution, and independent trusted Playwright compilation. Draft source can be previewed; execution still requires reviewed ready status. V2 explicit case keys are unique and required when provider marks schemaVersion 2. Compiler uses structured exact locators and escaped literal values, never model source.

TDD: initial suite tests failed on mutable review revision and accepted unknown fields. Implemented changes passed. `node --test test/suites.test.cjs test/compiler.test.cjs` passed four focused tests. Compiler output syntax parsed by Node VM, all stronger assertion branches covered, assertionless forged cases rejected. No provider calls were used.

Revision capacity is conservative: 20 retained immutable revisions per suite; at capacity edits/review return 503 instead of deleting a possibly referenced revision. 100-suite memory capacity remains. App/API integration and Playwright test-list discovery are verified by the coordinator separately.

Baseline is the coordinator's full-plan-baseline manifest in the dated visualization folder. No Git repository exists.

## Final review corrections

The capacity behavior above was improved: `configureRetention(getReferences)` protects active and retained run suite/revision references. At 100 suites or 20 revisions, only unreferenced snapshots are evicted. Disk history independently expires orphan snapshots so restart cannot restore discarded suite history. Five final-review tests passed, including >100 suites, >20 revisions, exact references retained, and restart hydration bounds.

Multi-case code export now declares the shared Playwright import once. Both Node VM syntax parsing and actual installed Playwright `--list` discovered exactly two independent case identities in an exported fixture.
