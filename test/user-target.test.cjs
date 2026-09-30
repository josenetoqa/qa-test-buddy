const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
test('generate and execute submitted requirements against a separate custom target', {timeout:30000}, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-buddy-custom-'));
  const target = 'http://127.0.0.1:4207/user-feature';
  const requirements = 'CUSTOM-TICKET: Fill Ticket name, click Save ticket, and verify Ticket saved.';
  const raw = {schemaVersion:2,cases:[{key:'ticket',title:'Save a ticket',preconditions:'The owned ticket fixture is available.',steps:['Enter a ticket name.','Click Save ticket.'],expected:'Ticket saved',requirementRef:'CUSTOM-TICKET',automation:{playwright:{status:'draft',operations:[{op:'navigate',value:target},{op:'fillLabel',label:'Ticket name',text:'Custom ticket'},{op:'clickText',value:'Save ticket'},{op:'expectText',value:'Ticket saved'}]}}}]};
  const cli = path.join(tmp,'codex');
  fs.writeFileSync(cli, '#!'+process.execPath+'\nlet p="";process.stdin.on("data",c=>p+=c);process.stdin.on("end",()=>{if(!p.includes('+JSON.stringify(requirements)+')||!p.includes('+JSON.stringify(target)+')){process.stderr.write("Wrong generation inputs");process.exitCode=1;return;}console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:'+JSON.stringify(JSON.stringify(raw))+'}}));});\n', {mode:0o700});
  let visits=0;
  const fixture=http.createServer((req,res)=>{if(req.url!=='/user-feature'){res.writeHead(404);return res.end();}visits++;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><label for="ticket">Ticket name</label><input id="ticket"><button onclick="document.querySelector(\'output\').textContent=\'Ticket saved\'">Save ticket</button><output></output>');});
  await new Promise(r=>fixture.listen(4207,'127.0.0.1',r));
  const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'4206',PATH:tmp+path.delimiter+process.env.PATH,TEST_BUDDY_DATA_DIR:path.join(tmp,'data')},stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('App startup timeout')),10000);child.once('error',reject);child.stdout.on('data',c=>{if(c.toString().includes('available at')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('App exited '+code));});});
    async function api(route,body,method='POST'){const r=await fetch('http://127.0.0.1:4206'+route,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const b=await r.json();assert.ok(r.ok,JSON.stringify(b));return b;}
    let suite=await api('/api/generate',{requirements,targetUrl:target,provider:'codex',format:'plain',frameworks:['playwright']});
    assert.equal(suite.targetUrl,target);assert.equal(suite.provider,'codex');assert.equal(suite.generationInput.requirements,requirements);
    suite=await api(`/api/suites/${suite.suiteId}/review`,{expectedRevision:suite.revision,caseIds:[suite.cases[0].caseId],reviewed:true},'PATCH');
    let run=await api('/api/runs',{schemaVersion:2,suiteId:suite.suiteId,revision:suite.revision,framework:'playwright',selectedCaseIds:[suite.cases[0].caseId],mode:'headless',idempotencyKey:'custom-target'});
    for(let i=0;i<100&&['queued','running'].includes(run.status);i++){await new Promise(r=>setTimeout(r,100));run=await api('/api/runs/'+run.runId,null,'GET');}
    assert.equal(run.targetUrl,target);assert.equal(run.status,'passed');assert.ok(visits>0);assert.equal(run.cases[0].expected,'Ticket saved');
  } finally {if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await new Promise(r=>fixture.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
});
