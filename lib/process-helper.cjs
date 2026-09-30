const { spawn } = require('node:child_process');
const MAX_OUTPUT = 128 * 1024;
function invoke(command, args, input, timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false, detached: true, cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
    });
    const streams = { stdout: [], stderr: [] };
    let bytes = 0;
    let termination;
    let killTimer;
    let settled = false;
    function signalTree(signal) {
      try { process.kill(-child.pid, signal); }
      catch { try { child.kill(signal); } catch { /* Already exited. */ } }
    }
    function terminate(error) {
      if (termination || settled) return;
      termination = error;
      signalTree('SIGTERM');
      killTimer = setTimeout(() => signalTree('SIGKILL'), 750);
      killTimer.unref?.();
    }
    function collect(stream, chunk) {
      if (termination) return;
      const buffer = Buffer.from(chunk);
      const available = MAX_OUTPUT - bytes;
      streams[stream].push(buffer.subarray(0, available));
      bytes += Math.min(buffer.length, available);
      if (buffer.length > available) terminate(new Error('CLI output exceeded the 128 KB combined limit.'));
    }
    const timer = setTimeout(() => terminate(new Error('The CLI took too long and was stopped.')), timeoutMs);
    child.stdout.on('data', chunk => collect('stdout', chunk));
    child.stderr.on('data', chunk => collect('stderr', chunk));
    child.stdin.on('error', () => { /* Exit/start errors are reconciled at close. */ });
    child.once('error', error => { termination = new Error(`${command} could not start: ${error.message}`); });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer);
      const output = Object.fromEntries(Object.entries(streams).map(([key, buffers]) => [key, Buffer.concat(buffers).toString('utf8')]));
      const error = termination || (code === 0 ? null : new Error(`${command} exited with ${code ?? signal}.`));
      if (error) { Object.assign(error, output, { truncated: bytes >= MAX_OUTPUT }); reject(error); }
      else resolve(output);
    });
    child.stdin.end(input);
  });
}
module.exports = { invoke };
