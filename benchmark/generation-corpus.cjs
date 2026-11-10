const input = {
  requirements: "A member can save a contact. An email address is required.",
  format: "plain",
  provider: "codex",
  frameworks: [],
  context: {
    acceptanceCriteria:
      "Saving a valid contact shows confirmation.\nSaving without an email shows a required-field error.",
  },
};
const manual = {
  key: "valid",
  title: "Save a valid contact",
  preconditions: "A member is signed in and the contact form is open.",
  steps: ["Enter a valid email address.", "Click Save."],
  expected: "A save confirmation appears.",
  requirementRef: "R1",
  automation: {},
};
const fixture = (id, cases, expected, overrides = {}) => ({
  id,
  input: { ...input, ...overrides },
  output: { schemaVersion: 2, cases },
  expected,
});
const loc = { kind: "label", value: "Email", exact: true };
const ops = [
  { op: "expectText", value: "Saved" },
  { op: "expectVisible", locator: loc },
  {
    op: "expectTextExact",
    locator: {
      kind: "role",
      role: "status",
      value: "Save result",
      exact: true,
    },
    value: "Saved",
  },
  { op: "expectValue", locator: loc, value: "member@example.test" },
  { op: "expectCount", locator: loc, value: 1 },
  { op: "expectURL", value: "https://fixture.example.test/contacts" },
];
const corpus = [
  fixture("valid", [manual], {
    valid: 1,
    invalid: 0,
    duplicates: 0,
    uncovered: 1,
  }),
  fixture("blank-expected", [{ ...manual, expected: "  " }], {
    valid: 0,
    invalid: 1,
    duplicates: 0,
    uncovered: 2,
  }),
  fixture("blank-steps", [{ ...manual, steps: [" "] }], {
    valid: 0,
    invalid: 1,
    duplicates: 0,
    uncovered: 2,
  }),
  fixture("unknown-reference", [{ ...manual, requirementRef: "R999" }], {
    valid: 0,
    invalid: 1,
    duplicates: 0,
    uncovered: 2,
  }),
  fixture(
    "duplicates",
    [manual, { ...manual, key: "copy", title: "Save another valid contact" }],
    { valid: 2, invalid: 0, duplicates: 1, uncovered: 1 },
  ),
  fixture("duplicate-key", [manual, { ...manual }], {
    valid: 1,
    invalid: 1,
    duplicates: 0,
    uncovered: 1,
  }),
  fixture("missing-criterion", [manual], {
    valid: 1,
    invalid: 0,
    duplicates: 0,
    uncovered: 1,
  }),
  fixture(
    "mapped-criteria",
    [
      manual,
      {
        ...manual,
        key: "required",
        title: "Reject missing email",
        steps: ["Leave Email empty.", "Click Save."],
        expected: "An email-required error appears.",
        requirementRef: "R2",
      },
    ],
    { valid: 2, invalid: 0, duplicates: 0, uncovered: 0 },
  ),
  fixture(
    "assertion-types",
    ops.map((op, i) => ({
      ...manual,
      key: `assert-${i}`,
      steps: [`Review supported assertion ${op.op}.`],
      automation: { playwright: { status: "draft", operations: [op] } },
    })),
    { valid: 6, invalid: 0, duplicates: 0, uncovered: 1 },
    {
      frameworks: ["playwright"],
      targetUrl: "https://fixture.example.test/contacts",
    },
  ),
  fixture(
    "assertion-invalid-count",
    [
      {
        ...manual,
        automation: {
          playwright: {
            status: "draft",
            operations: [{ op: "expectCount", locator: loc, value: -1 }],
          },
        },
      },
    ],
    { valid: 0, invalid: 1, duplicates: 0, uncovered: 2 },
    {
      frameworks: ["playwright"],
      targetUrl: "https://fixture.example.test/contacts",
    },
  ),
  fixture(
    "assertion-missing",
    [
      {
        ...manual,
        automation: {
          playwright: {
            status: "draft",
            operations: [
              {
                op: "click",
                locator: {
                  kind: "role",
                  role: "button",
                  value: "Save",
                  exact: true,
                },
              },
            ],
          },
        },
      },
    ],
    { valid: 0, invalid: 1, duplicates: 0, uncovered: 2 },
    {
      frameworks: ["playwright"],
      targetUrl: "https://fixture.example.test/contacts",
    },
  ),
];
// All live inputs are manual-only and synthetic. No fixture URL is visited.
const liveInputs = [
  { id: "required-email", input },
  {
    id: "quantity-boundaries",
    input: {
      ...input,
      requirements:
        "An order accepts integer quantities from 1 through 10, inclusive. Values outside this range are rejected.",
      context: {
        acceptanceCriteria:
          "Quantity 1 is accepted.\nQuantity 10 is accepted.\nQuantity 0 is rejected.\nQuantity 11 is rejected.",
      },
    },
  },
  {
    id: "role-permissions",
    input: {
      ...input,
      requirements:
        "Administrators may archive contacts. Read-only members cannot archive contacts.",
      context: {
        acceptanceCriteria:
          "An administrator can archive a contact.\nA read-only member cannot archive a contact.",
        userRole: "Administrator and read-only member",
        preconditions: "Use a synthetic contact in a test account.",
      },
    },
  },
];
module.exports = { corpus, liveInputs };
