const test = require("node:test");
const assert = require("node:assert/strict");
const {
  catalogFor,
  assessCases,
  qualityFor,
  buildPrompt,
} = require("../lib/generation-quality.cjs");
const { createSuite } = require("../lib/suite.cjs");
const input = {
  requirements: "Save a contact.",
  context: { acceptanceCriteria: "Show confirmation\nReject missing email" },
  frameworks: ["playwright"],
  targetUrl: "https://example.test",
  format: "plain",
};
const item = (key = "c1") => ({
  key,
  title: "Save contact",
  preconditions: "",
  steps: ["Click Save"],
  expected: "Contact saved",
  requirementRef: "R1",
  automation: {
    playwright: {
      status: "draft",
      operations: [{ op: "expectText", value: "Contact saved" }],
    },
  },
});
test("criteria get deterministic IDs without interpreting free text", () => {
  assert.deepEqual(catalogFor(input), [
    { id: "R1", text: "Show confirmation" },
    { id: "R2", text: "Reject missing email" },
  ]);
  assert.equal(
    catalogFor({ ...input, context: {} })[0].text,
    input.requirements,
  );
});
test("rejects blank manual steps/results and unknown references independently", () => {
  const cases = [
    item(),
    { ...item("c2"), expected: " " },
    { ...item("c3"), steps: [""] },
    { ...item("c4"), requirementRef: "invented" },
  ];
  const result = assessCases({ cases }, input);
  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 3);
  assert.equal(result.invalid[0].index, 1);
});
test("suite boundary also rejects empty expected and steps", () => {
  for (const patch of [{ expected: "" }, { steps: [" "] }])
    assert.throws(
      () => createSuite({ cases: [{ ...item(), ...patch }] }, input),
      /expected|steps/i,
    );
});
test("coverage marks uncovered requirements and flags duplicates without removing them", () => {
  const suite = {
    requirements: catalogFor(input),
    cases: [
      { ...item(), caseId: "a" },
      { ...item("c2"), caseId: "b" },
    ],
  };
  const q = qualityFor(suite);
  assert.deepEqual(q.uncovered, ["R2"]);
  assert.deepEqual(q.duplicateGroups, [["a", "b"]]);
  assert.equal(q.coverage[0].caseIds.length, 2);
});
test("prompt describes all assertions and has no registration-specific rule", () => {
  const prompt = buildPrompt(input, { controls: [] });
  for (const op of [
    "expectText",
    "expectURL",
    "expectVisible",
    "expectValue",
    "expectCount",
    "expectTextExact",
  ])
    assert.ok(prompt.includes(op));
  assert.ok(!prompt.includes("registration-opening"));
  assert.ok(prompt.includes("R2"));
});
