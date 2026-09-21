import assert from 'node:assert/strict';
import {migrate,markRemoved,mergeBackup,backupPayload,dailyTotal} from './dist/core.mjs';
import {validWorkspace,newWorkspace,pull,push,exchange} from './dist/sync.mjs';

assert.equal(validWorkspace('6eb7a897-a441-4ffb-81ed-e76258f256c7'),true);
assert.equal(validWorkspace('not-a-code'),false);
assert.equal(validWorkspace(''),false);
assert.equal(validWorkspace(' 6eb7a897-a441-4ffb-81ed-e76258f256c7 '),true,'a pasted code with stray spaces still works');
assert.match(newWorkspace(),/^[0-9a-f-]{36}$/);

// A stand-in for the two database functions, so the exchange is tested whole.
const service=()=>{
 const spaces=new Map();
 return {spaces,fetch:async(url,init)=>{
  const body=JSON.parse(init.body);
  if(init.headers.apikey!=='key')return {ok:false,status:401,text:async()=>'{"message":"bad key"}'};
  if(url.endsWith('timesheet_pull')){
   const row=spaces.get(body.space);
   return {ok:true,status:200,text:async()=>JSON.stringify(row?{payload:row.payload,revision:row.revision}:{payload:null,revision:0})};
  }
  const row=spaces.get(body.space);
  if(row&&body.since!=null&&body.since<row.revision)
   return {ok:true,status:200,text:async()=>JSON.stringify({conflict:true,payload:row.payload,revision:row.revision})};
  const revision=(row?.revision||0)+1;
  spaces.set(body.space,{payload:body.body,revision});
  return {ok:true,status:200,text:async()=>JSON.stringify({conflict:false,revision})};
 }};
};
const config={url:'https://example.supabase.co',key:'key'},space='6eb7a897-a441-4ffb-81ed-e76258f256c7';

// One device pushes, a second device joins and inherits everything.
const api=service();
const phone=migrate({settings:{employer:'Gradcon'},entries:{'2026-09-14':[{id:'a',start:'07:00',finish:'15:30',manual:''}]}});
const first=await exchange(config,space,phone,0,api.fetch);
assert.equal(first.conflict,false);
assert.equal(first.revision,1);
const laptop=await exchange(config,space,migrate(null),0,api.fetch);
assert.equal(dailyTotal(laptop.state.entries['2026-09-14']).toFixed(2),'8.50','the joining device inherits the hours');
assert.equal(laptop.report.slots,1);

// Each device keeps what the other added.
const laptopEdited=structuredClone(laptop.state);
laptopEdited.entries['2026-09-15']=[{id:'b',start:'07:00',finish:'16:00',manual:''}];
const second=await exchange(config,space,laptopEdited,laptop.revision,api.fetch);
const phoneAgain=await exchange(config,space,first.state,first.revision,api.fetch);
assert.equal(Object.keys(phoneAgain.state.entries).length,2,'the phone picks up the laptop’s day');
assert.equal(second.conflict,false);

// A deletion travels instead of being undone by the next merge.
const deleting=structuredClone(phoneAgain.state);
delete deleting.entries['2026-09-14'];
deleting.removed=markRemoved(deleting,'a');
const afterDelete=await exchange(config,space,deleting,phoneAgain.revision,api.fetch);
assert.equal(afterDelete.state.entries['2026-09-14'],undefined,'the deleted slot stays deleted here');
const otherDevice=await exchange(config,space,second.state,second.revision,api.fetch);
assert.equal((otherDevice.state.entries['2026-09-14']||[]).length,0,'and is removed on the other device too');
assert.equal(dailyTotal(Object.values(otherDevice.state.entries).flat()).toFixed(2),'9.00');

// A device that wrote while we were merging does not lose its write.
const stale=await exchange(config,space,migrate({entries:{'2026-09-16':[{id:'c',start:'08:00',finish:'12:00',manual:''}]}}),0,api.fetch);
assert.ok(stale.revision>0);
const everything=await pull(config,space,api.fetch);
assert.ok(Object.keys(everything.payload.companies).length>=1);
assert.equal(backupPayload(stale.state).format,'gradcon-timesheet-backup');

// A bad key is reported, not swallowed.
await assert.rejects(()=>push({...config,key:'wrong'},space,{},0,api.fetch),/bad key/);
console.log('PASS: a second device inherits the timesheet, both keep their own entries, deletions travel, and a clash re-merges.');
