import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from './dist/core.mjs';
import * as automation from './dist/automation.mjs';
import * as send from './dist/send.mjs';
import * as sync from './dist/sync.mjs';
import * as supabase from './dist/supabase-config.mjs';
const {migrate,hours,dailyTotal,validateSlot,overlaps,ensureUnlocked,iso,monday}=core;
const date='2026-09-17';
const original={settings:{name:'Test person'},entries:{[date]:{start:'07:00',finish:'11:00',manual:'',site:'Rosebud',notes:'Original work'}},submitted:{}};
const migrated=migrate(original);
assert.equal(migrated.entries[date].length,1);
assert.equal(migrated.settings.name,'Test person');
assert.equal(dailyTotal(migrated.entries[date]),4);
assert.equal(hours({start:'22:00',finish:'02:00',manual:''}),4);
assert.equal(hours({start:'07:00',finish:'11:00',manual:'3.75'}),3.75);
assert.throws(()=>validateSlot({date:'2026-02-31',start:'07:00',finish:'11:00',manual:''}));
assert.throws(()=>validateSlot({date,start:'25:00',finish:'11:00',manual:''}));
assert.equal(overlaps(migrated,date,{start:'10:00',finish:'12:00'}),true);
assert.equal(overlaps(migrated,date,{start:'11:00',finish:'12:00'}),false);
assert.throws(()=>ensureUnlocked({...migrated,submitted:{'2026-09-14':true}},date));
const elements=new Map();
class Element{
 constructor(){this.value='';this.innerHTML='';this.textContent='';this.open=false;this.classList={add(){},remove(){}};this.handlers={};}
 addEventListener(n,fn){this.handlers[n]=fn;}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
const html=fs.readFileSync('dist/index.html','utf8');
for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element());
const doc={getElementById:id=>{if(!elements.has(id))throw Error('Missing DOM id: '+id);return elements.get(id);},querySelectorAll:()=>[],modelContext:{registerTool(t){tools.set(t.name,t);}}};
const storage=new Map([['gradcon-timesheet-v1',JSON.stringify(original)]]);
const tools=new Map();let printed=false,opened='';
const context=vm.createContext({...core,...automation,...send,...sync,...supabase,document:doc,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URLSearchParams,window:{addEventListener(){},open(url){opened=url;},print(){printed=true;}},crypto:{randomUUID:()=>crypto.randomUUID()},structuredClone,console,confirm:()=>true,setTimeout:()=>1,clearTimeout(){}});
vm.runInContext(fs.readFileSync('dist/app.js','utf8').replace(/^import[^\n]+\n/gm,''),context);
const tool=tools.get('add_time_entry');
assert.ok(tool);
await tool.execute({date,start:'12:00',finish:'16:00',site:'Sorrento',notes:'<script>alert(1)</script>'});
let stored=JSON.parse(storage.get('gradcon-timesheet-v2'));
assert.equal(stored.entries[date].length,2);assert.equal(dailyTotal(stored.entries[date]),8);
assert.equal(JSON.parse(storage.get('gradcon-timesheet-v1')).entries[date].notes,'Original work');
assert.ok(elements.get('days').innerHTML.includes('&lt;script&gt;'));
assert.throws(()=>tool.execute({date,start:'10:00',finish:'13:00'}));
assert.equal(JSON.parse(storage.get('gradcon-timesheet-v2')).entries[date].length,2);
vm.runInContext('buildPrint()',context);
assert.ok(elements.get('printSheet').innerHTML.includes('07:00'));
assert.ok(elements.get('printSheet').innerHTML.includes('12:00'));
assert.ok(elements.get('printSheet').innerHTML.includes('Total: 8.00 hours'));
const second=stored.entries[date][1].id;
vm.runInContext('openEntry('+JSON.stringify(date)+','+JSON.stringify(second)+')',context);
elements.get('finish').value='17:00';
elements.get('entryForm').handlers.submit({preventDefault(){}});
stored=JSON.parse(storage.get('gradcon-timesheet-v2'));
assert.equal(stored.entries[date].length,2);assert.equal(dailyTotal(stored.entries[date]),9);
vm.runInContext('openEntry('+JSON.stringify(date)+','+JSON.stringify(second)+')',context);
elements.get('deleteSlot').onclick();
stored=JSON.parse(storage.get('gradcon-timesheet-v2'));
assert.equal(stored.entries[date].length,1);assert.equal(stored.entries[date][0].notes,'Original work');
elements.get('submitBtn').onclick();assert.equal(elements.get('status').textContent,'Submitted');
assert.throws(()=>tool.execute({date,start:'12:00',finish:'16:00'}));
elements.get('submitBtn').onclick();
assert.equal(elements.get('status').textContent==='Submitted',false);
for(const path of ['styles.css','app.js','core.mjs'])assert.ok(fs.existsSync('dist/'+path));
console.log('PASS: migration, multi-slot add/edit/delete, totals, overnight, overrides, overlap rejection, locking, escaping, PDF rows, WebMCP valid/invalid paths and asset references.');

vm.runInContext('openEntry('+JSON.stringify(date)+')',context);
elements.get('modeSummary').checked=true;elements.get('modeSplit').checked=false;elements.get('manual').value='7.5';
elements.get('entryForm').handlers.submit({preventDefault(){}});
stored=JSON.parse(storage.get('gradcon-timesheet-v2'));
assert.equal(stored.entries[date].length,1);assert.equal(stored.entries[date][0].kind,'summary');assert.equal(dailyTotal(stored.entries[date]),7.5);
assert.throws(()=>tool.execute({date,start:'17:00',finish:'18:00'}));
elements.get('mailFrom').value='projects@gradcon.com.au';elements.get('mailTo').value='accounts@gradcon.com.au';elements.get('mailBcc').value='fyne.boma@gmail.com';
elements.get('emailBtn').onclick();
elements.get('emailForm').onsubmit({preventDefault(){}});
const url=new URL(opened);assert.equal(url.searchParams.get('authuser'),'projects@gradcon.com.au');assert.equal(url.searchParams.get('to'),'accounts@gradcon.com.au');assert.equal(url.searchParams.get('bcc'),'fyne.boma@gmail.com');
assert.ok(url.searchParams.get('body').includes('7.50'));
assert.equal(JSON.parse(storage.get('gradcon-timesheet-v2')).submitted['2026-09-14'],undefined);
console.log('PASS: split-to-summary replacement, no double count, Gmail sender/recipient/BCC, draft does not mark sent.');
