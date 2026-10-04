const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { inspectPage } = require('../lib/page-inspector.cjs');
test('inspection reads visible labels without collecting values or submitting', async () => {
  let submitted = false;
  const server = createServer((req, res) => {
    if (req.url === '/submit') submitted = true;
    res.setHeader('content-type', 'text/html');
    res.end('<label>Email<input value="private-value"></label><input type="password" value="private-password"><input type="hidden" value="private-token"><button hidden>Hidden control</button><button onclick="fetch(\'/submit\')">Register</button>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const result = await inspectPage(`http://127.0.0.1:${server.address().port}`);
    const data = JSON.stringify(result);
    assert.ok(data.includes('Email')); assert.ok(data.includes('Register'));
    assert.ok(!data.includes('private-')); assert.ok(!data.includes('Hidden control'));
    assert.equal(submitted, false);
  } finally { await new Promise(r => server.close(r)); }
});
test('inspection fails clearly for HTTP errors', async () => {
  const server = createServer((req, res) => { res.writeHead(403); res.end('Private page'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await assert.rejects(inspectPage(`http://127.0.0.1:${server.address().port}`), /Page inspection failed/); }
  finally { await new Promise(r => server.close(r)); }
});
