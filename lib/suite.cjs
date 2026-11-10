const { randomUUID } = require("node:crypto");
const suites = new Map();
let retentionReferences = () => ({ revisions: [] });
function configureRetention(callback) {
  retentionReferences = callback;
}
function referenced() {
  const refs = retentionReferences() || {};
  return {
    suiteIds: new Set(refs.suiteIds || []),
    revisions: new Set(
      Array.from(refs.revisions || [], (r) =>
        typeof r === "string" ? r : r.suiteId + ":" + r.revision,
      ),
    ),
  };
}
function evictSuite() {
  const refs = referenced();
  for (const [id, history] of suites) {
    if (
      refs.suiteIds.has(id) ||
      [...history.keys()].some((rev) => refs.revisions.has(id + ":" + rev))
    )
      continue;
    suites.delete(id);
    return true;
  }
  return false;
}

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const { normalizeSteps, keys } = require("./suite-schema.cjs");
const { validateManual, qualityFor } = require("./generation-quality.cjs");
function createSuite(raw, input, { register = true, persist } = {}) {
  const requirements =
    input.requirements === undefined ? "" : input.requirements;
  if (typeof requirements !== "string" || requirements.length > 20000)
    throw fail("Requirements must be bounded to 20,000 characters.");
  const format = input.format === undefined ? "plain" : input.format;
  if (!["plain", "bdd"].includes(format))
    throw fail("Unsupported generation format.");
  if (
    !Array.isArray(input.frameworks) ||
    input.frameworks.some((f) => !["playwright", "cypress"].includes(f)) ||
    new Set(input.frameworks).size !== input.frameworks.length
  )
    throw fail("Unsupported generation frameworks.");
  keys(raw, ["schemaVersion", "cases", "automation"]);
  const explicitKeys = new Set();
  if (
    !Array.isArray(raw?.cases) ||
    raw.cases.length < 1 ||
    raw.cases.length > 8
  )
    throw fail("Expected 1–8 test cases.");
  if (register && suites.size >= 100 && !evictSuite())
    throw fail(
      "Suite storage is full; retained runs reference every suite.",
      503,
    );
  const suite = {
    schemaVersion: 2,
    suiteId: randomUUID(),
    revision: 1,
    provider: input.provider,
    targetUrl: input.targetUrl,
    createdAt: new Date().toISOString(),
    generationInput: {
      requirements,
      format,
      frameworks: [...input.frameworks],
    },
    cases: [],
  };
  suite.cases = raw.cases.map((item, index) => {
    validateManual(item, input.requirementCatalog);
    keys(item, [
      "key",
      "caseKey",
      "title",
      "preconditions",
      "steps",
      "expected",
      "requirementRef",
      "automation",
    ]);
    if (raw.schemaVersion === 2) {
      const key = item.key || item.caseKey;
      if (
        typeof key !== "string" ||
        !key ||
        key.length > 160 ||
        explicitKeys.has(key)
      )
        throw fail("Missing or duplicate case mapping.");
      explicitKeys.add(key);
    }
    keys(item.automation || {}, ["playwright", "cypress"]);
    for (const key of ["title", "preconditions", "expected", "requirementRef"])
      if (typeof item[key] !== "string" || item[key].length > 4000)
        throw fail("Invalid manual test case.");
    if (
      !item.title.trim() ||
      item.title.length > 240 ||
      !Array.isArray(item.steps) ||
      !item.steps.length ||
      item.steps.length > 24 ||
      item.steps.some((s) => typeof s !== "string" || s.length > 1000)
    )
      throw fail("Invalid manual test steps.");
    const automation = {};
    for (const framework of input.frameworks.filter((f) =>
      ["playwright", "cypress"].includes(f),
    )) {
      const draft = item.automation?.[framework];
      if (draft) {
        keys(draft, ["status", "reason", "steps", "operations"]);
        if (
          draft.status !== undefined &&
          !["draft", "ready", "blocked", "manual-only"].includes(draft.status)
        )
          throw fail("Unsupported automation status.");
      }
      if (raw.schemaVersion === 2 && !draft)
        throw fail("Missing explicit automation mapping.");
      if (!draft || ["blocked", "manual-only"].includes(draft.status))
        automation[framework] = {
          status: draft?.status || "manual-only",
          reason: String(
            draft?.reason || "No separate automation was provided for this TC.",
          ).slice(0, 1000),
          steps: [],
        };
      else {
        try {
          automation[framework] = {
            status: "draft",
            reason: "Review the actions and assertion before running.",
            steps: normalizeSteps(
              draft.operations || draft.steps,
              input.targetUrl,
            ),
          };
        } catch (error) {
          if (raw.schemaVersion === 2) throw error;
          automation[framework] = {
            status: "blocked",
            reason: error.message,
            steps: [],
          };
        }
      }
    }
    for (const a of Object.values(automation)) a.operations = a.steps;
    return {
      caseId: randomUUID(),
      displayId: `TC-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      preconditions: item.preconditions,
      steps: item.steps,
      expected: item.expected,
      requirementRef: item.requirementRef,
      automation,
    };
  });
  if (input.context)
    suite.generationInput.context = structuredClone(input.context);
  if (input.pageStateIds)
    suite.generationInput.pageStateIds = [...input.pageStateIds];
  if (input.requirementCatalog)
    suite.requirements = structuredClone(input.requirementCatalog);
  if (input.generation) suite.generation = structuredClone(input.generation);
  suite.quality = qualityFor(suite);
  if (persist) persist(structuredClone(suite));
  if (register)
    suites.set(suite.suiteId, new Map([[1, structuredClone(suite)]]));
  return structuredClone(suite);
}
function replaceCases(id, revision, replacements, metadata = {}, options = {}) {
  const suite = checkedSuite(id, revision);
  for (const [caseId, replacement] of Object.entries(replacements)) {
    const index = suite.cases.findIndex((c) => c.caseId === caseId);
    if (index < 0) throw fail("Unknown replacement case.", 404);
    const previous = suite.cases[index];
    suite.cases[index] = {
      ...structuredClone(replacement),
      caseId: previous.caseId,
      displayId: previous.displayId,
    };
  }
  if (metadata.generation)
    suite.generation = structuredClone(metadata.generation);
  if (metadata.pageStateIds)
    suite.generationInput.pageStateIds = [...metadata.pageStateIds];
  suite.quality = qualityFor(suite);
  return commit(suite, options);
}
function getSuite(id, revision) {
  const history = suites.get(id);
  if (!history) return null;
  return structuredClone(
    history.get(
      revision === undefined ? Math.max(...history.keys()) : revision,
    ) || null,
  );
}
function checkedSuite(id, revision) {
  const suite = getSuite(id);
  if (!suite) throw fail("Unknown suite.", 404);
  if (suite.revision !== revision)
    throw fail("Suite revision does not match.", 409);
  return suite;
}
function commit(suite, { persist } = {}) {
  const history = suites.get(suite.suiteId);
  let old;
  if (history.size >= 20) {
    const refs = referenced();
    old = [...history.keys()].find(
      (rev) =>
        rev !== suite.revision &&
        !refs.suiteIds.has(suite.suiteId) &&
        !refs.revisions.has(suite.suiteId + ":" + rev),
    );
    if (old === undefined)
      throw fail(
        "Suite revision storage is full; retained runs reference every revision.",
        503,
      );
  }
  suite.revision++;
  if (persist) persist(structuredClone(suite));
  if (old !== undefined) history.delete(old);
  history.set(suite.revision, structuredClone(suite));
  return structuredClone(suite);
}
function reviewCases(id, caseIds, revision, framework = "playwright") {
  const suite = checkedSuite(id, revision);
  if (
    !Array.isArray(caseIds) ||
    !caseIds.length ||
    caseIds.length > 8 ||
    new Set(caseIds).size !== caseIds.length
  )
    throw fail("Select distinct cases.");
  for (const cid of caseIds) {
    const item = suite.cases.find((c) => c.caseId === cid);
    if (!item) throw fail("Unknown case.");
    const auto = item.automation[framework];
    if (!auto || !["draft", "ready"].includes(auto.status))
      throw fail("Cannot review blocked/manual-only case.");
    normalizeSteps(auto.operations, suite.targetUrl);
    if (auto.verification?.results.some((r) => r.status === "ambiguous"))
      throw fail("Resolve ambiguous locators before review.", 409);
    auto.status = "ready";
    auto.reason = "";
    auto.reviewedAt = new Date().toISOString();
  }
  return commit(suite);
}
function reviseSuite(id, revision, { caseId, automationEdit }) {
  const suite = checkedSuite(id, revision);
  keys(automationEdit, ["operations"]);
  const item = suite.cases.find((c) => c.caseId === caseId);
  if (!item) throw fail("Unknown case.", 404);
  const operations = normalizeSteps(automationEdit.operations, suite.targetUrl);
  item.automation.playwright = {
    status: "draft",
    reason: "Edited actions require review.",
    operations,
    steps: operations,
  };
  return commit(suite);
}
function resolveCase(id, caseId, revision, framework = "playwright") {
  const suite = getSuite(id, revision);
  if (!suite) throw fail("Unknown suite revision.", 404);
  const testCase = suite.cases.find((c) => c.caseId === caseId);
  if (!testCase) throw fail("Unknown case.", 404);
  if (testCase.automation[framework]?.status !== "ready")
    throw fail("Review this TC before execution.", 409);
  normalizeSteps(testCase.automation[framework].operations, suite.targetUrl);
  return { suite, testCase };
}
function hydrateSuites(items) {
  for (const suite of items) {
    if (!suite?.suiteId || !Number.isInteger(suite.revision)) continue;
    if (!suites.has(suite.suiteId)) suites.set(suite.suiteId, new Map());
    suites.get(suite.suiteId).set(suite.revision, structuredClone(suite));
  }
}
function listSuiteRevisions() {
  return [...suites.values()].flatMap((h) =>
    [...h.values()].map((v) => structuredClone(v)),
  );
}
function recordVerification(id, caseId, revision, result) {
  const suite = checkedSuite(id, revision);
  const item = suite.cases.find((c) => c.caseId === caseId);
  if (!item) throw fail("Unknown case.", 404);
  item.automation.playwright.verification = structuredClone(result);
  if (result.results.some((r) => r.status === "ambiguous")) {
    item.automation.playwright.status = "draft";
    delete item.automation.playwright.reviewedAt;
  }
  return commit(suite);
}
module.exports = {
  replaceCases,
  configureRetention,
  recordVerification,
  createSuite,
  getSuite,
  reviewCases,
  resolveCase,
  normalizeSteps,
  reviseSuite,
  hydrateSuites,
  listSuiteRevisions,
};
