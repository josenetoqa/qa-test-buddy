# Playwright execution plan implementation — September 29, 2026

The user's latest request explicitly authorized implementation of the saved plan. Phases 0–7 are delivered with a retention deviation. Optional Cypress phase 8 remains unavailable pending separate authorization.

Delivered: accepted light responsive workspace; independent per-case mappings, stable identities and immutable revisions; structured safe compiler; actual Chromium readiness; deterministic demo; server-owned sequential batches; idempotency and conflict handling; cancellation and graceful child shutdown; reload/replay; actual reporter steps and errors; headed mode and bounded delay; manifest-contained screenshots/traces/optional video; structured locator editor and read-only verification; durable exact-revision history and JSON/Markdown/code exports; explicit origin-bound private local authentication profiles.

## Verification

- `npm test`: **67 passed, zero failed/skipped**, including real Chromium batch pass/fail/pass, actual failure screenshots/traces, durable restart, read-only locator verification and edited failure, UI reload/keyboard/responsiveness, real cancellation, and controlled headed local authentication. Injected tests also exercise malformed/incomplete reporters, disk failures, quota boundaries, symlinks, stale revisions, auth startup/delete races, and missing runtime.
- `npm run test:browser`: **three independent Playwright demo tests passed** (valid, empty, invalid email).
- Real configured Codex CLI generated one local demo draft. After review its Playwright run passed (`91f20a66-3f70-47cd-beef-bf7ea40d5f6d`). No personal credentials or external application data were used.
- Headed local demo produced independent pass/fail/pass results. Actual failed trace opened in the Playwright trace viewer with the action list, snapshot and assertion failure. Optional recording separately produced a passing run and a real 24,306-byte video artifact (`38c1cd79-b4e9-41ca-a372-1fc146896257`).
- Desktop, 768 px, 375 px, and 200% zoom layouts had no page-level horizontal overflow. Screenshots and the trace viewer were visually inspected. A later headed rerun encountered an actual closed browser during its intentionally failing case; its error is shown honestly. The isolated automated batch verifies the normal assertion-failure path.
- Live generation initially returned HTTP 500 from missing `MAX_GENERATIONS`. A regression reproduced it; restoring the two-generation limit made validation and real generation succeed. Visual inspection also found ANSI controls in error messages; reporter/live/history display boundaries now remove them without changing assertion meaning.
- Review found invalid combined exports, suite capacity locking, quota loss of completed verdicts, an auth-startup deletion race, and stale revision verdicts. Each received a focused regression and fix. Expired evidence warnings suppress dead download links.

Measured logs and inspected screenshots are retained outside source at `/Users/joseneto/.codex/visualizations/2026/09/29/01a0ee88-9e43-7101-992c-2831120e68a7/full-plan-evidence`. Original source backup plus hashes are in the adjacent `full-plan-baseline`. This folder has no Git repository, so no commit/worktree was created. The app remains running at http://127.0.0.1:4183.

## Limits and deviations

Automatic approval review rejected irreversible quota cleanup twice because the destructive scope was not narrowly proven safe. The approved alternative archives expired generated evidence/manifests/snapshots by rename, preserving recovery and completed verdicts. Archived bytes still count toward quotas; admission can return 503. Automatic disk reclamation remains unimplemented pending explicit cleanup authorization. Active runs are excluded from retention.

Automatic review also rejected optional Cypress edits because phase 8 requires a separate explicit request. No Cypress compiler/adapter/dependency was installed. Its capability is unavailable. A scope question remains pending; silence is not approval.

Read-only locator verification sees only initial page state. Human review still determines whether the assertion represents expected behavior. Authentication expiry can inspect cookie timestamps but cannot prove server-side revocation or localStorage session validity offline. Private auth state is excluded from generation/exports; test values and recorded evidence may contain account data. Local profile deletion does not revoke remote sessions. Claude generation was not exercised live in this final pass.

See phase verification documents and the current API contract for exact interfaces and simulation/live distinctions.

## Follow-up — use the entered URL and requirements

The user reported that testing kept using the example. The cause was stale suite identity: editing setup fields did not invalidate the previously generated demo; a failed generation could leave that old suite runnable. Initial async restoration could also overwrite newer inputs.

Suites now preserve canonical `generationInput` requirements/format/frameworks alongside their target URL. UI run/review actions are blocked when current setup differs; generation clears the previous suite before requesting another, and failures never fall back to the demo. Demo loads only on its explicit button. Reload/history restore original inputs; review/edit retain them. Version guards preserve typing during delayed startup and newer edits while generation is pending.

Nine focused UI fixture tests passed, including custom URL/requirements submission and its own suite ID, saved-input restoration, stale demo rejection, generation failure, and delayed response races. A separate controlled CLI fixture verified the exact submitted requirements and target in the generation prompt; its generated/reviewed case then passed in real Chromium against `/user-feature` on a separate owned HTTP server. This is a real custom-target browser check with simulated provider output, not proof against the user's external site.

Final follow-up verification: `npm test` **74 passed, zero failures/skips**. The idle local app was restarted on port 4183 with the final changes; reload the page to receive updated UI code.
