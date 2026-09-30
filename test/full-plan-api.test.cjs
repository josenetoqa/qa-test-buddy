const test=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
const root=path.resolve(__dirname,'..'), data=fs.mkdtempSync(path.join(os.tmpdir(),'test-buddy-plan-')),port=4196,base=`http://127.0.0.1:${port}`;
let child;
async function start(){child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),TEST_BUDDY_DATA_DIR:data},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let stderr='';const timer=setTimeout(()=>reject(new Error('Server startup timeout: '+stderr)),10000);child.stderr.on('data',c=>{stderr+=c.toString()});child.on('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(new Error(stderr))});child.stdout.on('data',c=>{if(c.toString().includes('available at')){clearTimeout(timer);resolve()}})});}
async function stop(){if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
async function api(route,body,method='POST'){const response=await fetch(base+route,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,body:await response.json()};}
async function completed(id){for(let i=0;i<100;i++){const{body}=await api('/api/runs/'+id,undefined,'GET');if(!['running','queued'].includes(body.status))return body;await new Promise(r=>setTimeout(r,150));}throw new Error('Runner did not finish');}
test.before(start);test.after(async()=>{await stop();fs.rmSync(data,{recursive:true,force:true})});
test('immutable review, server batch, complete reporter events and durable restart', {timeout:60000},async()=>{
 const draft=await api('/api/demo/suites',{});assert.equal(draft.status,200);let suite=draft.body;assert.equal(suite.cases.length,3);
 const review=await api(`/api/suites/${suite.suiteId}/review`,{expectedRevision:suite.revision,caseIds:suite.cases.map(c=>c.caseId),reviewed:true},'PATCH');assert.equal(review.status,200);const previous=suite.revision;suite=review.body;assert.equal(suite.revision,previous+1);
 assert.equal((await api(`/api/suites/${suite.suiteId}?revision=${previous}`,undefined,'GET')).body.cases[0].automation.playwright.status,'draft');
 const body={schemaVersion:2,framework:'playwright',suiteId:suite.suiteId,revision:suite.revision,selectedCaseIds:suite.cases.map(c=>c.caseId),mode:'headless',idempotencyKey:'integration-batch'};
 const [a,b]=await Promise.all([api('/api/runs',body),api('/api/runs',body)]);assert.equal(a.status,202);assert.equal(a.body.runId,b.body.runId);assert.equal((await api('/api/runs',{...body,mode:'headed'})).status,409);
 const run=await completed(a.body.runId);assert.equal(run.status,'failed');assert.deepEqual(run.cases.map(c=>c.status),['passed','failed','passed']);assert.equal(run.cases.every(c=>c.steps.length>=2),true);
 const events=await api(`/api/runs/${run.runId}/events?afterSeq=0`,undefined,'GET');assert.equal(events.status,200);assert.equal(events.body.events.some(e=>e.type==='stepEnd'),true);
 const failed=run.cases.find(c=>c.status==='failed');assert.equal(failed.artifacts.some(a=>a.kind==='trace'),true);assert.equal(failed.artifacts.some(a=>a.kind==='screenshot'),true);
 for(const artifact of failed.artifacts){const response=await fetch(`${base}/api/runs/${run.runId}/artifacts/${artifact.artifactId}`);assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength>0,true);}
 const report=await fetch(`${base}/api/runs/${run.runId}/export?format=markdown`);assert.equal(report.status,200);assert.match(await report.text(),/Intentional failure/);
 await stop();await start();assert.equal((await api('/api/runs/'+run.runId,undefined,'GET')).body.status,'failed');assert.equal((await api(`/api/suites/${suite.suiteId}?revision=${suite.revision}`,undefined,'GET')).body.revision,suite.revision);
});

test('generation admission returns validation errors without crashing',async()=>{const reply=await api('/api/generate',{requirements:'',format:'plain',frameworks:[],provider:'codex'});assert.equal(reply.status,400);assert.match(reply.body.error,/requirements/i);});

test('real locator verification and edited assertion affect only the chosen case', {timeout:30000},async()=>{
 let suite=(await api('/api/demo',{})).body;
 const first=suite.cases[0],untouched=structuredClone(suite.cases[2]);
 const check=await api(`/api/suites/${suite.suiteId}/cases/${first.caseId}/verify`,{revision:suite.revision});
 assert.equal(check.status,200);assert.ok(check.body.results.length);suite=check.body.suite;
 const operations=structuredClone(first.automation.playwright.operations);operations.at(-1).value='Wrong edited receipt';
 const edit=await api(`/api/suites/${suite.suiteId}/cases/${first.caseId}`,{expectedRevision:suite.revision,automationEdit:{operations}},'PATCH');
 assert.equal(edit.status,200);suite=edit.body;assert.equal(suite.cases[0].automation.playwright.status,'draft');assert.deepEqual(suite.cases[2],untouched);
 suite=(await api(`/api/suites/${suite.suiteId}/review`,{expectedRevision:suite.revision,caseIds:[first.caseId],reviewed:true},'PATCH')).body;
 const created=await api('/api/runs',{schemaVersion:2,suiteId:suite.suiteId,revision:suite.revision,selectedCaseIds:[first.caseId],framework:'playwright',mode:'headless',idempotencyKey:'edited-real-assertion'});
 assert.equal(created.status,202);const run=await completed(created.body.runId);assert.equal(run.status,'failed');assert.match(run.cases[0].actual,/Wrong edited receipt/);assert.equal(run.cases.length,1);
});
