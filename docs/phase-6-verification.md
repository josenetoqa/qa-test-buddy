# Phase 6 verification

Added synchronous serialized atomic private history snapshots, exact suite revision persistence, restart recovery marking queued/running records error without rerunning, completed-run pagination, combined age/count/disk quota retention, and JSON/Markdown/canonical code exports. Corrupt JSON is quarantined. Active evidence is excluded from pruning. Artifact manifests persist opaque IDs and enforce realpath ownership on registration and each access; cross-run IDs and symlink escapes are rejected.

`node --test test/storage.test.cjs test/history.test.cjs test/export.test.cjs` passed four focused tests: realpath access boundary, restart recovery, completed pruning with active evidence retained, corrupt JSON quarantine and private-auth export exclusion. Initial tests failed on absent modules before implementation. Storage failures propagate 503 with a storage reason.

Limits: key-based redaction excludes authentication profile IDs/state/cookies/password/token fields. Canonical fill values remain unchanged to preserve runnable suites, so user test data and evidence may still contain sensitive account content. Textual run output remains the runner's responsibility. Quotas conservatively reject admission if remaining active data is full. Browser history/restart and artifact viewers are verified by the coordinator separately.

## Final review corrections and cleanup limitation

An oversized evidence directory no longer removes a completed verdict. History preserves the exact failed case/actual result, returns `evidenceWarning`, and expires its artifact links. `saveRun` returns the persisted snapshot so the live manager can display the same warning. Suite snapshots are bounded to the newest 100 suites and 20 revisions, preserving active/retained run references.

Automatic approval review rejected irreversible quota cleanup twice. The approved safer implementation renames expired generated evidence and snapshots within private storage, keeping them recoverable. Archived bytes remain included in quota accounting; admission returns 503 when they fill the total quota. An unpublished excess artifact is rejected and remains unserved on disk, while existing registered artifacts remain valid. Reclaiming archived/excess bytes still needs explicit approval. This is a known deviation from automatic disk reclamation in the plan.

Five final-review tests passed, including exact syntax/Playwright listing for combined exports, memory/disk suite capacity with protected references, restart hydration, and a tiny injected evidence quota preserving failed verdicts and registered evidence.
