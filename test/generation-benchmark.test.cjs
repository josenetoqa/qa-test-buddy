const test = require("node:test");
const assert = require("node:assert/strict");
const { runOffline } = require("../scripts/benchmark-generation.cjs");
test("offline corpus detects known defects without calling a provider", () => {
  const report = runOffline();
  assert.equal(report.mode, "offline-only");
  assert.equal(report.semanticCorrectnessValidated, false);
  assert.equal(report.summary.fixtureExpectationFailures, 0);
  assert.equal(
    report.fixtures.find((f) => f.id === "blank-expected").invalidCases,
    1,
  );
  assert.equal(
    report.fixtures.find((f) => f.id === "blank-steps").invalidCases,
    1,
  );
  assert.equal(
    report.fixtures.find((f) => f.id === "unknown-reference").invalidCases,
    1,
  );
  assert.equal(
    report.fixtures.find((f) => f.id === "duplicates").duplicateGroups.length,
    1,
  );
  assert.deepEqual(
    report.fixtures.find((f) => f.id === "missing-criterion").uncovered,
    ["R2"],
  );
  assert.equal(
    report.fixtures.find((f) => f.id === "assertion-types").validCases,
    6,
  );
  assert.ok(
    report.summary.validFraction > 0 && report.summary.validFraction < 1,
  );
});
test("offline results are deterministic", () =>
  assert.deepEqual(runOffline(), runOffline()));
test("automation summary counts not-blocked, blocked, and manual-only cases", () => {
  const { automationSummary } = require("../scripts/benchmark-generation.cjs");
  const mapped = (displayId, playwright) => ({
    displayId,
    automation: playwright ? { playwright } : {},
  });
  const summary = automationSummary({
    cases: [
      mapped("TC-001", { status: "draft", reason: "Review first." }),
      mapped("TC-002", { status: "ready", reason: "" }),
      mapped("TC-003", { status: "blocked", reason: "No message text." }),
      mapped("TC-004", { status: "manual-only", reason: "Needs a person." }),
      mapped("TC-005", null),
    ],
  });
  assert.deepEqual(summary, {
    totalCases: 5,
    notBlocked: 2,
    blocked: 1,
    manualOnly: 1,
    unmapped: 1,
    blockedReasons: [{ displayId: "TC-003", reason: "No message text." }],
  });
});
test("Playwright mode inspects the bundled demo page and reports blocked reasons", async (t) => {
  const { runLive } = require("../scripts/benchmark-generation.cjs");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  // Safety net: if the fake provider is ever ignored, no AI CLI can be found.
  const savedPath = process.env.PATH;
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "tb-no-ai-cli-"));
  process.env.PATH = emptyBin;
  t.after(() => {
    process.env.PATH = savedPath;
    fs.rmSync(emptyBin, { recursive: true, force: true });
  });
  const prompts = [];
  const report = await runLive("codex", {
    playwright: true,
    callProvider: async (prompt, input) => {
      prompts.push(prompt);
      const manual = {
        preconditions: "The contact form is open.",
        steps: ["Click Create contact."],
        requirementRef: "R1",
      };
      return {
        schemaVersion: 2,
        cases: [
          {
            ...manual,
            key: "runnable",
            title: "Create contact button is available",
            expected: "The Create contact button is visible.",
            automation: {
              playwright: {
                status: "draft",
                operations: [
                  {
                    op: "expectVisible",
                    locator: {
                      kind: "role",
                      role: "button",
                      value: "Create contact",
                      exact: true,
                      formIndex: 0,
                    },
                  },
                ],
              },
            },
          },
          {
            ...manual,
            key: "blocked",
            title: "Rejected email shows a message",
            expected: "A rejection message appears.",
            automation: {
              playwright: {
                status: "blocked",
                reason: "The rejection message text is unknown.",
              },
            },
          },
        ],
      };
    },
  });
  assert.equal(report.mode, "live-provider-playwright-demo");
  assert.equal(report.browserNavigation, true);
  assert.equal(report.fixtures.length, 3);
  // The real inspector visited the bundled page: its button reached the prompt.
  assert.ok(prompts.length >= 3);
  assert.ok(prompts.every((p) => p.includes('"Create contact"')));
  for (const fixture of report.fixtures) {
    assert.equal(fixture.error, undefined);
    assert.equal(fixture.automation.notBlocked, 1);
    assert.equal(fixture.automation.blocked, 1);
    assert.deepEqual(
      fixture.automation.blockedReasons.map((r) => r.reason),
      ["The rejection message text is unknown."],
    );
  }
  assert.equal(report.summary.totalCases, 6);
  assert.equal(report.summary.notBlocked, 3);
  assert.equal(report.summary.blocked, 3);
  assert.equal(report.summary.notBlockedShare, 0.5);
  assert.equal(report.summary.providerCalls, prompts.length);
});
test("CLI rejects Playwright mode without explicit live mode", () => {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const cli = path.resolve(__dirname, "../scripts/benchmark-generation.cjs");
  const result = spawnSync(process.execPath, [cli, "--playwright"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--playwright requires explicit --live/);
});
test("CLI defaults to offline JSON and rejects implicit provider usage", () => {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const cli = path.resolve(__dirname, "../scripts/benchmark-generation.cjs");
  const result = spawnSync(process.execPath, [cli], {
    encoding: "utf8",
    env: { PATH: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).providerInvoked, false);
  const invalid = spawnSync(process.execPath, [cli, "--provider", "codex"], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /explicit --live/);
});
