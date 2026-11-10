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
test('inspection produces scoped roles and bounded field metadata', async () => {
  const server = createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<form><label>Age<input type="number" min="1" max="99" required></label><input data-testid="email" placeholder="Email" maxlength="120"><button disabled>Save</button><a href="/next">Continue</a></form>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const result = await inspectPage(`http://127.0.0.1:${server.address().port}`);
    const age = result.controls.find(c=>c.name === 'Age');
    assert.equal(age.locator.kind,'label'); assert.equal(age.required,true); assert.equal(age.min,'1'); assert.equal(age.max,'99');
    const button = result.controls.find(c=>c.name === 'Save');
    assert.deepEqual(button.locator,{kind:'role',role:'button',value:'Save',exact:true,formIndex:0}); assert.equal(button.disabled,true);
    const field = result.controls.find(c=>c.placeholder === 'Email'); assert.equal(field.locator.kind,'testId'); assert.equal(field.maxLength,120);
    assert.equal(result.controls.find(c=>c.name === 'Continue').locator.role,'link');
  } finally {await new Promise(r=>server.close(r));}
});
test('pre-aborted inspection does not launch', async()=>{
  const controller = new AbortController();controller.abort();
  await assert.rejects(inspectPage('http://localhost',{signal:controller.signal}),{name:'AbortError'});
});
test('aborting an in-flight navigation returns a cancellation', async()=>{
  const server = createServer((req,res)=>{});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),350);
  try {await assert.rejects(inspectPage(`http://127.0.0.1:${server.address().port}`,{signal:controller.signal}),{name:'AbortError'});}
  finally {clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));}
});
