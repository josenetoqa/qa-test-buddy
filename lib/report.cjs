function readResult(stdout, title, exitCode) {
  const error = { status: 'error', actual: 'Playwright did not return one complete result for this TC.' };
  try {
    const report = JSON.parse(stdout);
    if (!Array.isArray(report.suites) || report.errors?.length) return error;
    const specs = [];
    const collect = suite => { specs.push(...(suite.specs || [])); (suite.suites || []).forEach(collect); };
    report.suites.forEach(collect);
    if (specs.length !== 1 || specs[0].title !== title || specs[0].tests?.length !== 1 || specs[0].tests[0].results?.length !== 1) return error;
    const result = specs[0].tests[0].results[0];
    if (result.status === 'passed' && exitCode === 0) return { status: 'passed', durationMs: result.duration, actual: 'All assertions in this TC passed.' };
    if (['failed', 'timedOut'].includes(result.status)) return { status: 'failed', durationMs: result.duration, actual: (result.errors || []).map(e => e.message || '').join('\n').slice(0, 12000) || 'An assertion or action in this TC failed.' };
    return error;
  } catch { return error; }
}
module.exports = { readResult };
