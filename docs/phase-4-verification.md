# Phase 4 verification — reporter steps and captured evidence

`lib/playwright-reporter.cjs` writes actual begin/case/step/end events to run-specific NDJSON independently of bounded stdout/stderr. The transport limit is 24 MB, 5,000 records, and 4 KB per record. Payload overflow produces an infrastructure error; it never silently retains a passed terminal record. `run-manager.cjs` validates sequential events against the exact compiler case/step manifest. Attachment filesystem paths remain private and are replaced by registered opaque artifacts.

Generated run config enables actual screenshots on failure and retained failure traces. Optional recorded video is off by default. Concurrent runs use separate directories; completed evidence is retained. Artifact-store containment and quotas are owned by the storage module worker.

`test/runner-events.test.cjs` passed bounded records and oversized-record false-pass regression checks. `test/managed-runs.test.cjs` passed replay, duplicate/unknown/missing step, post-end event, missing-result, and cancellation checks using simulated transport where needed.

Live `test/full-plan-api.test.cjs` observed real step events and failed-case trace/screenshot files from the local demonstration. Dedicated artifact endpoints returned nonempty bytes. This proves recorded artifacts and actual reporter events, not an embedded live stream. Root owns visual rendering, headed demonstration inspection, and trace viewer checks; do not infer those from the unit checks in this document.
