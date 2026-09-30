const {stripVTControlCharacters}=require('node:util');
const fs=require('node:fs');
class Reporter {
 constructor(options={}){this.file=options.file||process.env.TEST_BUDDY_REPORTER_FILE;this.runId=options.runId||process.env.TEST_BUDDY_RUN_ID;this.seq=0;this.bytes=0;this.overflow=false;}
 id(tc){return /^\[TC-\d+\|([^\]]+)\]/.exec(tc.title)?.[1];}
 emit(type,caseId,data={},stepId){if(this.overflow)return;const event={runId:this.runId,seq:this.seq+1,type,timestamp:new Date().toISOString(),...(caseId?{caseId}:{}),...(stepId?{stepId}:{}),data};let line=JSON.stringify(event)+'\n';if(Buffer.byteLength(line)>4096){event.type='error';event.data={error:'Reporter payload exceeded 4 KB.'};line=JSON.stringify(event)+'\n';}if(this.seq>=4999||this.bytes+Buffer.byteLength(line)>24*1024*1024){this.overflow=true;const warning={runId:this.runId,seq:++this.seq,type:'overflow',timestamp:new Date().toISOString(),data:{error:'Reporter event bounds exceeded.'}};fs.appendFileSync(this.file,JSON.stringify(warning)+'\n');return;}fs.appendFileSync(this.file,line);this.seq++;this.bytes+=Buffer.byteLength(line);}
 onBegin(){this.emit('begin');}
 onTestBegin(tc){this.emit('caseBegin',this.id(tc));}
 onStepBegin(tc,result,step){if(step.category==='test.step'){const id=step.title.split(':')[0];this.emit('stepBegin',this.id(tc),{label:step.title.slice(0,500)},id);}}
 onStepEnd(tc,result,step){if(step.category==='test.step')this.emit('stepEnd',this.id(tc),{label:step.title.slice(0,500),durationMs:step.duration,status:step.error?'failed':'passed',error:step.error?.message?stripVTControlCharacters(step.error.message).slice(0,1700):null},step.title.split(':')[0]);}
 onTestEnd(tc,result){const status=['failed','timedOut'].includes(result.status)?'failed':result.status==='interrupted'?'error':result.status;const error=stripVTControlCharacters((result.errors||[]).map(e=>e.message||'').join('\n')).slice(0,1700);this.emit('caseEnd',this.id(tc),{status,durationMs:result.duration,error:error||null,actual:status==='passed'?'All assertions in this TC passed.':error||`Playwright reported ${result.status}.`,attachments:(result.attachments||[]).filter(a=>a.path).slice(0,8).map(a=>({name:a.name,path:a.path,contentType:a.contentType}))});}
 onError(error){this.emit('error',undefined,{error:stripVTControlCharacters(String(error.message||error)).slice(0,1500)});}
 onEnd(result){this.emit('end',undefined,{status:result.status});}
 printsToStdio(){return false;}
}
module.exports=Reporter;
