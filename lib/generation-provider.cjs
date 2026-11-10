const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { invoke } = require("./process-helper.cjs");
const { codexArgs } = require("./codex-invocation.cjs");
const { claudeArgs } = require("./claude-invocation.cjs");
// Returns the end index of the object that opens at `start`, or -1.
// Braces inside JSON strings are skipped.
function objectEnd(text, start) {
  let depth = 0,
    inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}
// A model may wrap its answer in a sentence or a code fence. Only an object
// that holds a `cases` list is accepted from surrounding text.
function findCasesObject(text) {
  let attempts = 0;
  for (
    let start = text.indexOf("{");
    start !== -1 && attempts < 50;
    start = text.indexOf("{", start + 1), attempts++
  ) {
    const end = objectEnd(text, start);
    if (end === -1) continue;
    try {
      const value = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(value?.cases)) return value;
    } catch {
      /* Not JSON; try the next opening brace. */
    }
  }
  throw new Error("No JSON object with a cases list was found.");
}
function extractJson(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(
      trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  } catch {
    return findCasesObject(trimmed);
  }
}
// The Claude CLI wraps its answer in an envelope that can flag its own error.
function claudeFailure(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (envelope?.is_error !== true) return null;
  const detail = String(envelope.result || envelope.subtype || "unknown error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return Object.assign(new Error(`Claude CLI reported an error: ${detail}`), {
    providerFailure: true,
  });
}
function parseProviderOutput(provider, stdout) {
  if (provider === "claude") {
    const failure = claudeFailure(stdout);
    if (failure) throw failure;
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      /* Not an envelope; treat stdout as the answer below. */
    }
    if (typeof parsed?.result === "string") return extractJson(parsed.result);
    if (parsed?.structured_output) return parsed.structured_output;
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
    const args = input.provider === "codex" ? codexArgs(cwd) : claudeArgs();
    const { stdout } = await invoke(input.provider, args, prompt, timeoutMs, {
      cwd,
      signal,
    });
    // Invalid JSON enters the same single bounded repair path as invalid cases.
    let output;
    try {
      output = parseProviderOutput(input.provider, stdout);
    } catch (error) {
      // A repair request cannot fix an error the provider itself reported.
      if (error.providerFailure) throw error;
      return { invalidResponse: true };
    }
    return output;
  } catch (error) {
    if (signal?.aborted) throw new Error("Generation canceled.");
    const reported =
      input.provider === "claude" && typeof error.stdout === "string"
        ? claudeFailure(error.stdout)
        : null;
    const message = reported
      ? reported.message
      : error.message === "The CLI took too long and was stopped."
        ? "The AI CLI exceeded the generation deadline."
        : error.message;
    throw Object.assign(new Error(message), { status: 502 });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
module.exports = { callProvider, parseProviderOutput };
