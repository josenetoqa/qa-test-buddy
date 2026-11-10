#!/usr/bin/env node
const {
  catalogFor,
  assessCases,
  qualityFor,
} = require("../lib/generation-quality.cjs");
const {
  corpus,
  liveInputs,
  playwrightInputs,
} = require("../benchmark/generation-corpus.cjs");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
// The only files the benchmark's local copy of the demo page may serve.
const DEMO_FILES = {
  "/demo/": ["demo/index.html", "text/html"],
  "/demo/demo.js": ["demo/demo.js", "text/javascript"],
  "/demo/demo.css": ["demo/demo.css", "text/css"],
  "/styles.css": ["styles.css", "text/css"],
};
function startDemoServer() {
  const server = http.createServer((req, res) => {
    const entry = DEMO_FILES[new URL(req.url, "http://127.0.0.1").pathname];
    if (!entry) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": `${entry[1]}; charset=utf-8` });
    res.end(fs.readFileSync(path.join(ROOT, entry[0])));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/demo/`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(done);
          }),
      }),
    ),
  );
}
// "Not blocked" means the mapping passed structural checks. It does not mean
// the test passes, or that it proves the requirement.
function automationSummary(suite, framework = "playwright") {
  const result = {
    totalCases: suite.cases.length,
    notBlocked: 0,
    blocked: 0,
    manualOnly: 0,
    unmapped: 0,
    blockedReasons: [],
  };
  for (const item of suite.cases) {
    const mapping = item.automation?.[framework];
    if (!mapping) result.unmapped++;
    else if (mapping.status === "blocked") {
      result.blocked++;
      result.blockedReasons.push({
        displayId: item.displayId,
        reason: mapping.reason,
      });
    } else if (mapping.status === "manual-only") result.manualOnly++;
    else result.notBlocked++;
  }
  return result;
}
function playwrightSummary(fixtures, providerCalls) {
  const sum = (key) => fixtures.reduce((n, f) => n + f.automation[key], 0);
  const totalCases = sum("totalCases");
  return {
    fixtures: fixtures.length,
    failedFixtures: fixtures.filter((f) => f.error).length,
    totalCases,
    notBlocked: sum("notBlocked"),
    blocked: sum("blocked"),
    manualOnly: sum("manualOnly"),
    unmapped: sum("unmapped"),
    notBlockedShare: totalCases ? sum("notBlocked") / totalCases : 0,
    providerCalls,
    repairRequests: fixtures.reduce(
      (n, f) => n + (f.metrics?.repairCount || 0),
      0,
    ),
  };
}
const limitations = [
  "Structural validity and requirement references do not prove semantic coverage or correct expected results.",
  "Duplicate detection identifies normalized exact content only; human review must check near duplicates.",
];
function evaluate(id, input, output) {
  const assessment = assessCases(output, input);
  const quality = qualityFor({
    requirements: catalogFor(input),
    cases: assessment.valid.map(({ item }, i) => ({
      ...item,
      caseId: `${id}-${i + 1}`,
    })),
  });
  return {
    id,
    totalCases: output.cases.length,
    validCases: assessment.valid.length,
    invalidCases: assessment.invalid.length,
    validFraction: assessment.valid.length / output.cases.length,
    errors: assessment.invalid.map((e) => ({ index: e.index, error: e.error })),
    requirementMapping: quality.coverage,
    uncovered: quality.uncovered,
    duplicateGroups: quality.duplicateGroups,
  };
}
function summary(fixtures) {
  const totalCases = fixtures.reduce((n, f) => n + f.totalCases, 0),
    validCases = fixtures.reduce((n, f) => n + f.validCases, 0);
  return {
    fixtures: fixtures.length,
    totalCases,
    validCases,
    invalidCases: totalCases - validCases,
    validFraction: totalCases ? validCases / totalCases : 0,
    duplicateGroups: fixtures.reduce((n, f) => n + f.duplicateGroups.length, 0),
    unmappedRequirements: fixtures.reduce((n, f) => n + f.uncovered.length, 0),
  };
}
function runOffline() {
  const fixtures = corpus.map((f) => {
    const result = evaluate(f.id, f.input, f.output);
    return {
      ...result,
      expected: f.expected,
      expectationsMet:
        result.validCases === f.expected.valid &&
        result.invalidCases === f.expected.invalid &&
        result.duplicateGroups.length === f.expected.duplicates &&
        result.uncovered.length === f.expected.uncovered,
    };
  });
  return {
    mode: "offline-only",
    providerInvoked: false,
    semanticCorrectnessValidated: false,
    limitations,
    summary: {
      ...summary(fixtures),
      fixtureExpectationFailures: fixtures.filter((f) => !f.expectationsMet)
        .length,
    },
    fixtures,
  };
}
async function runLive(provider, options = {}) {
  if (!["codex", "claude"].includes(provider))
    throw new Error(
      "Live mode requires --provider codex or --provider claude.",
    );
  const { createGenerationService } = require("../lib/generation-service.cjs");
  const callProvider =
    options.callProvider ||
    require("../lib/generation-provider.cjs").callProvider;
  const { inspectPage } = require("../lib/page-inspector.cjs");
  const suiteStore = require("../lib/suite-store.cjs");
  const playwright = Boolean(options.playwright);
  const demo = playwright ? await startDemoServer() : null;
  const attempts = [];
  let providerCalls = 0;
  const service = createGenerationService({
    suiteStore,
    saveSuite: () => {},
    inspect: inspectPage,
    callProvider: async (prompt, input, options) => {
      const started = performance.now();
      providerCalls++;
      const output = await callProvider(prompt, input, options);
      let assessment;
      try {
        assessment = evaluate(currentFixture, input, output);
      } catch (error) {
        assessment = { structuralError: error.message };
      }
      attempts.push({
        fixtureId: currentFixture,
        elapsedMs: Math.round(performance.now() - started),
        assessment,
        output,
      });
      return output;
    },
  });
  const fixtures = [];
  let currentFixture;
  try {
    for (const fixture of playwright ? playwrightInputs : liveInputs) {
      currentFixture = fixture.id;
      const input = {
        ...structuredClone(fixture.input),
        provider,
        frameworks: playwright ? ["playwright"] : [],
        ...(playwright ? { targetUrl: demo.url } : {}),
      };
      const started = performance.now();
      try {
        const suite = await service.generate(input);
        if (playwright) {
          fixtures.push({
            id: fixture.id,
            automation: automationSummary(suite),
            uncovered: suite.quality.uncovered,
            duplicateGroups: suite.quality.duplicateGroups,
            elapsedMs: Math.round(performance.now() - started),
            metrics: suite.generation?.metrics,
            warnings: suite.generation?.warnings,
            input,
            cases: suite.cases.map((c) => ({
              displayId: c.displayId,
              title: c.title,
              preconditions: c.preconditions,
              steps: c.steps,
              expected: c.expected,
              requirementRef: c.requirementRef,
              automation: {
                status: c.automation.playwright?.status,
                reason: c.automation.playwright?.reason,
                operations: c.automation.playwright?.operations,
              },
            })),
          });
          continue;
        }
        const output = {
          schemaVersion: 2,
          cases: suite.cases.map((c, i) => ({
            key: `case-${i + 1}`,
            title: c.title,
            preconditions: c.preconditions,
            steps: c.steps,
            expected: c.expected,
            requirementRef: c.requirementRef,
            automation: {},
          })),
        };
        fixtures.push({
          ...evaluate(fixture.id, input, output),
          elapsedMs: Math.round(performance.now() - started),
          metrics: suite.generation?.metrics,
          input,
          output,
        });
      } catch (error) {
        fixtures.push({
          id: fixture.id,
          totalCases: 0,
          validCases: 0,
          invalidCases: 0,
          ...(playwright
            ? { automation: automationSummary({ cases: [] }) }
            : {}),
          duplicateGroups: [],
          uncovered: catalogFor(input).map((r) => r.id),
          elapsedMs: Math.round(performance.now() - started),
          error: error.message,
          input,
        });
      }
    }
  } finally {
    await service.close();
    await demo?.close();
  }
  if (playwright)
    return {
      mode: "live-provider-playwright-demo",
      provider,
      providerInvoked: true,
      browserNavigation: true,
      target: "Bundled demo page served from a local loopback port.",
      semanticCorrectnessValidated: false,
      limitations: [
        ...limitations,
        'A "not blocked" case passed structural checks only. It was not executed, and nothing shows that it passes or proves its requirement.',
        "One page and three scenarios cannot describe other applications.",
      ],
      summary: playwrightSummary(fixtures, providerCalls),
      fixtures,
      providerAttempts: attempts,
      humanReview: [
        "Check each expected result against the supplied criteria.",
        "Check that every not-blocked case has an assertion that proves its expected result.",
        "Check that each blocked reason names something the page or the requirements really lack.",
        "Review all raw provider attempts, including repaired output.",
      ],
    };
  return {
    mode: "live-provider-manual-only",
    provider,
    providerInvoked: true,
    browserNavigation: false,
    semanticCorrectnessValidated: false,
    limitations: [
      ...limitations,
      "Reported valid fraction describes final service outputs after its bounded repair; raw provider attempts are included for separate human review.",
    ],
    summary: summary(fixtures),
    fixtures,
    providerAttempts: attempts,
    humanReview: [
      "Check each expected result against the supplied criteria.",
      "Check boundary and permission scenarios for missing coverage.",
      "Check that manual steps are reproducible and no behavior was invented.",
      "Review duplicates and all raw provider attempts, including repaired output.",
    ],
  };
}
async function main(args = process.argv.slice(2)) {
  let live = false,
    playwright = false,
    provider,
    output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--live") live = true;
    else if (args[i] === "--playwright") playwright = true;
    else if (args[i] === "--provider") {
      provider = args[++i];
      if (!["codex", "claude"].includes(provider))
        throw new Error("Choose codex or claude.");
    } else if (args[i] === "--output") {
      output = args[++i];
      if (!output || output.startsWith("--"))
        throw new Error("Provide an output path.");
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  if (provider && !live)
    throw new Error("--provider requires explicit --live.");
  if (playwright && !live)
    throw new Error("--playwright requires explicit --live.");
  const report = live ? await runLive(provider, { playwright }) : runOffline();
  const json = JSON.stringify(report, null, 2) + "\n";
  if (output) require("node:fs").writeFileSync(output, json, { flag: "wx" });
  else process.stdout.write(json);
  if (report.summary.fixtureExpectationFailures) process.exitCode = 1;
  return report;
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { runOffline, runLive, evaluate, automationSummary, main };
