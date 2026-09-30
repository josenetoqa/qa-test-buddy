# Phase 3 verification — server-managed selected suites

Implemented `lib/run-manager.cjs`, `lib/run-reducer.cjs`, and `lib/playwright-reporter.cjs`. The server reserves capacity and idempotency synchronously, compiles stored immutable IDs into one isolated process per selected suite, and uses workers 1/retries 0/maxFailures 0. Case timeout is 120 seconds; suite deadline is `min(990000, N * 120000 + 30000)` rather than an 80-attempt limit. Headed mode and optional 0–500 ms demonstration delay are explicit configuration.

A complete passing case requires its manifest steps to begin and finish, its reporter result, reporter end, and process success. Zero/missing/duplicate identities, contradictory reporter/process status, missing steps, duplicate step ends, events after reporter end, signal, truncation, and bounded transport errors cannot produce a green run. Independently finished cases retain their observed results when infrastructure fails or the run is canceled.

Targeted tests: `node --test test/managed-runs.test.cjs test/reducer.test.cjs test/runner-events.test.cjs`. Tests cover ID-only requests, duplicate clicks, idempotency collision, two active slots, combined 128 KB stdout/stderr including UTF-8 boundaries, initial and late disk failures, malformed/incomplete reporter records, and recovery without rerun. Fake child processes are used only for deterministic lifecycle/error injection.

Live verification: `test/full-plan-api.test.cjs` ran real Chromium against the owned contact demo, observing independent pass/fail/pass cases plus immutable revisions, actual step events, artifacts, and completed-history restoration after restart. `test/runner-cancel-live.test.cjs` canceled an actual browser assertion, awaited child closure, canceled again idempotently, and verified a new suite could be admitted. `NODE_PATH` explicitly points to the project's installed dependencies so isolated data directories outside the project can run trusted specs.

Cancellation sends SIGTERM to the detached runner process group, followed by SIGKILL after 750 ms if needed; capacity releases only at process close. The live check confirms runner closure and cancellation; it is not a certification of every OS process failure scenario.

Public records omit auth state and private config paths. On restart, snapshots retain case steps; an unavailable event replay returns `snapshotRequired` and never restarts tests. Terminal in-memory records/keys follow bounded retention. Disk errors remain actionable in the run summary while preserving actual case verdicts.

A returned quota-adjusted history snapshot is applied to the immediate run record, including unavailable/expired evidence warnings. Asynchronous snapshots are sequence-checked before adoption. Regression tests witnessed and fixed late-storage false-green summaries and lost quota warnings.

Final shutdown regression: `manager.close()` rejects new starts and cancels/awaits active child closure, allowing the server to shut down its owned work. Assertion and output strings strip terminal VT/ANSI controls while keeping semantic error text, including reopened historical case/step errors.
