const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { invoke } = require("./process-helper.cjs");
const { codexArgs } = require("./codex-invocation.cjs");
function extractJson(text) {
  return JSON.parse(
    String(text)
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
function parseProviderOutput(provider, stdout) {
  if (provider === "claude") {
    try {
      const parsed = JSON.parse(stdout);
      if (typeof parsed.result === "string") return extractJson(parsed.result);
      if (parsed.structured_output) return parsed.structured_output;
    } catch {}
  } else {
    const events = stdout.split(/\r?\n/).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const message = events
      .reverse()
      .find(
        (e) => e.type === "item.completed" && e.item?.type === "agent_message",
      );
    if (message?.item?.text) return extractJson(message.item.text);
  }
  return extractJson(stdout);
}
async function callProvider(
  prompt,
  input,
  { signal, timeoutMs = 300000 } = {},
) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "test-buddy-generation-"));
  try {
    const args =
      input.provider === "codex"
        ? codexArgs(cwd)
        : [
            "-p",
            "--output-format",
            "json",
            "--tools",
            "",
            "--permission-mode",
            "dontAsk",
          ];
    const { stdout } = await invoke(input.provider, args, prompt, timeoutMs, {
      cwd,
      signal,
    });
    // Invalid JSON enters the same single bounded repair path as invalid cases.
    try {
      return parseProviderOutput(input.provider, stdout);
    } catch {
      return { invalidResponse: true };
    }
  } catch (error) {
    if (signal?.aborted) throw new Error("Generation canceled.");
    const message =
      error.message === "The CLI took too long and was stopped."
        ? "The AI CLI exceeded the generation deadline."
        : error.message;
    throw Object.assign(new Error(message), { status: 502 });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
module.exports = { callProvider, parseProviderOutput };
