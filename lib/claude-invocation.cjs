// Arguments for one isolated, non-interactive Claude CLI generation call.
// The Codex equivalent lives in codex-invocation.cjs.
function claudeArgs() {
  return [
    "-p",
    "--output-format",
    "json",
    // No tools: the answer is data, never an action.
    "--tools",
    "",
    "--permission-mode",
    "dontAsk",
    // Leave out personal customizations (CLAUDE.md, skills, plugins, hooks,
    // MCP servers) so they cannot change the generated cases. Sign-in and
    // model selection still apply. Do not use --bare here: it ignores the
    // normal sign-in.
    "--safe-mode",
    "--strict-mcp-config",
    // Do not keep the prompt on disk as a resumable session.
    "--no-session-persistence",
  ];
}
module.exports = { claudeArgs };
