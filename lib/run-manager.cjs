const {stripVTControlCharacters}=require('node:util');
const fs=require('node:fs');const path=require('node:path');const {randomUUID,createHash}=require('node:crypto');const {spawn}=require('node:child_process');const {reconcileRun}=require('./run-reducer.cjs');
const terminal=new Set(['passed','failed','error','canceled','skipped']);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clone=value=>structuredClone(value);
function createRunManager({root,runsRoot=path.join(root,'.test-buddy-runs'),suiteStore,compileCase,artifacts,history,resolveProfile,cypressAdapter,spawnProcess=spawn}={}){
 const entries=new Map(),keys=new Map();let active=0,closing=false;
 const persistenceFailure=(entry,error)=>{entry.record.persistenceError=String(error.message).slice(0,500);entry.invalid='History storage failed: '+entry.record.persistenceError;if(terminal.has(entry.record.status)&&entry.record.status!=='canceled'){entry.record.status='error';entry.record.summary=entry.invalid;}};
 const persist=(entry)=>{if(!history)return;const sequence=entry.saveSequence=(entry.saveSequence||0)+1;try{const snapshot=history.saveRun?.(entry.record,entry.suite);if(snapshot?.then)snapshot.then(saved=>{if(saved&&saved.runId===entry.record.runId&&entry.saveSequence===sequence)Object.assign(entry.record,clone(saved));}).catch(error=>persistenceFailure(entry,error));else if(snapshot&&snapshot.runId===entry.record.runId)Object.assign(entry.record,clone(snapshot));}catch(error){persistenceFailure(entry,error);}};
 function pruneEntries(){const completed=[...entries.values()].filter(e=>terminal.has(e.record.status)).sort((a,b)=>Date.parse(a.record.finishedAt||0)-Date.parse(b.record.finishedAt||0));let kept=completed.length;let retained=null;if(history?.listRuns)try{retained=new Set(history.listRuns({limit:100}).runs.map(r=>r.runId));}catch{}for(const entry of completed){if(kept>100||Date.now()-Date.parse(entry.record.finishedAt||0)>7*86400000||(retained&&!retained.has(entry.record.runId))){entries.delete(entry.record.runId);for(const [key,item]of keys)if(item.runId===entry.record.runId)keys.delete(key);kept--;}}}
 function createRun(request){
  if(closing)throw fail('Runner is shutting down.',503);
  pruneEntries();
  const allowed=['schemaVersion','suiteId','revision','framework','selectedCaseIds','mode','idempotencyKey','slowMo','recordVideo','authProfileId'];
  if(!request||Object.keys(request).some(key=>!allowed.includes(key)))throw fail('Unsupported run field. Send only stored suite and case identifiers.');
  if(request.schemaVersion!==2||typeof request.suiteId!=='string'||!Number.isInteger(request.revision))throw fail('Use the versioned suite run contract.');
  if(!['playwright','cypress'].includes(request.framework)||!['headless','headed'].includes(request.mode))throw fail('Unsupported framework or browser mode.');
  if(typeof request.idempotencyKey!=='string'||!request.idempotencyKey.trim()||request.idempotencyKey.length>200)throw fail('Provide a bounded idempotency key.');
  if(!Array.isArray(request.selectedCaseIds)||!request.selectedCaseIds.length||request.selectedCaseIds.length>8)throw fail('Select 1–8 cases.');
  if(request.selectedCaseIds.some(id=>typeof id!=='string')||new Set(request.selectedCaseIds).size!==request.selectedCaseIds.length)throw fail('Select distinct case IDs.');
  if(request.slowMo!==undefined&&(!Number.isInteger(request.slowMo)||request.slowMo<0||request.slowMo>500))throw fail('Demonstration delay must be 0–500 ms.');
  if(request.recordVideo!==undefined&&typeof request.recordVideo!=='boolean')throw fail('Video must be boolean.');
  if(request.authProfileId!==undefined&&(typeof request.authProfileId!=='string'||request.authProfileId.length>200))throw fail('Invalid authentication profile.');
  const normalized={...request,selectedCaseIds:[...request.selectedCaseIds],slowMo:request.slowMo||0,recordVideo:Boolean(request.recordVideo)};
  const digest=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(normalized).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
  const known=keys.get(request.idempotencyKey);if(known){if(known.digest!==digest)throw fail('Idempotency key was already used for different run content.',409);return clone(entries.get(known.runId).record);}
  const latest=suiteStore.getSuite(request.suiteId);if(!latest)throw fail('Unknown suite.',404);if(latest.revision!==request.revision)throw fail('Suite revision is stale. Reload the current suite.',409);
  const suite=suiteStore.getSuite(request.suiteId,request.revision)||latest;
  const selected=request.selectedCaseIds.map(id=>{const tc=suite.cases.find(c=>c.caseId===id);if(!tc)throw fail('Unknown case ID.');if(tc.automation?.[request.framework]?.status!=='ready')throw fail(`Review ${tc.displayId} before execution.`,409);return tc;});
  if(request.framework==='cypress'&&!cypressAdapter?.available?.())throw fail('Cypress runner is not installed or ready.',409);
  if(request.framework==='cypress'&&request.authProfileId)throw fail('Playwright authentication profiles are not compatible with Cypress.',409);
  let statePath;if(request.authProfileId){if(!resolveProfile)throw fail('Authentication profiles are unavailable.',409);statePath=resolveProfile(request.authProfileId,new URL(suite.targetUrl).origin);}
  if(active>=2)throw fail('Two suites are already queued or running.',429);
  history?.admit?.();const runId=randomUUID(),now=new Date().toISOString();
  const record={schemaVersion:2,runId,suiteId:suite.suiteId,revision:suite.revision,framework:request.framework,targetUrl:suite.targetUrl,mode:request.mode,slowMo:normalized.slowMo,recordVideo:normalized.recordVideo,status:'queued',selectedCaseIds:[...request.selectedCaseIds],createdAt:now,startedAt:null,finishedAt:null,deadlineAt:new Date(Date.now()+Math.min(990000,selected.length*120000+30000)).toISOString(),cases:selected.map(tc=>({caseId:tc.caseId,displayId:tc.displayId,title:tc.title,status:'queued',expected:tc.expected,actual:null,error:null,startedAt:null,finishedAt:null,durationMs:null,steps:[],artifacts:[]})),summary:'Queued for execution.',output:'',lastEventSeq:0,counts:{total:selected.length,passed:0,failed:0,error:0,canceled:0,skipped:0}};
  let closeResolve;const entry={record,suite,request:normalized,statePath,events:[],reported:[],ended:false,reportStatus:null,invalid:null,canceled:false,timedOut:false,child:null,released:false,closed:new Promise(resolve=>{closeResolve=resolve;}),closeResolve,readOffset:0,outputBytes:0,dir:path.join(runsRoot,runId)};
  if(history?.saveRun){const saved=history.saveRun(record,suite);if(saved&&saved.runId===record.runId)Object.assign(record,clone(saved));}entries.set(runId,entry);keys.set(request.idempotencyKey,{runId,digest});active++;setImmediate(()=>launch(entry));return clone(record);
 }
 function addEvent(entry,event){const record=entry.record;if(entry.events.length>=5000){entry.invalid='Reporter event bounds exceeded.';record.eventsTruncated=true;return;}entry.events.push(event);record.lastEventSeq=event.seq;}
 function ingest(entry,final=false){const file=path.join(entry.dir,'reporter.ndjson');if(!fs.existsSync(file))return;let buffer;
  try{const stat=fs.statSync(file);if(stat.size>24*1024*1024){entry.invalid='Reporter transport exceeded 24 MB.';return;}if(stat.size<entry.readOffset){entry.invalid='Reporter transport was truncated.';return;}buffer=fs.readFileSync(file).subarray(entry.readOffset);}
  catch(error){entry.invalid=`Reporter could not be read: ${error.message}`;return;}
  const last=buffer.lastIndexOf(10);if(final&&buffer.length&&last!==buffer.length-1)entry.invalid='Reporter ended with an incomplete record.';if(last<0)return;
  entry.readOffset+=last+1;
  for(const line of buffer.subarray(0,last).toString('utf8').split('\n')){
   try{
    if(Buffer.byteLength(line)>4096)throw Error('Reporter record exceeded 4 KB.');const event=JSON.parse(line);
    if(event.runId!==entry.record.runId||event.seq!==entry.record.lastEventSeq+1||!['begin','caseBegin','stepBegin','stepEnd','caseEnd','error','end','overflow'].includes(event.type)||!event.data||typeof event.data!=='object'||typeof event.timestamp!=='string')throw Error('Invalid reporter identity, sequence, or event shape.');
    if(entry.ended)throw Error('Reporter event arrived after end.');if(event.type!=='begin'&&!entry.began)throw Error('Reporter begin was missing.');
    const tc=event.caseId?entry.record.cases.find(c=>c.caseId===event.caseId):null;if(['caseBegin','caseEnd','stepBegin','stepEnd'].includes(event.type)&&!tc)throw Error('Unknown reporter case identity.');
    if(event.type==='overflow')throw Error('Reporter event bounds exceeded.');
    if(event.type==='begin'){if(entry.began)throw Error('Duplicate reporter begin.');entry.began=true;}
    if(event.type==='caseBegin'){if(tc.startedAt)throw Error('Duplicate reporter case begin.');tc.startedAt=event.timestamp;tc.status='running';}
    if(event.type==='stepBegin'||event.type==='stepEnd'){
     if(!tc.startedAt||tc.finishedAt)throw Error('Step event arrived outside case execution.');
     if(typeof event.stepId!=='string'||event.stepId.length>160)throw Error('Invalid reporter step identity.');
     const manifest=entry.manifests?.find(m=>m.caseId===tc.caseId);if(manifest&&!manifest.stepIds.includes(event.stepId))throw Error('Unknown reporter step ID.');
     let step=tc.steps.find(s=>s.stepId===event.stepId);if(event.type==='stepBegin'){if(step)throw Error('Duplicate step begin.');step={stepId:event.stepId,label:event.data.label,status:'running',startedAt:event.timestamp};tc.steps.push(step);}else{if(!step)throw Error('Step ended without a begin event.');if(step.finishedAt)throw Error('Duplicate step end.');Object.assign(step,{status:event.data.status,durationMs:event.data.durationMs,error:typeof event.data.error==='string'?stripVTControlCharacters(event.data.error):null,finishedAt:event.timestamp});}
    }
    if(event.type==='caseEnd'){
     if(!tc.startedAt)throw Error('Case ended without a begin event.');if(entry.reported.some(c=>c.caseId===tc.caseId))throw Error('Duplicate reporter case result.');
     const data=event.data;for(const field of ['actual','error'])if(typeof data[field]==='string')data[field]=stripVTControlCharacters(data[field]);if(data.status==='passed'){const manifest=entry.manifests?.find(m=>m.caseId===tc.caseId);if(!manifest||manifest.stepIds.some(id=>!tc.steps.some(s=>s.stepId===id&&s.status==='passed'&&s.finishedAt)))throw Error('Passing case has missing or incomplete operation steps.');}const captured=[];for(const attachment of data.attachments||[]){if(!attachment.path)continue;const kind=attachment.name==='trace'?'trace':attachment.contentType?.startsWith('image/')?'screenshot':attachment.contentType?.startsWith('video/')?'video':null;if(!kind)continue;try{if(artifacts)captured.push(artifacts.registerArtifact(entry.record.runId,tc.caseId,attachment.path,kind));}catch(error){tc.evidenceWarning=String(error.message).slice(0,500);}}
     Object.assign(tc,{status:data.status,durationMs:data.durationMs??null,actual:data.actual??null,error:data.error??null,finishedAt:event.timestamp,artifacts:captured});entry.reported.push(clone(tc));
    }
    if(event.type==='error')entry.invalid=event.data.error||'Reporter infrastructure error.';
    if(event.type==='end'){if(entry.ended)throw Error('Duplicate reporter end.');entry.ended=true;entry.reportStatus=event.data.status;}
    // Paths remain private: artifact links are represented only by registered opaque IDs.
    if(event.type==='caseEnd')delete event.data.attachments;
    addEvent(entry,event);
   }catch(error){entry.invalid=String(error.message).slice(0,700);entry.record.eventsTruncated=true;}
  }
  persist(entry);
 }
 function output(entry,chunk){const bytes=Buffer.from(chunk);const remaining=128*1024-entry.outputBytes;if(remaining>0){entry.record.output+=bytes.subarray(0,remaining).toString('utf8');entry.outputBytes+=Math.min(bytes.length,remaining);}while(Buffer.byteLength(entry.record.output)>128*1024){entry.record.output=entry.record.output.slice(0,-1);entry.record.outputTruncated=true;}if(bytes.length>remaining)entry.record.outputTruncated=true;}
 function kill(entry){if(!entry.child||entry.killRequested)return;entry.killRequested=true;try{process.kill(-entry.child.pid,'SIGTERM');}catch{try{entry.child.kill?.('SIGTERM');}catch{}}entry.killTimer=setTimeout(()=>{try{process.kill(-entry.child.pid,'SIGKILL');}catch{try{entry.child.kill?.('SIGKILL');}catch{}}},750);entry.killTimer.unref?.();}
 function finish(entry,exit,signal){if(entry.released)return;entry.released=true;clearTimeout(entry.deadlineTimer);clearTimeout(entry.killTimer);clearInterval(entry.poller);ingest(entry,true);const outcomes=reconcileRun({expectedIds:entry.record.selectedCaseIds,reportedCases:entry.reported,reporterEnded:entry.ended,reporterStatus:entry.reportStatus,processExit:signal?null:exit,canceled:entry.canceled,timedOut:entry.timedOut,reportError:entry.invalid});
  entry.record.output=stripVTControlCharacters(entry.record.output||'');const old=entry.record.cases;Object.assign(entry.record,{status:outcomes.status,summary:outcomes.summary,counts:outcomes.counts,finishedAt:new Date().toISOString(),cases:outcomes.cases.map(tc=>({...old.find(c=>c.caseId===tc.caseId),...tc}))});active--;persist(entry);entry.closeResolve(clone(entry.record));
 }
 async function launch(entry){try{
  if(entry.canceled){finish(entry,null,null);return;}fs.mkdirSync(entry.dir,{recursive:true,mode:0o700});const reportFile=path.join(entry.dir,'reporter.ndjson');fs.writeFileSync(reportFile,'',{mode:0o600});
  entry.record.status='running';entry.record.startedAt=new Date().toISOString();entry.record.summary='Running selected cases.';
  if(entry.request.framework==='cypress'){const result=await cypressAdapter.executeCypressRun(entry.record,entry.suite,entry.record.selectedCaseIds,{runDirectory:entry.dir,onChild:child=>{entry.child=child;},canceled:()=>entry.canceled});entry.record=result;entry.released=true;active--;persist(entry);entry.closeResolve(clone(result));return;}
  entry.manifests=[];for(const caseId of entry.record.selectedCaseIds){const compiled=compileCase(entry.suite,caseId);if(path.basename(compiled.filename)!==compiled.filename||!compiled.filename.endsWith('.spec.cjs'))throw Error('Unsafe compiler file name.');fs.writeFileSync(path.join(entry.dir,compiled.filename),compiled.source,{mode:0o600});entry.manifests.push(compiled.manifest);}
  const config={testDir:entry.dir,testMatch:'*.spec.cjs',fullyParallel:false,workers:1,retries:0,maxFailures:0,timeout:120000,globalTimeout:Math.min(990000,entry.record.selectedCaseIds.length*120000+30000),outputDir:path.join(entry.dir,'evidence'),reporter:[[path.join(__dirname,'playwright-reporter.cjs')]],use:{browserName:'chromium',headless:entry.request.mode!=='headed',launchOptions:{slowMo:entry.request.slowMo},trace:'retain-on-failure',screenshot:'only-on-failure',video:entry.request.recordVideo?'on':'off',...(entry.statePath?{storageState:entry.statePath}:{})}};
  const configFile=path.join(entry.dir,'playwright.config.cjs');fs.writeFileSync(configFile,'module.exports = '+JSON.stringify(config)+';\n',{mode:0o600});
  entry.child=spawnProcess(process.execPath,[path.join(root,'node_modules/playwright/cli.js'),'test','--config',configFile],{cwd:root,env:{...process.env,NODE_PATH:path.join(root,'node_modules'),CI:'1',NO_COLOR:'1',TEST_BUDDY_RUN_ID:entry.record.runId,TEST_BUDDY_REPORTER_FILE:reportFile},shell:false,detached:true,stdio:['ignore','pipe','pipe']});
  entry.child.stdout.on('data',data=>output(entry,data));entry.child.stderr.on('data',data=>output(entry,data));entry.child.once('error',error=>{entry.invalid=`Runner startup failed: ${error.message}`;finish(entry,null,null);});entry.child.once('close',(code,signal)=>finish(entry,code,signal));entry.poller=setInterval(()=>ingest(entry),100);entry.poller.unref?.();entry.deadlineTimer=setTimeout(()=>{entry.timedOut=true;kill(entry);},Math.max(1,Date.parse(entry.record.deadlineAt)-Date.now()));entry.deadlineTimer.unref?.();persist(entry);if(entry.canceled)kill(entry);
 }catch(error){entry.invalid=`Runner setup failed: ${String(error.message).slice(0,700)}`;finish(entry,null,null);}}
 function getRun(id){pruneEntries();const entry=entries.get(id);if(!entry)return null;const result=clone(entry.record);result.output=stripVTControlCharacters(result.output||'');for(const tc of result.cases||[]){for(const field of ['actual','error'])if(typeof tc[field]==='string')tc[field]=stripVTControlCharacters(tc[field]);for(const step of tc.steps||[])if(typeof step.error==='string')step.error=stripVTControlCharacters(step.error);}return result;}
 async function cancelRun(id){const entry=entries.get(id);if(!entry)throw fail('Unknown run.',404);if(terminal.has(entry.record.status))return clone(entry.record);entry.canceled=true;kill(entry);return entry.closed;}
 function readEvents(id,afterSeq=0){const entry=entries.get(id);if(!entry)throw fail('Unknown run.',404);if(!Number.isSafeInteger(afterSeq)||afterSeq<0)throw fail('Invalid event cursor.');return {events:clone(entry.events.filter(e=>e.seq>afterSeq)),lastEventSeq:entry.record.lastEventSeq,truncated:Boolean(entry.record.eventsTruncated),snapshotRequired:afterSeq>entry.record.lastEventSeq||Boolean(!entry.events.length&&entry.record.lastEventSeq>afterSeq)||Boolean(entry.events.length&&afterSeq<entry.events[0].seq-1)};}
 function hydrateRuns(records){for(const record of records){if(entries.has(record.runId))continue;const copy=clone(record);if(!terminal.has(copy.status)){copy.status='error';copy.summary='Server restarted during execution. This run was not resumed.';copy.finishedAt=new Date().toISOString();copy.cases=copy.cases.map(tc=>terminal.has(tc.status)?tc:{...tc,status:'error',actual:copy.summary});}entries.set(copy.runId,{record:copy,events:[],released:true});}}
 async function close(){closing=true;await Promise.all([...entries.values()].filter(e=>!terminal.has(e.record.status)).map(e=>cancelRun(e.record.runId)));}
 return {close,createRun,getRun,cancelRun,readEvents,hydrateRuns,listRuns:()=>{pruneEntries();return [...entries.values()].map(e=>clone(e.record)).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));}};
}
module.exports={createRunManager};
