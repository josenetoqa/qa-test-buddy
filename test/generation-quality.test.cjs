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
const draft = (operations) => ({
  ...item(),
  automation: { playwright: { status: "draft", operations } },
});
test("an unknown operation field is named together with the allowed fields", () => {
  const { invalid } = assessCases(
    { schemaVersion: 2, cases: [draft([{ action: "click", value: "Save" }])] },
    input,
  );
  assert.equal(invalid.length, 1);
  assert.match(invalid[0].error, /fields: action\./);
  assert.match(invalid[0].error, /Allowed fields: .*\bop\b.*\blocator\b/);
});
test("a missing framework mapping is named", () => {
  const { invalid } = assessCases(
    { schemaVersion: 2, cases: [{ ...item(), automation: {} }] },
    input,
  );
  assert.match(invalid[0].error, /Missing playwright automation mapping/);
});
test("validation hints echo bounded field names and never field values", () => {
  const extra = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [`extra${i}`, "PRIVATE-VALUE"]),
  );
  const operation = {
    op: "expectText",
    value: "Saved",
    ["k".repeat(500)]: "PRIVATE-VALUE",
    "bad\nname<script>": 1,
    ...extra,
  };
  const { invalid } = assessCases(
    { schemaVersion: 2, cases: [draft([operation])] },
    input,
  );
  const error = invalid[0].error;
  assert.ok(!error.includes("PRIVATE-VALUE"));
  assert.ok(!error.includes("<script>"));
  assert.ok(!error.includes("\n"));
  assert.ok(error.length <= 400, `hint is ${error.length} characters`);
  // 11 unknown fields: five are named, the rest are counted.
  assert.match(error, /and 6 more/);
});
test("prompt shows an operation example that passes the same validation as model output", () => {
  const { OPERATIONS_EXAMPLE } = require("../lib/generation-quality.cjs");
  const prompt = buildPrompt(input, { controls: [] });
  assert.ok(prompt.includes(JSON.stringify(OPERATIONS_EXAMPLE)));
  assert.ok(prompt.includes('"op"'));
  const { valid, invalid } = assessCases(
    { schemaVersion: 2, cases: [draft(OPERATIONS_EXAMPLE)] },
    input,
  );
  assert.deepEqual(
    invalid.map((e) => e.error),
    [],
  );
  assert.equal(valid.length, 1);
});
