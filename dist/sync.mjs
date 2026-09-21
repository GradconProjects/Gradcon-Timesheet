import {backupPayload,mergeBackup} from './core.mjs';

// Cross-device sync. Every device that holds the same workspace code reads and
// writes one row through two database functions; the code is the only
// credential, so it is generated random and never leaves the devices you paste
// it into. Merging is the same non-destructive merge a backup file uses, so two
// devices converge instead of overwriting each other.
export const WORKSPACE_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validWorkspace=code=>WORKSPACE_PATTERN.test(String(code||'').trim());
export const newWorkspace=()=>(globalThis.crypto?.randomUUID?.()||'');

async function rpc(config,name,body,fetchImpl){
 const request=fetchImpl||(typeof fetch==='function'?fetch:null);
 if(!request)throw Error('This browser cannot reach the sync service.');
 const response=await request(String(config.url).replace(/\/+$/,'')+'/rest/v1/rpc/'+name,{
  method:'POST',
  headers:{'content-type':'application/json',apikey:config.key,authorization:'Bearer '+config.key},
  body:JSON.stringify(body),
 });
 const text=await response.text();
 let result=null;
 try{result=text?JSON.parse(text):null;}catch{}
 if(!response.ok)throw Error(result?.message||result?.error||('The sync service replied '+response.status+'.'));
 return result;
}

export async function pull(config,space,fetchImpl){
 const result=await rpc(config,'timesheet_pull',{space},fetchImpl);
 return {payload:result?.payload??null,revision:Number(result?.revision||0),updatedAt:result?.updatedAt||''};
}

export async function push(config,space,payload,since,fetchImpl){
 const result=await rpc(config,'timesheet_push',{space,body:payload,since:since??null},fetchImpl);
 return {conflict:!!result?.conflict,payload:result?.payload??null,revision:Number(result?.revision||0),updatedAt:result?.updatedAt||''};
}

// One exchange: take what the workspace has, keep what this device has, send
// the union back. Returns the state to save locally and what changed.
export async function exchange(config,space,state,since,fetchImpl){
 const remote=await pull(config,space,fetchImpl);
 let merged=state,report={slots:0,weeks:0,employers:0,notes:0,snapshots:0};
 if(remote.payload){({state:merged,report}=mergeBackup(state,remote.payload));}
 const mine=backupPayload(merged);
 let written=await push(config,space,mine,remote.revision,fetchImpl);
 if(written.conflict&&written.payload){
  // Another device wrote while we were merging: fold that in and try once more.
  const second=mergeBackup(merged,written.payload);
  merged=second.state;
  report={...report,slots:report.slots+second.report.slots,weeks:Math.max(report.weeks,second.report.weeks)};
  written=await push(config,space,backupPayload(merged),written.revision,fetchImpl);
 }
 return {state:merged,report,revision:written.revision,updatedAt:written.updatedAt,conflict:written.conflict};
}
