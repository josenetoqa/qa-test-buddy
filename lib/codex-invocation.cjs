const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function codexArgs(cwd, configPath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')) {
  const args = ['exec', '--ignore-user-config', '--cd', cwd, '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '-c', 'developer_instructions=' + JSON.stringify('This invocation generates structured QA JSON data only; it is not implementing code. Do not invoke tools or start skill workflows. Use only the supplied requirements and observed controls. Return only the requested JSON response.')];
  // Retain model preferences while skipping MCPs, plugins, and hooks unrelated to generation.
  let config = '';
  try { config = fs.readFileSync(configPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const root = config.split(/^\s*\[/m)[0];
  for (const key of ['model', 'model_reasoning_effort', 'model_provider']) {
    const setting = root.match(new RegExp('^' + key + '\\s*=\\s*("[^"\\r\\n]*"|\'[^\'\\r\\n]*\')\\s*(?:#.*)?$', 'm'));
    if (setting) args.push('-c', key + '=' + setting[1]);
  }
  // Custom providers require their provider table; do not silently switch to OpenAI.
  const provider = root.match(/^model_provider\s*=\s*["']([^"']+)["']/m)?.[1];
  if (provider && provider !== 'openai') throw new Error('Test Buddy isolated generation currently supports the OpenAI Codex provider. Custom provider configuration needs explicit support.');
  args.push('-');
  return args;
}
module.exports = { codexArgs };
