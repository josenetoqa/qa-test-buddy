const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { callProvider } = require("../lib/generation-provider.cjs");

const cases = [
  {
    key: "c1",
    title: 'Use } and { in "titles"',
    preconditions: "The form is open.",
    steps: ["Click Save."],
    expected: "A confirmation appears.",
    requirementRef: "R1",
    automation: {},
  },
];
const answer = JSON.stringify({ schemaVersion: 2, cases });

// Runs callProvider against a fake CLI. PATH holds only the fake, so a real
// AI CLI can never be reached from these tests.
async function withFakeCli(t, name, stdout, exitCode = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tb-fake-cli-"));
  fs.writeFileSync(path.join(dir, "stdout.txt"), stdout);
  fs.writeFileSync(
    path.join(dir, name),
    `#!${process.execPath}\n` +
      "process.stdin.resume();process.stdin.on('end',()=>{" +
      "process.stdout.write(require('node:fs').readFileSync(__dirname+'/stdout.txt','utf8'));" +
      `process.exitCode=${exitCode};});`,
    { mode: 0o700 },
  );
  const saved = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME };
  process.env.PATH = dir;
  process.env.CODEX_HOME = dir;
  t.after(() => {
    process.env.PATH = saved.PATH;
    if (saved.CODEX_HOME === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = saved.CODEX_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return callProvider("prompt", { provider: name }, { timeoutMs: 10000 });
}
const claudeEnvelope = (result, extra = {}) =>
  JSON.stringify({ type: "result", is_error: false, result, ...extra });

test("Claude answer with text around the JSON is accepted", async (t) => {
  const output = await withFakeCli(
    t,
    "claude",
    claudeEnvelope(`Here are the cases:\n${answer}\nLet me know what to change.`),
  );
  assert.deepEqual(output, { schemaVersion: 2, cases });
});

test("Claude answer in a code fence after an introduction is accepted", async (t) => {
  const output = await withFakeCli(
    t,
    "claude",
    claudeEnvelope("Sure.\n```json\n" + answer + "\n```"),
  );
  assert.deepEqual(output, { schemaVersion: 2, cases });
});

test("braces in earlier prose and inside JSON strings do not break extraction", async (t) => {
  const output = await withFakeCli(
    t,
    "claude",
    claudeEnvelope(`The shape is {schemaVersion, cases}. ${answer} Done {ok}.`),
  );
  assert.equal(output.cases[0].title, 'Use } and { in "titles"');
});

test("Codex message with text around the JSON is accepted", async (t) => {
  const output = await withFakeCli(
    t,
    "codex",
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: `Result:\n${answer}` },
    }) + "\n",
  );
  assert.deepEqual(output, { schemaVersion: 2, cases });
});

test("an object without a cases list is not accepted from surrounding text", async (t) => {
  const output = await withFakeCli(
    t,
    "claude",
    claudeEnvelope('For example {"status":"draft"} would be one mapping.'),
  );
  assert.deepEqual(output, { invalidResponse: true });
});

test("Claude error flag stops generation instead of requesting a repair", async (t) => {
  await assert.rejects(
    withFakeCli(
      t,
      "claude",
      claudeEnvelope("Credit balance is too low", { is_error: true }),
    ),
    (error) =>
      error.status === 502 && /Credit balance is too low/.test(error.message),
  );
});

test("Claude error flag is reported when the CLI also exits with a failure", async (t) => {
  await assert.rejects(
    withFakeCli(
      t,
      "claude",
      claudeEnvelope("Invalid API key", { is_error: true }),
      1,
    ),
    (error) => error.status === 502 && /Invalid API key/.test(error.message),
  );
});
