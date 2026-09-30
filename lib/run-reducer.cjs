const TERMINAL=new Set(['passed','failed','error','canceled','skipped']);
function reconcileRun({expectedIds,reportedCases=[],reporterEnded=false,reporterStatus,processExit,canceled=false,timedOut=false,reportError=null}) {
 const seen=new Map();let invalid=Boolean(reportError);
 for(const item of reportedCases){if(!expectedIds.includes(item.caseId)||seen.has(item.caseId)||!TERMINAL.has(item.status)){invalid=true;continue;}seen.set(item.caseId,item);}
 const complete=expectedIds.length>0&&seen.size===expectedIds.length;
 const cases=expectedIds.map(caseId=>seen.get(caseId)||{caseId,status:canceled?'canceled':'error',actual:canceled?'Execution canceled before this TC completed.':'No complete reporter result for this TC.'});
 let status;
 if(canceled)status='canceled';
 else if(timedOut||invalid||!complete||!reporterEnded||!['passed','failed','timedout','interrupted'].includes(reporterStatus)||processExit===null||processExit===undefined)status='error';
 else if(cases.some(c=>c.status==='error'||c.status==='canceled'||c.status==='skipped'))status='error';
 else if(cases.some(c=>c.status==='failed'))status=reporterStatus==='failed'&&processExit!==0?'failed':'error';
 else status=processExit===0&&reporterStatus==='passed'?'passed':'error';
 const counts={total:cases.length,passed:0,failed:0,error:0,canceled:0,skipped:0};cases.forEach(c=>{counts[c.status]=(counts[c.status]||0)+1;});
 const reason=canceled?'Run canceled.':timedOut?'Suite deadline exceeded.':reportError||(!complete?'Reporter results were missing or incomplete.':invalid?'Duplicate or invalid reporter identities.':!reporterEnded?'Reporter did not finish.':status==='error'?'Runner or reporter did not finish successfully.':'');
 return {status,cases,counts,summary:reason||`${counts.passed} passed; ${counts.failed} failed.`};
}
module.exports={reconcileRun};
