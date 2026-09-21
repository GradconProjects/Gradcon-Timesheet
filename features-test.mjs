import assert from 'node:assert/strict';
import {migrate,companySnapshot,switchCompany,parseDate,dailyTotal} from './dist/core.mjs';
import {submissionSchedule,isSubmissionDue,prepareSubmission} from './dist/automation.mjs';
const week=parseDate('2026-09-14');
const state=migrate(null);
state.entries['2026-09-14']=[{kind:'summary',manual:'7'}];
state.dayNotes['2026-09-14']='Private note';
state.history.push({snapshot:companySnapshot({...state,history:[]})});
state.companies.other={settings:{employer:'Other',sender:'other@example.com'},entries:{},submitted:{},dayNotes:{},dayNotesIncluded:{},history:[],scheduleOverrides:{}};
const other=switchCompany(state,'other');
assert.deepEqual(other.entries,{});
assert.equal(other.history.length,0);
const restored=switchCompany(other,'gradcon');
assert.equal(restored.entries['2026-09-14'][0].manual,'7');
restored.entries['2026-09-14'][0].manual='9';
assert.equal(restored.history[0].snapshot.entries['2026-09-14'][0].manual,'7');
assert.equal(restored.dayNotesIncluded['2026-09-14'],undefined);
assert.equal(prepareSubmission(state,week).usedFallback,false);
const empty=migrate(null),prepared=prepareSubmission(empty,week);
assert.equal(prepared.usedFallback,true);
assert.equal(dailyTotal(Object.values(prepared.state.entries).flat()),30);
assert.equal(Object.keys(empty.entries).length,0);
const schedule=submissionSchedule(empty,week);
assert.equal(schedule.date,'2026-09-22');
assert.equal(schedule.time,'23:00');
assert.equal(isSubmissionDue(schedule,new Date('2026-09-22T12:59:00Z')),false);
assert.equal(isSubmissionDue(schedule,new Date('2026-09-22T13:00:00Z')),true);
const summer={...schedule,date:'2026-12-22'};
assert.equal(isSubmissionDue(summer,new Date('2026-12-22T11:59:00Z')),false);
assert.equal(isSubmissionDue(summer,new Date('2026-12-22T12:00:00Z')),true);
empty.scheduleOverrides['2026-09-14']='2026-09-24';
assert.equal(submissionSchedule(empty,week).date,'2026-09-24');
console.log('PASS: employer isolation, immutable snapshots, private notes, 30-hour fallback, partial-week protection, date overrides, Melbourne daylight saving.');

// Hours are never lost: whatever is still stored on the device can be found and put back.
import {recoveryCandidates,restoreWeek,iso,weekKey} from './dist/core.mjs';
const stored={settings:{employer:'Gradcon Concrete Constructions'},entries:{},companies:{old:{settings:{employer:'Gradcon Concrete Constructions'},entries:{
 '2026-09-14':[{id:'a',start:'07:00',finish:'15:30',manual:'',site:'Rosebud',notes:'Slab prep'}],
 '2026-09-15':[{id:'b',start:'07:00',finish:'16:00',manual:'',site:'Sorrento',notes:'Pour'}]}}},
 history:[{snapshot:{settings:{employer:'Gradcon Concrete Constructions'},entries:{'2026-09-07':[{id:'c',kind:'summary',manual:'8'}]}}}]};
const found=recoveryCandidates([{label:'This employer list',raw:stored},{label:'Older version of the app',raw:null}]);
assert.equal(found.length,2,'the other employer profile and the submitted snapshot are both offered');
assert.equal(found[0].key,'2026-09-14');
assert.equal(found[0].hours.toFixed(2),'17.50');
assert.equal(found[0].slots,2);
assert.ok(found[1].source.includes('saved submission'));
// restoring keeps hours already in the week and does not duplicate a slot
const live=migrate({settings:{employer:'Gradcon Concrete Constructions'},entries:{'2026-09-14':[{id:'kept',start:'17:00',finish:'19:00',manual:''}]}});
const back=restoreWeek(live,found[0]);
assert.equal(back.entries['2026-09-14'].length,2,'the existing slot is kept beside the restored one');
assert.equal(dailyTotal(back.entries['2026-09-14']).toFixed(2),'10.50');
assert.equal(back.entries['2026-09-15'].length,1);
assert.deepEqual(live.entries['2026-09-15'],undefined,'the live state is not mutated');
assert.equal(new Set(back.entries['2026-09-14'].map(e=>e.id)).size,2,'restored slots get fresh ids');
// a submitted week stays locked until it is reopened
const locked=migrate({entries:{},submitted:{[weekKey('2026-09-14')]:true}});
assert.throws(()=>restoreWeek(locked,found[0]),/Reopen this timesheet/);
assert.equal(iso(parseDate(found[0].key)),'2026-09-14');
console.log('PASS: recovery finds stored hours in other profiles, snapshots and backups, and restores them safely.');

// A backup file carries every employer, and restoring only fills gaps.
import {backupPayload,mergeBackup} from './dist/core.mjs';
const source=migrate({activeCompany:'gradcon',settings:{employer:'Gradcon Concrete Constructions'},
 entries:{'2026-09-14':[{id:'a',start:'07:00',finish:'15:00',manual:'',site:'Rosebud',notes:''},
                        {id:'b',start:'16:00',finish:'18:00',manual:'',site:'Rye',notes:''}],
          '2026-09-15':[{id:'c',kind:'summary',manual:'8'}]},
 dayNotes:{'2026-09-14':'Pour delayed'},submitted:{'2026-09-14':true},
 companies:{other:{settings:{employer:'Second employer'},entries:{'2026-09-21':[{id:'d',start:'08:00',finish:'12:00',manual:''}]},submitted:{},dayNotes:{},dayNotesIncluded:{},history:[],scheduleOverrides:{}}}});
const file=JSON.parse(JSON.stringify(backupPayload(source)));
assert.equal(file.format,'gradcon-timesheet-backup');
assert.deepEqual(Object.keys(file.companies).sort(),['gradcon','other']);

// An empty browser gets everything back.
const fresh=migrate(null);
const {state:recoveredState,report}=mergeBackup(fresh,file);
assert.equal(report.slots,4,'every slot comes back — three here plus the second employer’s one');
assert.equal(report.employers,1,'the second employer profile comes back');
assert.equal(report.weeks,2);
assert.equal(dailyTotal(recoveredState.entries['2026-09-14']).toFixed(2),'10.00');
assert.equal(recoveredState.dayNotes['2026-09-14'],'Pour delayed');
assert.equal(recoveredState.submitted['2026-09-14'],true);
assert.equal(recoveredState.companies.other.entries['2026-09-21'].length,1);

// Restoring twice adds nothing, and never disturbs what is already there.
const {report:again}=mergeBackup(recoveredState,file);
assert.equal(again.slots,0,'a second restore is a no-op');
assert.equal(again.employers,0);
const edited=structuredClone(recoveredState);
edited.entries['2026-09-14']=[{id:'a',start:'06:00',finish:'15:00',manual:'',site:'Rosebud',notes:''}];
edited.dayNotes['2026-09-14']='Edited on this device';
const {state:kept}=mergeBackup(edited,file);
assert.equal(kept.entries['2026-09-14'][0].start,'06:00','an edited slot keeps the edit');
assert.equal(kept.entries['2026-09-14'].length,2,'only the missing slot is added back');
assert.equal(kept.dayNotes['2026-09-14'],'Edited on this device','a note written here wins');
assert.throws(()=>mergeBackup(fresh,{format:'something-else'}),/not a timesheet backup/);
console.log('PASS: backup file carries every employer, restores into an empty browser and never overwrites newer edits.');
