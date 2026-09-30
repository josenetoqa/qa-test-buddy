# Test Buddy

**Turn requirements into reviewed test cases and real Playwright results.**

Test Buddy is a local QA workspace that connects manual test design with browser automation. Enter your requirements and target URL, generate cases with your configured Codex or Claude CLI, review each automation mapping, and inspect what actually happened.

![Test Buddy workspace with independent Playwright results](docs/images/workspace.png)

## Why I built it

As a manual QA analyst, I wanted one place to organize test cases and explore automation without losing the expected behavior behind each case. Test Buddy keeps manual steps, assertions, execution results, and evidence together. Every generated case has its own identity and Playwright result.

This is a personal learning project built with AI-assisted development. The focus is practical QA workflows, readable results, and honest execution status.

## Features

- **Manual test design:** generate plain-text or BDD cases from requirements.
- **Independent automation:** review and run one case, selected cases, or all reviewed cases.
- **Clear results:** per-case verdicts, expected versus actual behavior, real steps, and assertion errors.
- **Evidence:** failure screenshots and traces, plus optional recorded video.
- **Execution controls:** headless or headed Chromium, action delay, cancellation, and reload recovery.
- **Structured editing:** edit allowlisted actions and exact locators without executing model-written source.
- **Saved history:** reopen exact suite revisions and export JSON, Markdown, or Playwright code.
- **Local authentication:** explicitly capture an origin-bound login profile for authenticated testing.

## Quick start

Requirements: **Node.js 20+**, npm, and Chromium for Playwright. AI generation also needs a configured, signed-in **Codex CLI or Claude CLI**. The bundled demo works without an AI account.

```sh
git clone https://github.com/joseneto-qa/qa-test-buddy.git
cd qa-test-buddy
npm ci
npx playwright install chromium
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The server binds to loopback and has no frontend build step. While this repository is private, cloning requires access to it.

Optional configuration:

```sh
PORT=4183 npm start
TEST_BUDDY_DATA_DIR=/absolute/path/to/private-data npm start
```

## Test your application

1. Enter your requirements and select plain text or BDD.
2. Select your installed AI CLI and enable Playwright.
3. Enter your application's target URL and click **Generate tests**.
4. Check the manual cases, locators, and assertions. Edit actions or check locator matches if needed.
5. Mark the cases reviewed, then run one, selected cases, or all reviewed cases.
6. Inspect the result panel and export the report or evidence.

Changing the requirements, URL, format, or framework blocks the previous suite until you generate again. A failed generation never falls back to the demo. Saved suites restore their original inputs.

### Try the local demo

Click **Try the local Playwright demo**. It loads three independent cases against a bundled contact form: **pass, intentional failure, pass**. Review them and run the suite. The intentional failure shows how assertion errors and evidence appear; it is not a regression in the verification suite.

### Authentication and evidence

Create a local authentication profile for your target origin. Open its controlled login browser, sign in yourself, then explicitly save the session. Login state stays in private local storage and is excluded from AI generation, reports, and Git.

To inspect a downloaded failure trace:

```sh
npx playwright show-trace /absolute/path/to/trace.zip
```

Headed mode opens a separate local browser. Screenshots and video are captured evidence, not a live stream. Reports link to evidence on your local server; those links are not portable to another computer.

## How it works

```text
Requirements + target URL
          ↓
Configured AI CLI → structured case mappings
          ↓
Canonical suite → human review → immutable revision
          ↓
Allowlisted compiler → server-owned Playwright batch
          ↓
Actual reporter events → case results + evidence + history
```

The browser submits suite and case identifiers. The server resolves the reviewed operations and compiles trusted Playwright source. Reporter identity, completeness, and process outcome determine the verdict. Missing, skipped, or incomplete execution cannot become a pass.

**Stack:** vanilla JavaScript, HTML, CSS, Node.js, Playwright, and Node's built-in test runner. No database or UI framework is required.

```text
app.js / index.html / styles.css  Workspace UI
server.js                        Local HTTP API
lib/                             Suite, compiler, runner, evidence, history, auth
 demo/                           Deterministic contact-form fixture
 test/                           Unit, integration, and browser checks
 docs/                           API contract and implementation notes
```

## Verification

```sh
npm test
npm run test:browser
```

The test suite includes real Chromium runs, UI reload and responsive checks, cancellation, idempotency, immutable revisions, history recovery, locator edits, artifact containment, and a controlled local authentication fixture. A separate custom-target integration checks that submitted requirements and URL reach generation and execution.

The standalone Playwright suite tests valid, empty, and invalid email behavior in the demo. Tests use local fixtures; they do not prove behavior on your external application.

## Current limits

- A URL does not reveal the page's DOM. Generated locators and expected behavior require review.
- Read-only locator verification checks the initial page state; later states and business correctness need testing.
- Chromium is the implemented browser runner. Cypress execution is not available.
- The service accepts 1–8 cases, 1–12 operations per case, and up to 20,000 requirement characters. Two generation requests and two active/queued batches are allowed.
- History targets 100 completed runs, seven days, 50 MB per run, and 500 MB total. Expired data is archived rather than automatically deleted. Archived bytes count toward quotas and may require manual cleanup.
- Interrupted runs become errors after server restart; they are not resumed automatically.
- Session-cookie and server-side authentication validity cannot always be checked offline. Recapture may be needed.

## Privacy

Your selected AI CLI sends requirements to its configured provider. Do not include secrets in requirements. Login profiles stay local, but test values, screenshots, traces, and videos may contain account data. Review evidence before sharing. Deleting a local profile does not revoke sessions at the target service.

Runtime data, auth profiles, generated recordings, dependencies, and local agent sessions are excluded from Git. The README image shows only the controlled local demo.

## Documentation

- [API contract](docs/api-contract.md)
- [Implementation record](docs/implementation-2026-09-29.md)
- [Execution design](docs/superpowers/specs/2026-09-29-playwright-execution-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-29-playwright-execution-plan.md)

Built by **José Neto** to explore the bridge between manual QA and browser automation.
