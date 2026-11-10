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
