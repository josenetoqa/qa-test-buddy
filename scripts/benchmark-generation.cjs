#!/usr/bin/env node
const {
  catalogFor,
  assessCases,
  qualityFor,
} = require("../lib/generation-quality.cjs");
const { corpus, liveInputs } = require("../benchmark/generation-corpus.cjs");
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
async function runLive(provider) {
  if (!["codex", "claude"].includes(provider))
    throw new Error(
      "Live mode requires --provider codex or --provider claude.",
    );
  const { createGenerationService } = require("../lib/generation-service.cjs");
  const { callProvider } = require("../lib/generation-provider.cjs");
  const { inspectPage } = require("../lib/page-inspector.cjs");
  const suiteStore = require("../lib/suite-store.cjs");
  const attempts = [];
  const service = createGenerationService({
    suiteStore,
    saveSuite: () => {},
    inspect: inspectPage,
    callProvider: async (prompt, input, options) => {
      const started = performance.now();
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
    for (const fixture of liveInputs) {
      currentFixture = fixture.id;
      const input = {
        ...structuredClone(fixture.input),
        provider,
        frameworks: [],
      };
      const started = performance.now();
      try {
        const suite = await service.generate(input);
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
  }
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
    provider,
    output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--live") live = true;
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
  const report = live ? await runLive(provider) : runOffline();
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
module.exports = { runOffline, runLive, evaluate, main };
