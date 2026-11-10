const test=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const {verifyLocators}=require('../lib/locator-verifier.cjs');
test('read-only locator probe flags duplicates and defers checks after interactions',async()=>{let clicks=0;const server=http.createServer((req,res)=>{if(req.url==='/clicked')clicks++;res.end('<button onclick="fetch(\'/clicked\')">Duplicate</button><button>Duplicate</button><span style="display:none">Hidden</span>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const targetUrl=`http://127.0.0.1:${server.address().port}`;const suite={targetUrl,cases:[{caseId:'c1',automation:{playwright:{operations:[{stepId:'s1',op:'click',locator:{kind:'text',value:'Duplicate',exact:true}},{stepId:'s2',op:'expectVisible',locator:{kind:'text',value:'Hidden',exact:true}},{stepId:'s3',op:'expectVisible',locator:{kind:'text',value:'Missing',exact:true}}]}}}]};const result=await verifyLocators(suite,'c1');assert.deepEqual(result.results.map(r=>r.status),['ambiguous','deferred','deferred']);assert.equal(clicks,0);}finally{await new Promise(r=>server.close(r));}});

test('blocked cases without actions return an actionable error',async()=>{await assert.rejects(verifyLocators({targetUrl:'http://127.0.0.1',cases:[{caseId:'c',automation:{playwright:{status:'blocked',operations:[]}}}]},'c'),error=>error.status===409&&/Add valid automation actions/.test(error.message));});

async function withPage(html, run) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}
const expectVisible = (stepId, value) => ({ stepId, op: 'expectVisible', locator: { kind: 'role', role: 'button', value, exact: true } });
const suiteFor = (targetUrl, operations) => ({ targetUrl, cases: [{ caseId: 'c1', automation: { playwright: { operations } } }] });

test('a control that renders after page load is matched, not reported absent', async () => {
  const html = '<div id="root"></div><script>setTimeout(()=>{document.getElementById("root").innerHTML="<button>Sign in</button>";},1000);</script>';
  await withPage(html, async url => {
    const result = await verifyLocators(suiteFor(url, [expectVisible('s1', 'Sign in')]), 'c1');
    assert.deepEqual(result.results.map(r => [r.stepId, r.status, r.count]), [['s1', 'matched', 1]]);
  });
});

test('missing controls are still reported absent, and they share one bounded wait', async () => {
  await withPage('<button>Present</button>', async url => {
    const started = Date.now();
    const result = await verifyLocators(suiteFor(url, [expectVisible('s1', 'Missing one'), expectVisible('s2', 'Missing two'), expectVisible('s3', 'Present')]), 'c1');
    const elapsed = Date.now() - started;
    assert.deepEqual(result.results.map(r => r.status), ['absent', 'absent', 'matched']);
    // One shared wait of about 5 s. A separate wait per missing control would take 10 s or more.
    assert.ok(elapsed < 9000, `locator check took ${elapsed} ms`);
  });
});
