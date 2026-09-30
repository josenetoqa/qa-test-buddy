# Playwright Execution Implementation Plan

**Current status (September 29, 2026):** The user explicitly requested implementation of this saved plan. Phases 0–7 are delivered with the documented retention deviation: expired files are reversibly archived, but automatic disk reclamation is blocked by approval review. Optional phase 8 Cypress is not authorized or implemented. See the [implementation record](../../implementation-2026-09-29.md) and phase verification documents for actual evidence. The original checklists below are retained as acceptance references; original historical commands/file names are not all the final implementation names.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every generated manual case an honest Playwright mapping and independent execution result, with visible progress and usable evidence.

**Architecture:** Keep vanilla HTML/CSS/JavaScript and the local Node server. Extract small CommonJS modules only where the new contracts need independent tests. The server stores canonical suite revisions and compiles validated operations; browsers submit identifiers, and structured reporter output determines results.

**Tech Stack:** Node 20+, installed Playwright 1.63.0, Chromium, Node's built-in test runner, no required UI framework.

**Spec:** [Execution design](../specs/2026-09-29-playwright-execution-design.md). Read it first; it defines the complete data shapes and state semantics.

## Implementation delivery tracking

- [x] Phase 0: preserve the accepted light QA workspace and responsive result panel.
- [x] Phase 1: immutable identities/revisions and validated per-case compiler.
- [x] Phase 2: deterministic demo, actual package/browser readiness, standalone Playwright checks.
- [x] Phase 3: server-owned batches, idempotency, cancellation, replay/reconnect and reporter completeness.
- [x] Phase 4: actual steps, headed mode, failure screenshot/trace and optional video.
- [x] Phase 5: structured locator editing, read-only verification and review invalidation.
- [x] Phase 6: durable history, canonical exports and bounded admission; expired files reversibly archived.
- [ ] Phase 6 deviation: reclaim archived bytes automatically. Approval review rejected irreversible cleanup; do not claim disk reclamation is delivered.
- [x] Phase 7: explicit origin-bound local auth profiles and controlled headed fixture verification.
- [ ] Phase 8: optional Cypress. Separate authorization pending; capability remains unavailable.

The detailed phase checklists below remain the original acceptance references. Final tests/files and measured evidence are recorded in `docs/phase-N-verification.md` and the implementation record.

## Global constraints

- The latest request authorizes implementation of this saved plan through phases 0–7. Preserve the accepted light workspace. Optional Cypress requires separate authorization. Do not confuse the earlier core-only implementation record with the current scope.
- Project: `/Users/joseneto/Documents/Projetos Pessoais/qa-test-buddy`. Set this explicit working directory; verify it exists. Do not assume Git. Preserve concurrent changes. The application now includes the delivered light design and core independent-TC workflow. Preserve that baseline.
- Node 20 or newer; installed `@playwright/test` 1.63.0. Verify local package engines; README now states Node 20 or newer.
- Preserve the 20,000-character requirements limit. Keep request bodies at 256 KB, generation output and textual run output at 128 KB combined across stdout/stderr, 1–8 cases, and 1–12 operations per case.
- Limit each manual field to 4,000 characters, title to 240, each manual step to 1,000, at most 24 manual steps, locator strings to 160, and operation values/text to 1,000.
- Two active/queued suites and two concurrent generations; per-case timeout 120 seconds; suite deadline in milliseconds `min(990000, selectedCaseCount * 120000 + 30000)`.
- Cap events at 5,000 per run and each payload at 4 KB. Retention: 100 completed runs, seven days, 50 MB per run, 500 MB total. Active data is never pruned.
- No model-produced source execution, navigation-only pass, invented progress, inferred per-case pass, arbitrary file serving, or automatic rerun after reconnect/restart.
- Every phase updates `docs/api-contract.md`, documents live versus simulated evidence, and ends with a runnable independently useful app. All code snippets below are starter implementations/tests for that phase, not proof of completion.

## Review focus

1. Duplicate titles and reordered cases must retain correct identity; cover phase 1 ID mapping and phase 3 reporter reconciliation.
2. A second click, stale revision, or browser reload must not spawn duplicate work; cover phase 3 idempotency and reconnect.
3. Exit 0 with zero/missing tests must never be green; cover phase 3 reporter completeness and process outcome.
4. Parallel runs and malformed artifact IDs must never reveal another run's evidence; cover phase 4 containment and phase 6 cleanup races.
5. Missing browser, disk exhaustion, and expired login must produce actionable errors without misleading test verdicts; cover phases 2, 6, and 7.

## Preparation shared by each phase

- [ ] Read `server.js`, `app.js`, `docs/api-contract.md`, package versions, this spec, and the requested phase. Inspect Git status if `.git` exists; otherwise create a dated file manifest and backup of owned files before editing.
- [ ] Run the app on an available loopback port and capture the existing UI/behavior. Do not call external generation for deterministic contract tests; use explicit fixtures. Preserve live test evidence separately.
- [ ] Write the targeted failing checks, run them, implement the smallest coherent change, rerun those checks, then exercise the real browser flow owned by the phase.
- [ ] Record modified files, commands, results, and remaining limits in `docs/phase-N-verification.md`. If Git exists, commit only owned changes; otherwise retain the manifest and backup. Never reset unrelated files.

## Phase 0 — Review and implement the light QA workspace design

**Depends on:** original application; future authorization for this phase. **Deliverable:** an approved screen design and, after its review, presentation changes using the existing API.

**Ownership:** `index.html`, `styles.css`, presentation-only rendering in `app.js`; create `docs/phase-0-design-review.md`. Do not change `server.js`, generation contracts, compiler, runner lifecycle, dependencies, or authentication.

**Interfaces:** retain the existing `GET /api/capabilities`, `POST /api/generate`, `POST /api/runs`, and `GET /api/runs/:id` shapes. Result fields currently available are `runId`, `status`, `startedAt`, `finishedAt`, `summary`, and `output`. Display aggregate framework status only. Missing duration, step events, screenshots, video, and per-case execution results are not fabricated.

- [ ] Inspect the original application at desktop and narrow widths. Document concrete visual problems and produce a proposal showing empty, generated, running, passed, failed, unavailable, and long-output states before changing application source.
- [ ] Use the chosen light QA workspace direction: white surfaces, pale neutral background, restrained teal accents, dark readable text, clear borders, limited shadows, and a consistent spacing scale. Avoid decorative purple gradients, excessive rounded panels, small low-contrast labels, and irrelevant dashboard metrics.
- [ ] Propose compact setup controls on the left (or a collapsible top section), a larger manual-case review area, and a prominent aggregate run-result box. Keep primary actions near their context. Give long cases and long logs room; do not force a dashboard grid onto every section.
- [ ] Present the proposal for review before implementation, as requested. Include a clearly labeled static design image or mockup and an explicit map of existing fields to the panel. Review concerns appearance and hierarchy; a mockup never demonstrates real execution.
- [ ] After the design is reviewed, implement typography at 16 px body/14 px secondary minimum, clear heading levels, 40–44 px controls, visible keyboard focus, and one coherent responsive system. On narrow screens, stack setup, cases, then result with no page-level horizontal overflow.

```css
/* Proposed tokens to adjust during design review, not an installed theme. */
:root {
  --canvas: #f5f7f8; --surface: #fff; --ink: #172b36;
  --muted: #526671; --border: #dce4e8; --accent: #0f766e;
  --pass: #166534; --fail: #b91c1c; --warning: #92400e;
}
.run-output { white-space: pre-wrap; overflow-wrap: anywhere; font: 14px/1.6 ui-monospace, monospace; }
```

- [ ] In the result box, show a text status with an icon, target/framework context, concise summary, actual timestamps if present, and expandable preformatted output. Use distinct passed/failed/running/unavailable treatments; errors must remain legible without relying on color. Avoid case pass counts until phase 3 returns them.
- [ ] Add a small project-owned favicon or an intentional empty icon response to remove the nonblocking favicon 404. Keep it cosmetic.
- [ ] Correct the cursor/disabled styling and stale framework hint through presentation state. Do not fix polling, reconnect, or timeout behavior in this phase; those changes belong to phase 3. Preserve generated inputs/results when switching presentation tabs.
- [ ] Verify the real existing generate/run interactions plus keyboard navigation and desktop/mobile screenshots. Use labeled fixtures for visual states when needed; separately run one actual passing and failing assertion to verify the displayed aggregate verdict. No implementation-mirroring unit tests are needed for CSS.

**Accept:** the reviewed visual direction is reproduced, results are easier to inspect, all existing actions work, and no new execution capability is implied. **Rollback:** restore only this phase's backed-up presentation files, preserving concurrent work and source behavior.

**Next-model kickoff:** “Implement only phase 0 from this plan. First propose the light QA workspace for review, with setup secondary and a prominent aggregate result panel. After review, change presentation files only, verify the existing flow and responsive states, and stop before execution improvements.”

## Phase 1 — One automation mapping per manual case

**Depends on:** current application; compatible with phase 0 if implemented. **Deliverable:** per-case generation, validated mappings, separately compiled test files, readable code/export. Execution lifecycle remains phase 3.

**Ownership:** create `lib/suite-schema.cjs`, `lib/suite-store.cjs`, `lib/playwright-compiler.cjs`, `test/suites.test.cjs`, `test/compiler.test.cjs`, `test/fixtures/suites.cjs`; modify generation/schema/compiler portions of `server.js`, case/code rendering in `app.js`, `docs/api-contract.md`.

**Interfaces:** `validateSuiteDraft(raw, input) -> validatedDraft`; `createSuite(validatedDraft) -> Suite`; `getSuite(suiteId, revision) -> Suite|null`; `reviseSuite(suiteId, expectedRevision, edit) -> Suite` (409 on conflict); `compileCase(suite, caseId) -> { filename, source, manifest }`; `manifest = { caseId, displayId, stepIds }`. Store is server-only, capped at 100 suites; never evict a revision referenced by active work. Cap retained revisions at 20 per suite; prune only revisions unreferenced by active runs, otherwise return 503. Full store returns 503. Add `GET /api/suites/:id?revision=N` and `PATCH /api/suites/:id/review` with `{ expectedRevision, caseIds, reviewed: true }`; the latter validates stored cases and returns a new immutable revision.

- [ ] Add fixture `threeCases()` with distinct temporary keys, duplicate human titles, two automation drafts, and one manual-only reason. Assert exactly one mapping per manual case; reject missing/duplicate/extra keys, unsupported source fields, oversized strings, and cross-origin navigation.
- [ ] Use server UUIDs for `caseId` and `suiteId`; keep `TC-001` display labels stable across edits. `revision` starts at 1; `reviseSuite` deep-clones, validates, increments, and retains the prior revision. Regeneration creates a new suite ID.
- [ ] Preserve bounded actionable provider diagnostics for missing login, process startup failure, timeout, malformed JSON, and unsupported output; do not collapse every failure into a generic message. Enforce one 128 KB combined stdout/stderr budget, with a bounded error excerpt and truncation flag, in the shared process helper; add mixed-stream limit tests.
- [ ] Extend `POST /api/generate` with `schemaVersion: 2`; retain the old format only for legacy callers. Return the stored `Suite` for v2. Make all v2 UI callers consume it. Do not flatten case operations back into the old framework object.
- [ ] Compiler emits one independent file/test per eligible case, exact escaped literals, and step names prefixed with stable `stepId`. Generated drafts may expose reviewable source, but the runner accepts only `ready`; `manual-only` and `blocked` have no runnable source. Reject a ready case lacking a matching assertion.

```js
// test/compiler.test.cjs; readySuite() is the owned fixture with a reviewed expectText.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compileCase } = require('../lib/playwright-compiler.cjs');
const { readySuite } = require('./fixtures/suites.cjs');
test('a ready case needs an assertion', () => {
  const suite = readySuite();
  suite.cases[0].automation.playwright.operations = [{ stepId: 's1', op: 'navigate', value: suite.targetUrl }];
  assert.throws(() => compileCase(suite, suite.cases[0].caseId), /assertion/i);
});
// Emitted trusted shape:
// test('[TC-001|<caseId>] Submit a valid form', async ({ page }) => {
//   await test.step('s1: Open form', async () => { await page.goto(validatedLiteral); });
//   await test.step('s2: Check success', async () => { await expect(page.getByText(validatedLiteral, {exact:true})).toBeVisible(); });
// });
```

- [ ] Add per-case/selected review controls: display operations and expected behavior, require an assertion, and send only the review endpoint contract. The server promotes eligible drafts to ready and preserves all case IDs. Reject unknown/blocked/manual-only cases, stale revisions, and injected operation/source fields. Phase 5 adds editing and assisted locator checks.
- [ ] Show automation status/reason for every manual case and provide case/suite code copy/download. Any legacy run is labeled “Framework draft”; never attach its status to the per-case list. Per-case run controls become available in phase 3.
- [ ] Run `node --test test/suites.test.cjs test/compiler.test.cjs`; list emitted tests with the local Playwright executable against a temporary explicit config. Prove N eligible mappings produce N distinct test IDs and mixed quotes cannot become executable expressions.

**Accept:** every generated case is represented; all ready tests contain real assertions; edits/reorder preserve IDs; unsupported cases explain why. **Rollback:** restore this phase's source manifest, restart to clear the new memory store, retain the visual design that was present when the phase started. The legacy API remains usable during this phase.

**Next-model kickoff:** “Implement only phase 1 from this plan and its linked spec. Own its listed files. Preserve accepted earlier phases; create per-case mappings and trusted compilation, verify ID stability and rejection paths, and report exactly what ran. Do not implement the runner phases.”

## Phase 2 — Repeatable demo and actual readiness

**Depends on:** phase 1. **Deliverable:** a local demonstration with known outcomes and a readiness check that distinguishes CLI detection from usable Chromium.

**Ownership:** create `demo/index.html`, `demo/demo.js`, `demo/demo.css`, `demo/suite.json`, `lib/readiness.cjs`, `test/readiness.test.cjs`, `test/demo.spec.cjs`, `test/playwright.config.cjs`; modify static route allowlist, capability endpoint, `app.js`, `README.md`, `package.json` engines.

**Interfaces:** `checkReadiness({ nodeVersion, playwrightCommand, timeoutMs: 10000 }) -> { available, node, runner, browser, reason }`; `POST /api/demo/suites -> Suite` loads a server-owned checked-in fixture and assigns fresh IDs; `GET /demo/` serves the local deterministic form. Never fetch arbitrary suite JSON from the browser.

- [ ] Make a contact form with labeled name/email fields, accessible validation messages, and a success receipt. Reset via a local reset control on each case; keep all data in that page's context. No external service calls.
- [ ] Seed a checked-in suite: valid contact passes; missing email validation passes; “Intentional failure: wrong receipt” fails. Mark all as demo cases and keep the intentional failure label in exports/results.
- [ ] Readiness verifies Node major >=20 and launches/closes project-local Chromium with a 10-second bound. Return separate runtime/runner/browser errors. Cache for 30 seconds, refresh explicitly, close resources in `finally`, and never install dependencies automatically.

```js
// test/readiness.test.cjs; dependency injection makes missing-browser checks deterministic.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkReadiness } = require('../lib/readiness.cjs');
test('Node 18 cannot advertise readiness', async () => {
  const result = await checkReadiness({ nodeVersion: '18.20.0', playwrightCommand: null, timeoutMs: 10000 });
  assert.equal(result.available, false);
  assert.match(result.reason, /Node.*20/i);
});
```

- [ ] Test missing executable, missing browser, launch timeout, working browser, and closure after failure. Fix README prerequisites and actual commands without changing dependency versions unnecessarily.
- [ ] Add `test/playwright.config.cjs` for verification only: `testDir` is that config directory, `testMatch` is `**/*.spec.cjs`, Chromium is headless, and workers is 1. Use a dedicated loopback app port supplied by `TEST_BUDDY_BASE_URL` or start an owned server with `PORT=4175 node server.js`; do not attach to or stop unrelated servers. The generated-run config remains separate.
- [ ] Run `node --test test/readiness.test.cjs`, then `node node_modules/playwright/cli.js test --config=test/playwright.config.cjs test/demo.spec.cjs`. Run the intentional-failure example separately and assert its nonzero exit plus exact assertion failure; do not mark it as an unexpected verification failure.

**Accept:** a clean local demo runs without AI or third-party access; known pass/fail outcomes repeat; readiness explains setup failures. **Rollback:** remove demo route/controls and restore previous capability response; per-case generation still works.

**Next-model kickoff:** “Implement only phase 2 after verifying phase 1 exists. Build the deterministic local demo and real Chromium readiness, preserve the UI, verify both expected passes and the labeled intentional failure, and stop at this phase.”

## Phase 3 — Selected/all cases, trustworthy results, reconnect and cancellation

**Depends on:** phases 1–2. **Deliverable:** real independent case results with safe run lifecycle and a responsive result panel.

**Ownership:** create `lib/run-manager.cjs`, `lib/run-reducer.cjs`, `lib/playwright-reporter.cjs`, `test/runs.test.cjs`, `test/reducer.test.cjs`, `test/run-ui.spec.cjs`; modify `server.js` run routes/process helper and `app.js` run state/selection. Reuse phase 1 suite/compiler modules.

**Interfaces:** `createRun(request) -> Run`; `getRun(runId) -> Run|null`; `cancelRun(runId) -> Run`; `reconcileRun({ expectedIds, reportedCases, reporterEnded, reporterStatus, processExit, canceled, timedOut }) -> outcomes`. HTTP: `POST /api/runs` with `schemaVersion: 2` accepts only the spec's ID-based shape; retain the legacy aggregate shape only for non-v2 callers, `GET /api/runs/:id`, `POST /api/runs/:id/cancel`. Unknown ID 404, invalid 400, stale/key conflict 409, capacity 429.

- [ ] Test zero selection, duplicates, unknown suite/case, non-ready selection, stale revision, changed-content idempotency collision, two simultaneous identical starts, and capacity exhaustion. Resolve the immutable suite revision inside the server before compiling; never accept client snapshots, code, operations, paths, or target overrides.
- [ ] Reserve idempotency key and job capacity synchronously before launch. Compile one file per selected case into one run directory; create a run-specific config with exact `testDir`, Chromium, `workers: 1`, `retries: 0`, `maxFailures: 0`, timeout 120000, and the suite deadline from the spec. Disable inherited config and unintended test discovery.
- [ ] Add a custom reporter recording begin/end and exact case IDs to a dedicated NDJSON file in the run directory, separate from textual stdout/stderr. Bound the file to 24 MB, 5,000 records, and 4 KB per record; validate records before reduction. Overflow, malformed records, or missing final reporting cause infrastructure error. Validate the discovered set equals selected IDs; record duration, assertion error, and status for each case. A failed case must not prevent later cases. Reconcile reporter completion with process termination before finalizing.

```js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reconcileRun } = require('../lib/run-reducer.cjs');
test('exit zero with missing tests is infrastructure error', () => {
  const result = reconcileRun({ expectedIds: ['c1'], reportedCases: [], reporterEnded: true,
    reporterStatus: 'passed', processExit: 0, canceled: false, timedOut: false });
  assert.equal(result.status, 'error');
  assert.notEqual(result.cases[0].status, 'passed');
});
// Pass is possible only after every selected ID has one completed passed result,
// reporterEnded === true, reporterStatus === 'passed', processExit === 0,
// canceled === false and timedOut === false.
```

- [ ] Distinguish assertion failure from startup/report corruption/timeout. Preserve already completed case outcomes on cancellation; unfinished selected cases become canceled. Kill the process group with TERM, then KILL after a bounded grace period, and await closure before releasing capacity. Repeated cancel returns the terminal/current record.
- [ ] Replace fixed polling attempts with server deadline/reconciliation. Persist only suite/revision/run IDs in localStorage; hydrate the suite and run after reload through `GET /api/suites/:suiteId?revision=N` and run GET. When the in-memory server restarted, explain unavailable history and do not rerun. Phase 6 adds restart persistence.
- [ ] Use selection checkboxes, “Run selected,” and “Run all ready”; show per-case counts and omitted reasons. Keep the last result visible during temporary disconnection, disable duplicate start while its request is pending, and retain actual assertion text as escaped text.
- [ ] Run `node --test test/runs.test.cjs test/reducer.test.cjs`, then `test/run-ui.spec.cjs`: run three demo cases, verify pass/fail/pass independence with fixture ordering, reload during execution, disconnect/reconnect, cancel twice, and start from two tabs. Include zero-test, duplicate reporter ID, truncated reporter, signal, nonzero exit after passed results, and a >80-second synthetic clock lifecycle check.

**Accept:** selected cases each receive their own result; missing tests never pass; refresh and retries do not duplicate work; cancellation releases resources. **Rollback:** restore phase 2 manifests/routes and clear only terminal phase 3 temporary records. Preserve artifacts needed for diagnosis and the prior design. Do not silently reinterpret new run records as legacy results.

**Next-model kickoff:** “Implement only phase 3 using stored suite IDs/revisions. Reconcile reporter evidence and process outcome, support independent selected/all cases, reconnect and idempotent cancel, and prove the lifecycle tests. Do not add history or artifact UI yet.”

## Phase 4 — Actual step timeline, visible browser and evidence

**Depends on:** phase 3. **Deliverable:** actual case/step events, headed local runs, and evidence links inside the result panel.

**Ownership:** extend `lib/playwright-reporter.cjs`, `lib/run-manager.cjs`, `lib/playwright-compiler.cjs`; create `lib/artifacts.cjs`, `test/events.test.cjs`, `test/artifacts.test.cjs`, `test/evidence-ui.spec.cjs`; modify event/artifact routes in `server.js` and result UI in `app.js`.

**Interfaces:** `appendEvent(runId, event) -> seq`; `readEvents(runId, afterSeq) -> { events, lastEventSeq, truncated, snapshotRequired }`; `registerArtifact(runId, caseId, absolutePath, kind) -> Artifact`; `resolveArtifact(runId, artifactId) -> verifiedPath`. HTTP: `GET /api/runs/:id/events?afterSeq=N`; `GET /api/runs/:id/artifacts/:artifactId`.

- [ ] Stream only actual reporter `onTestBegin/onStepBegin/onStepEnd/onTestEnd/onEnd` events with manifest IDs. Parser handles split/malformed records and enforces event bounds. Store authoritative terminal outcomes separately so ring overflow cannot lose the verdict. Deduplicate by sequence; return a snapshot requirement when a reconnect cursor predates retained events.
- [ ] Map `mode: headed` to Chromium `headless: false`; keep default headless. Limit optional demonstration delay to 0–500 ms and label it. Do not describe a screenshot or video as a live browser stream.
- [ ] Write run-specific trace/screenshots/video configuration. Retain failure traces and failure screenshots; optional demo video is off by default. Capture only actual artifacts, with case IDs, MIME type, size, and opaque IDs. Separate output paths for concurrent runs.

```js
// lib/artifacts.cjs starter containment check; additionally use realpath + manifest membership.
const path = require('node:path');
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..' + path.sep)
    && relative !== '..' && !path.isAbsolute(relative);
}
// Unknown run/artifact, cross-run ownership, missing file, or a realpath outside
// the run evidence directory returns 404; caller-supplied filesystem paths are forbidden.
```

- [ ] Preserve completed evidence during process cleanup; delete only temporary compiler/config files. Bound artifact bytes and present quota failures as missing evidence, preserving the test verdict. Block `.test-buddy-runs` in static serving; serve only manifest-authorized files from dedicated endpoints.
- [ ] Render actual step labels/status/duration, failure details, screenshots, download trace, and optional video. Show “No evidence captured” where appropriate. Use an accessible log disclosure and text statuses, and keep narrow-screen layouts usable.
- [ ] Run `node --test test/events.test.cjs test/artifacts.test.cjs`; test sequence gaps, malformed events, overflow, replay, path traversal, symlink escape, cross-run IDs, and artifact quotas. Use `test/evidence-ui.spec.cjs` against a real passing/failing demo and concurrent run; manually inspect one headed run and open its captured trace.

**Accept:** timeline matches real reporter steps, evidence is linked to the correct case/run, failed trace opens, and no fabricated playback appears. **Rollback:** disable event/artifact UI and return to phase 3 snapshot polling; retain evidence directories until the user chooses cleanup or phase 6 retention handles them.

**Next-model kickoff:** “Implement only phase 4. Add real reporter step events, headed mode and isolated evidence, verify reconnect replay and artifact access boundaries, and visually inspect the result panel. Preserve phase 3 outcomes.”

## Phase 5 — Locator review and stronger structured operations

**Depends on:** phases 1–4. **Deliverable:** review/edit case locators and expectations before running, with honest verification limits.

**Ownership:** create `lib/locator-verifier.cjs`, `test/locators.test.cjs`, `test/editor.spec.cjs`; extend schema/compiler, suite edit routes, `app.js` review UI.

**Interfaces:** `Locator = { kind: 'role'|'label'|'text'|'testId', value, role?, exact: true }`; operations add `{ stepId, op: 'click'|'fill'|'expectVisible'|'expectTextExact'|'expectValue'|'expectCount'|'expectURL', locator?, value? }`. `verifyLocators(suite, caseId) -> { checkedAt, results: [{ stepId, count, visible, status, reason }] }`. HTTP: `PATCH /api/suites/:id/cases/:caseId` with `{ expectedRevision, automationEdit }`; `POST /api/suites/:id/cases/:caseId/verify` with `{ revision }`.

- [ ] Enumerate supported roles; validate count as integer 0–1000; URL assertions stay same-origin. Reject raw selectors, eval, scripts, regex source, filesystem fields, and unknown keys. Compile each allowlisted operation through explicit branches with escaped literals and Playwright assertions.
- [ ] Verification loads the stored target, checks locator matches and visibility, and performs no clicks/fills/submissions. Cap at 12 checks and 30 seconds; return ambiguity/absence errors and “not verified in this page state” for later steps. Never auto-select `.first()` to hide duplicate matches.
- [ ] Allow structured edits and reuse phase 1 review marking. Every edit creates a revision and invalidates prior locator verification/review for the changed case. `ready` still requires meaningful assertions and review; verification alone does not establish business correctness.

```js
// Focused compiler check, repeated for each allowlisted assertion:
const source = compileCase(reviewedSuite, reviewedSuite.cases[0].caseId).source;
assert.match(source, /toHaveCount\(0\)/); // Absence must be asserted, not silently skipped.
assert.doesNotMatch(source, /\.first\(\)/); // Ambiguous locator errors stay visible.
```

- [ ] Run `node --test test/locators.test.cjs test/compiler.test.cjs`; test duplicate labels, hidden matches, apostrophes, HTML-looking text, unsupported iframe state, stale edits, and invalid expectations. Run `test/editor.spec.cjs` to edit one assertion, verify the new revision, and produce a real failure without changing another case.

**Accept:** editable locators stay structured; ambiguous selectors block review; expected behavior and observed results remain distinct. **Rollback:** restore phase 4 editor/compiler; keep earlier revisions immutable and mark unsupported new operations blocked rather than coercing them.

**Next-model kickoff:** “Implement only phase 5: structured locator editing, bounded read-only verification, revision invalidation and stronger assertions. Keep ambiguity visible, and verify edits affect only the chosen case.”

## Phase 6 — Durable history, exports and bounded retention

**Depends on:** phases 1–5. **Deliverable:** reopen completed runs after restart, export useful records, and control disk growth.

**Ownership:** create `lib/history-store.cjs`, `lib/export.cjs`, `test/history.test.cjs`, `test/export.test.cjs`; extend suite/run stores, `server.js` history/export endpoints, `app.js` history UI, `.gitignore` if present or create it.

**Interfaces:** `saveSnapshot({ suite, run, artifacts }) -> Promise<void>`; `loadHistory() -> { suites, runs }`; `pruneHistory({ now, maxRuns:100, maxAgeDays:7, maxBytes:524288000 }) -> summary`; `exportRun(runId, format:'json'|'markdown') -> { body, contentType }`. `GET /api/runs?limit=20&cursor=...`; `GET /api/runs/:id/export?format=...`.

- [ ] Store canonical suite revisions and run manifests atomically using same-directory temporary files then rename, with private directories/files. Redact sensitive values before persistence. On startup, mark interrupted queued/running records `error` with a restart reason and never resume their browser processes.
- [ ] Retain at most 100 completed runs, seven days, 50 MB per run, 500 MB total. Enforce quotas under one store lock, exclude active runs, prune oldest eligible completed records/artifacts together, and return 503 when disk or active data prevents admission. Publish deletion/expired evidence state accurately.
- [ ] Export per-case/suite code from canonical stored revisions and reports with actual counts, requirement links, errors, and local evidence references. Omit auth state and secret profile metadata. No portable export should claim local evidence links will work on another machine.

```js
// Deterministic test inputs use an injected clock and temporary owned storage root.
await store.saveSnapshot({ suite, run: { ...run, status: 'running' }, artifacts: [] });
const recovered = await store.loadHistory();
assert.equal(recovered.runs[0].status, 'error');
assert.match(recovered.runs[0].summary, /restart/i);
assert.equal(spawnCount, 0); // Recovery reads records; it must never launch tests.
```

- [ ] Run `node --test test/history.test.cjs test/export.test.cjs`: atomic-write interruption, corrupt JSON quarantine, disk-full failure, quota exhaustion, active-run pruning race, restart hydration, and expired evidence. Browser-check history selection and exported JSON/Markdown/code after a real service restart.

**Accept:** suites/results reopen after restart, exports reflect their exact revisions, and retention never removes active data. **Rollback:** back up persisted manifests, restore phase 5 stores, keep history files read-only for recovery; do not delete data as part of rollback.

**Next-model kickoff:** “Implement only phase 6, persisting both canonical suite revisions and results. Prove restart recovery without reruns, accurate exports and retention under disk/quota failures. Preserve existing run semantics.”

## Phase 7 — Explicit local authentication profiles

**Depends on:** phases 1–6. **Deliverable:** controlled authenticated runs without exposing credentials to the generation provider.

**Ownership:** create `lib/auth-profiles.cjs`, `test/auth.test.cjs`, `test/auth-fixture-server.cjs`; modify profile routes, run config and `app.js` profile selector. Keep profile storage excluded from Git/static routes/exports.

**Interfaces:** `createProfile({ label, origin }) -> { profileId, label, origin, status }`; `captureProfile(profileId) -> publicMetadata`; `resolveProfile(profileId, targetOrigin) -> privateStorageStatePath`; `deleteProfile(profileId) -> void`. `POST /api/auth/profiles`, `POST /api/auth/profiles/:id/capture`, `DELETE /api/auth/profiles/:id`; run creation adds optional `authProfileId` resolved server-side.

- [ ] Open a controlled local headed browser for user login; capture storage state only after the user finishes. Restrict origin association and capture lifetime to five minutes; store with directory mode 0700/file mode 0600. No credentials/OTPs are accepted in model prompts or ordinary logs.
- [ ] Reject unknown/wrong-origin/expired profiles. Document that only authentication origins explicitly configured for the profile may participate in login redirects. Test execution still uses its stored target and trusted steps. Redact artifacts where configured; clearly label that screenshots/traces may include account data.

```js
assert.throws(() => resolveProfile('profile-for-origin-a', 'https://origin-b.example'), /origin/i);
assert.equal(JSON.stringify(publicProfile).includes('cookies'), false);
assert.equal(exportedReport.includes('storageState'), false);
```

- [ ] Use the owned local auth fixture to verify successful login, expired session, wrong origin, profile deletion, no secrets in exports, and restart behavior. Run `node --test test/auth.test.cjs`, then manually complete one controlled login and execute one authenticated assertion.

**Accept:** authenticated state is opt-in, origin-bound, private, and removable; expired sessions are actionable failures. **Rollback:** disable profile selection, stop capture processes, retain private files for user-managed removal; public runs remain functional.

**Next-model kickoff:** “Implement only phase 7 using local authentication profiles and a controlled login browser. Keep secrets out of generation and exports, verify expiry/origin constraints, and preserve unauthenticated execution.”

## Phase 8 — Optional Cypress parity

**Depends on:** stable phases 1–7; implement only if requested. **Deliverable:** explicit framework parity with the same identities and honest unsupported states.

**Ownership:** create `lib/cypress-compiler.cjs`, `lib/cypress-adapter.cjs`, `test/cypress.test.cjs`; extend capability/schema/framework UI without changing the Playwright adapter contract.

**Interfaces:** `compileCypressCase(suite, caseId) -> { filename, source, manifest }`; `executeCypressRun(record, suite, selectedCaseIds) -> normalized Run`. Add `framework:'cypress'` only where those operations and readiness are supported.

- [ ] Audit Cypress label resolution against the application-under-test document (`cy.document()`), not the runner document. Define exact versus contains matching consistently with the reviewed operation, and test duplicate/partial text so Cypress cannot pass a weaker assertion than Playwright.
- [ ] Map allowlisted operations to independent Cypress tests, retaining stable IDs and readiness reasons. Unsupported Playwright-specific assertions/evidence stay blocked with an explanation. Do not assume Playwright trace or auth files are interchangeable.
- [ ] Add Cypress only under this phase's authorization, check its installed engine/browser requirements, and update setup docs. Reuse suite validation, revision/idempotency handling, retention, and result presentation through the normalized contract.

```js
assert.deepEqual(normalizeCypressResult({ caseId:'c1', state:'pending' }), { caseId:'c1', status:'skipped' });
assert.notEqual(reconcileCypressRun({ expectedIds:['c1'], reportedCases:[], exitCode:0 }).status, 'passed');
```

- [ ] Run the owned adapter tests and real deterministic demo in Cypress; prove independent pass/fail results, missing-test protection, cancellation, unavailable runner, and unsupported-operation labels. Rerun the Playwright demo to detect adapter regressions.

**Accept:** Cypress preserves identity/outcome semantics and cannot change Playwright results. **Rollback:** disable its capability and restore the prior framework adapter; keep Playwright fully usable.

**Next-model kickoff:** “Implement only optional phase 8 after confirming explicit Cypress scope. Add a separate structured compiler/adapter, preserve all existing Playwright contracts, and report which evidence/auth features are supported.”

## Starting a future task

Use the phase-specific kickoff above. For a design proposal without implementation, send this prompt:

> Read `docs/superpowers/specs/2026-09-29-playwright-execution-design.md` and `docs/superpowers/plans/2026-09-29-playwright-execution-plan.md`. Work only on the proposal portion of Phase 0. Inspect the current screen and present a light QA workspace with a prominent result panel, including empty, running, passed, failed, and unavailable states. Clearly label mock data. Do not edit application source, install dependencies, or start the execution phases. Return the concrete design proposal for review.

For implementation of an accepted phase, replace the scope sentence with the exact phase number and requested deliverable. Do not treat possession of this plan as authorization to implement it.
