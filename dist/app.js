import {migrate,iso,parseDate,monday,add,hours,dailyTotal,validateSlot,validDate,appendSlot,ensureUnlocked,overlaps,companySnapshot,switchCompany,recoveryCandidates,restoreWeek,weekKey,backupPayload,mergeBackup,markRemoved,savedWeeks,touchWeek} from './core.mjs';
import {createTimesheetPdf} from './pdf.mjs';
import {submissionSchedule} from './automation.mjs';
import {sendConfigured,sendPayload,deliver} from './send.mjs';
import {exchange,validWorkspace,newWorkspace} from './sync.mjs';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.mjs';
const absent={textContent:'',innerHTML:'',value:'',checked:false,disabled:false,hidden:true,files:[],style:{},
 classList:{add(){},remove(){}},addEventListener(){},removeAttribute(){},setAttribute(){},getAttribute:()=>null,
 showModal(){},close(){},click(){},focus(){},querySelectorAll:()=>[]};
const $=id=>document.getElementById(id)||absent,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='gradcon-timesheet-v2',LEGACY='gradcon-timesheet-v1',BACKUPS='gradcon-timesheet-backups',BACKUP_LIMIT=6;
const readStore=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const readBackups=()=>{const list=readStore(BACKUPS);return Array.isArray(list)?list:[];};
function rememberHours(current){try{const entries=current?.entries||{};if(!Object.values(entries).some(list=>list?.length))return;
 const list=readBackups(),signature=JSON.stringify(entries);if(list[0]&&JSON.stringify(list[0].entries)===signature)return;
 list.unshift({savedAt:new Date().toISOString(),settings:{employer:current.settings?.employer||''},entries:JSON.parse(signature)});
 localStorage.setItem(BACKUPS,JSON.stringify(list.slice(0,BACKUP_LIMIT)));}catch{}}
let state,storageError=false;
try{state=migrate(JSON.parse(localStorage.getItem(STORAGE)||localStorage.getItem(LEGACY)||'null'));}catch{state=migrate(null);storageError=true;}
let selected=monday(new Date()),editing=null,newEmployer=false,pendingLogo='',pendingSignature='';
const fmt=(d,options={day:'numeric',month:'short'})=>d.toLocaleDateString('en-AU',options),slots=date=>state.entries[date]||[];
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4000);}
function persist(next,redraw=true){if(storageError)throw Error('Stored data could not be read. Please allow browser storage and reload before saving.');
 rememberHours(state);
 try{localStorage.setItem(STORAGE,JSON.stringify(next));}
 catch{try{localStorage.removeItem(BACKUPS);localStorage.setItem(STORAGE,JSON.stringify(next));}
  catch{throw Error('This browser refused to save — its storage is full. Remove a company logo in Settings, then save again. Nothing already saved has been lost.');}}
 state=next;if(redraw)render();syncSoon();}
function transact(action){try{action();}catch(e){toast(e.message||'Unable to save. Your existing data has not changed.');}}
function weekSlots(){return Array.from({length:7},(_,i)=>slots(iso(add(selected,i)))).flat();}
// Most “lost hours” are simply a week away — a new week opens empty every Monday.
function nearestWeekWithHours(){
 const weeks=new Map();
 for(const [date,list] of Object.entries(state.entries||{})){
  if(!validDate(date)||!list?.length)continue;
  const key=weekKey(date);weeks.set(key,(weeks.get(key)||0)+dailyTotal(list));
 }
 weeks.delete(iso(selected));
 let best=null;
 for(const [key,total] of weeks){const gap=Math.abs(parseDate(key)-selected);if(!best||gap<best.gap)best={key,total,gap};}
 return best;
}
function since(when){
 const moment=new Date(when);if(Number.isNaN(+moment))return 'just now';
 const minutes=Math.round((Date.now()-moment)/60000);
 if(minutes<1)return 'just now';
 if(minutes<60)return minutes+' minute'+(minutes===1?'':'s')+' ago';
 if(minutes<1440)return Math.round(minutes/60)+' hour'+(Math.round(minutes/60)===1?'':'s')+' ago';
 return 'on '+moment.toLocaleString('en-AU',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
}
function getStatus(){if(state.submitted[iso(selected)])return 'Submitted';return iso(new Date())>=iso(add(selected,8))?'Ready to submit':'In progress';}
function render(){
 document.body?.setAttribute?.('data-theme',state.settings.theme||'blue');document.body?.setAttribute?.('data-density',state.settings.density||'comfortable');

 const profiles={...state.companies,[state.activeCompany]:companySnapshot(state)};
 $('companySelect').innerHTML=Object.entries(profiles).map(([id,c])=>'<option value="'+esc(id)+'"'+(id===state.activeCompany?' selected':'')+'>'+esc(c.settings.employer||'Untitled employer')+'</option>').join('');
 $('companyTag').textContent=state.settings.tag||'';
 $('companyLogo').innerHTML=/^data:image\/(png|jpeg);base64,/.test(state.settings.logo||'')?'<img alt="Company logo" src="'+esc(state.settings.logo)+'">':'<span aria-label="No company logo uploaded">🏡</span>';

 const scheduled=submissionSchedule(state,selected);const sun=add(selected,6),entries=weekSlots(),total=dailyTotal(entries),locked=!!state.submitted[iso(selected)];
 $('weekTitle').textContent=fmt(selected)+' – '+fmt(sun,{day:'numeric',month:'short',year:'numeric'});
 $('ending').textContent=fmt(sun,{weekday:'short',day:'numeric',month:'short'});$('submission').textContent=fmt(parseDate(scheduled.date),{weekday:'short',day:'numeric',month:'short'})+' · '+scheduled.time;$('payment').textContent=fmt(add(selected,9),{weekday:'short',day:'numeric',month:'short'});
 const elsewhere=entries.length?null:nearestWeekWithHours();
 $('elsewhere').hidden=!elsewhere;$('prefillWeek').hidden=!elsewhere||locked;
 if(elsewhere)$('elsewhere').textContent='\u2190 Week ending '+fmt(add(parseDate(elsewhere.key),6),{day:'numeric',month:'short'})+' has '+elsewhere.total.toFixed(2)+' hours';
 const savedAt=state.savedWeeks?.[iso(selected)];
 $('savedLine').textContent=entries.length?(savedAt?'Saved '+since(savedAt)+(validWorkspace(workspace())?' \u00b7 synced to your other devices':' \u00b7 in this browser'):'Saved in this browser'):'Nothing entered for this week yet';
 $('saveWeek').disabled=!entries.length||locked;
 $('totalHours').innerHTML=total.toFixed(2)+' <small>hrs</small>';$('totalDetail').textContent=entries.length+' time '+(entries.length===1?'slot':'slots')+' recorded';$('footerTotal').textContent=total.toFixed(2)+' hours';$('status').textContent=getStatus();$('status').className='badge'+(locked?' submitted':'');$('submitBtn').textContent=locked?'Reopen timesheet':'Mark as submitted';$('copyWeek').disabled=locked;$('addEntry').disabled=locked;
 $('days').innerHTML=Array.from({length:7},(_,i)=>{
 const d=add(selected,i),key=iso(d),list=slots(key),today=key===iso(new Date());
 return '<section class="day'+(today?' today':'')+'"><div class="day-date"><strong>'+fmt(d,{weekday:'short'})+'</strong><small>'+fmt(d)+'</small>'+(today?'<span class="today-label">TODAY</span>':'')+'</div><div class="slots">'+list.map(e=>'<button class="slot" data-date="'+key+'" data-id="'+esc(e.id)+'"'+(locked?' disabled':'')+' aria-label="Edit time slot '+esc(e.start||'manual')+' on '+key+'"><span><span class="slot-time">'+esc(e.start&&e.finish?e.start+' – '+e.finish:e.kind==='summary'?'Daily summary':'Manual hours')+(e.start&&e.finish&&e.finish<e.start?' <small>(+1 day)</small>':'')+'</span><span class="slot-meta">'+esc([e.site,e.notes].filter(Boolean).join(' · '))+'</span></span><span class="slot-right">'+hours(e).toFixed(2)+' h'+(e.kind!=='summary'&&e.manual!==''&&e.manual!=null?' · override':'')+' &nbsp; ›</span></button>').join('')+(!list.length?'<div class="noentry">No hours recorded</div>':'')+(!locked?'<button class="add-slot" data-date="'+key+'">＋ Add hours</button>':'')+'<label class="day-note">📝 Day notes<textarea data-day-note="'+key+'" maxlength="3000" placeholder="Site updates, achievements, or anything to remember…"'+(locked?' disabled':'')+'>'+esc(state.dayNotes?.[key]||'')+'</textarea></label><label class="note-toggle"><input type="checkbox" data-note-include="'+key+'"'+(state.dayNotesIncluded?.[key]?' checked':'')+(locked?' disabled':'')+'> Include day notes in PDF</label></div><div class="daytotal">'+(list.length?dailyTotal(list).toFixed(2):'—')+'<small>hours</small></div></section>';
 }).join('');
 sendStatus();const s=state.settings;for(const id of ['legal','abn','location','phone','email'])$(id).textContent=s[id];$('employerName').textContent=s.employer;$('profileBtn').textContent=s.name?s.name.split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase():'G';
}
function openEntry(date,id=null){try{ensureUnlocked(state,date);}catch(e){toast(e.message);return;}editing=id?{date,id}:null;const e=id?slots(date).find(e=>e.id===id):{};if(!e)return;$('entryTitle').textContent=id?'Edit hours':'Add hours';$('entryDate').value=date;for(const field of ['start','finish','manual','site','notes'])$(field).value=e[field]??'';$('entryError').textContent='';$('deleteSlot').hidden=!id;$('modeSummary').checked=e.kind==='summary';$('modeSplit').checked=!$('modeSummary').checked;syncMode();$('entryDialog').showModal();}
function draft(){const summary=$('modeSummary').checked;return {date:$('entryDate').value,kind:summary?'summary':'split',start:summary?'':$('start').value,finish:summary?'':$('finish').value,manual:$('manual').value,site:$('site').value.trim(),notes:$('notes').value.trim()};}
function updateCalculation(){const d=draft();$('calculation').textContent=(d.manual!==''||(d.start&&d.finish))?hours(d).toFixed(2)+' hours'+(d.finish&&d.start&&d.finish<d.start?' · Finishes the next day':''):'Enter start and finish times.';}
for(const field of ['start','finish','manual'])$(field).addEventListener('input',updateCalculation);
function saveSlot(data,old=null,replaceDay=false){
 validateSlot(data);ensureUnlocked(state,data.date);if(old)ensureUnlocked(state,old.date);

 const next=structuredClone(state);if(old)next.entries[old.date]=slots(old.date).filter(e=>e.id!==old.id);
 if(replaceDay)next.entries[data.date]=[];
 if((next.entries[data.date]||[]).some(e=>e.kind==='summary')||(data.kind==='summary'&&(next.entries[data.date]||[]).length))throw Error('Switch this day’s entry mode in the editor before adding hours.');
 if(overlaps(next,data.date,data,old?.id))throw Error('This time overlaps an existing slot. Adjust the times to avoid counting hours twice.');
 const {date,...entry}=data;entry.id=old?.id||crypto.randomUUID();next.entries[date]=[...(next.entries[date]||[]),entry].sort((a,b)=>(a.start||'').localeCompare(b.start||''));next.savedWeeks=touchWeek(next,date);persist(next);return entry;
}
function submitEntry(event){event.preventDefault();try{const d=draft();validateSlot(d);ensureUnlocked(state,d.date);if(editing)ensureUnlocked(state,editing.date);const other=slots(d.date).filter(e=>e.id!==editing?.id);const replace=d.kind==='summary'?other.length>0:other.some(e=>e.kind==='summary');if(replace&&!confirm('Replace existing entries for this day with '+(d.kind==='summary'?'one daily summary':'split time slots')+'? This prevents double counting.'))return;saveSlot(d,editing,replace);selected=monday(parseDate(d.date));render();$('entryDialog').close();toast('Time slot saved');}catch(e){$('entryError').textContent=e.message;}}
function deleteEntry(){if(!editing)return;if(!confirm('Delete this time slot? Other slots on this day will be kept.'))return;transact(()=>{ensureUnlocked(state,editing.date);const next=structuredClone(state);next.entries[editing.date]=slots(editing.date).filter(e=>e.id!==editing.id);next.removed=markRemoved(next,editing.id);next.savedWeeks=touchWeek(next,editing.date);persist(next);$('entryDialog').close();toast('Time slot deleted');});}
const settingsFields=[['name','Your name'],['employee','Employee / contractor no.'],['employer','Employer display name'],['legal','Legal entity'],['abn','ABN'],['phone','Phone'],['email','Email'],['location','Location'],['tag','Company tag'],['sender','Sender email'],['recipient','Accounts email(s)'],['bcc','BCC email(s) — optional']];
const pdfFields=[['logo','Company logo'],['employer','Employer name'],['legal','Legal name and ABN'],['employee','Employee / contractor number'],['schedule','Submission and payment dates'],['times','Start and finish times'],['sites','Site / job names'],['slotNotes','Slot descriptions / notes'],['dayNotes','Day notes marked for inclusion'],['signature','Approval / signature line']];
function openSettings(){newEmployer=false;showSettings(state.settings);}
function showSettings(values){pendingLogo=values.logo||'';pendingSignature=values.signature||'';$('scheduleDay').value=String(values.schedule?.weekday??2);$('scheduleTime').value=values.schedule?.time||'23:00';$('fallbackHours').value=values.schedule?.fallbackHours??6;$('scheduleDate').value=newEmployer?'':state.scheduleOverrides?.[iso(selected)]||'';$('pdfOptions').innerHTML=pdfFields.map(([key,label])=>'<label class="pref-toggle"><input type="checkbox" id="pdf-'+key+'"'+(values.pdf?.[key]!==false?' checked':'')+'> '+label+'</label>').join('');$('workspaceCode').value=values.workspace||'';$('syncNote').textContent=values.workspace?'Connected. Hours merge with every device holding this code.':'Not connected \u2014 hours stay in this browser only.';$('sendEndpoint').value=values.sendEndpoint||'';$('sendToken').value=values.sendToken||'';$('sendCheck').textContent='';$('themeChoice').value=values.theme||'blue';$('densityChoice').value=values.density||'comfortable';$('logoUpload').value='';$('logoStatus').textContent=pendingLogo?'Logo attached':'Upload your company’s actual logo, or add it later.';$('signatureUpload').value='';$('signatureStatus').textContent=pendingSignature?'Signature attached. It prints on the approval line.':'No signature yet — the PDF leaves the line blank to sign by hand.';showSignature();$('settingsFields').innerHTML=settingsFields.map(([key,label])=>'<label>'+label+'<input name="'+key+'" id="setting-'+key+'" type="'+(['email','sender','recipient','bcc'].includes(key)?'email':'text')+'"'+(['recipient','bcc'].includes(key)?' multiple':'')+' maxlength="300" value="'+esc(values[key]||'')+'"'+(['employer','sender','recipient'].includes(key)?' required':'')+'></label>').join('');$('settingsDialog').showModal();}
function saveSettings(e){e.preventDefault();transact(()=>{const next=structuredClone(state);if(newEmployer){next.companies[next.activeCompany]=companySnapshot(next);next.activeCompany=crypto.randomUUID();next.settings={};next.entries={};next.submitted={};next.dayNotes={};next.dayNotesIncluded={};next.history=[];next.scheduleOverrides={};}for(const [key] of settingsFields)next.settings[key]=$('setting-'+key).value.trim();next.settings.logo=pendingLogo;next.settings.signature=pendingSignature;next.settings.pdf=Object.fromEntries(pdfFields.map(([key])=>[key,$('pdf-'+key).checked]));const code=$('workspaceCode').value.trim();
 if(code&&!validWorkspace(code))throw Error('That workspace code is not valid. Create one, or paste the code from your other device.');
 next.settings.workspace=code;next.settings.sendEndpoint=$('sendEndpoint').value.trim();next.settings.sendToken=$('sendToken').value.trim();next.settings.theme=$('themeChoice').value;next.settings.density=$('densityChoice').value;next.settings.schedule={requested:true,weekday:Number($('scheduleDay').value),time:$('scheduleTime').value,timezone:'Australia/Melbourne',fallbackHours:Number($('fallbackHours').value)};next.scheduleOverrides??={};if($('scheduleDate').value)next.scheduleOverrides[iso(selected)]=$('scheduleDate').value;else delete next.scheduleOverrides[iso(selected)];persist(next);newEmployer=false;$('settingsDialog').close();toast('Employer details saved');});}
$('newCompany').onclick=()=>{newEmployer=true;showSettings({name:state.settings.name,employee:state.settings.employee,sender:state.settings.sender,bcc:state.settings.bcc});};
$('companySelect').onchange=e=>transact(()=>persist(switchCompany(state,e.target.value)));
$('removeLogo').onclick=()=>{pendingLogo='';$('logoUpload').value='';$('logoStatus').textContent='Logo removed. Save details to confirm.';};
async function readImage(file,limit){
 if(!['image/png','image/jpeg'].includes(file.type)||file.size>1024*1024)throw Error('Choose a PNG or JPEG under 1 MB.');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
 const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=data;});
 const canvas=document.createElement('canvas'),scale=Math.min(1,limit/Math.max(img.width,img.height));
 canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/png');
}
$('logoUpload').onchange=async e=>{const file=e.target.files[0];if(!file)return;
 try{pendingLogo=await readImage(file,768);$('logoStatus').textContent='Logo ready. Save details to confirm.';}
 catch(error){toast(error.message||'This image could not be opened. Try another PNG or JPEG.');}};
function showSignature(){
 const has=/^data:image\/(png|jpeg);base64,/.test(pendingSignature||'');
 $('signaturePreview').hidden=!has;
 $('signaturePreview').innerHTML=has?'<img alt="Your signature" src="'+esc(pendingSignature)+'">':'';
 $('removeSignature').hidden=!has;
}
$('signatureUpload').onchange=async e=>{const file=e.target.files[0];if(!file)return;
 try{pendingSignature=await readImage(file,900);$('signatureStatus').textContent='Signature ready. Save details to confirm.';showSignature();}
 catch(error){toast(error.message||'This image could not be opened. Try another PNG or JPEG.');}};
$('removeSignature').onclick=()=>{pendingSignature='';$('signatureUpload').value='';$('signatureStatus').textContent='Signature deleted. Save details to confirm.';showSignature();};
$('days').addEventListener('change',e=>{const date=e.target.dataset?.dayNote||e.target.dataset?.noteInclude;if(!date)return;transact(()=>{ensureUnlocked(state,date);const next=structuredClone(state);if(e.target.dataset.noteInclude){next.dayNotesIncluded??={};next.dayNotesIncluded[date]=e.target.checked;}else{next.dayNotes[date]=e.target.value.trim();}persist(next,false);toast('Day note preferences saved');});});
function copyPrevious(){transact(()=>{
 const previous=Array.from({length:7},(_,i)=>slots(iso(add(selected,i-7))));if(!previous.flat().length){toast('No time slots in the previous week.');return;}
 if(weekSlots().length&&!confirm('Replace all time slots in this week with the previous week?'))return;
 const next=structuredClone(state);for(let i=0;i<7;i++){const key=iso(add(selected,i));ensureUnlocked(state,key);next.entries[key]=previous[i].map(e=>({...e,id:crypto.randomUUID()}));}
 for(let i=0;i<7;i++){const key=iso(add(selected,i));for(const e of next.entries[key])if(overlaps(next,key,e,e.id))throw Error('Copy would create overlapping slots, including an overnight slot. Edit the affected days individually.');}
 next.savedWeeks=touchWeek(next,iso(selected));persist(next);toast('Previous week copied');
 });}
function markSubmitted(){transact(()=>{const key=iso(selected),next=structuredClone(state);if(next.submitted[key]){if(!confirm('Reopen this submitted timesheet for editing?'))return;delete next.submitted[key];}else{if(!weekSlots().length){toast('Add a time slot before marking this week as submitted.');return;}if(!confirm('Mark this week as submitted? This records its status; it does not send an email.'))return;next.submitted[key]=true;next.history??=[];const snapshot={settings:structuredClone(next.settings),entries:structuredClone(next.entries),dayNotes:structuredClone(next.dayNotes),dayNotesIncluded:structuredClone(next.dayNotesIncluded),scheduleOverrides:structuredClone(next.scheduleOverrides)};next.history.push({id:crypto.randomUUID(),week:key,savedAt:new Date().toISOString(),revision:next.history.filter(h=>h.week===key).length+1,snapshot});}persist(next);toast(next.submitted[key]?'Marked as submitted':'Timesheet reopened');});}
const blankable=(parts,sep)=>parts.map(v=>String(v??'').trim()).filter(Boolean).join(sep);
function buildPrint(){
 const s=state.settings,sun=add(selected,6);let rows='';
 for(let i=0;i<7;i++){const d=add(selected,i),list=slots(iso(d));if(!list.length)rows+='<tr><td>'+fmt(d,{weekday:'short',day:'numeric',month:'short'})+'</td><td></td><td></td><td></td><td></td><td></td></tr>';
 for(const e of list)rows+='<tr><td>'+fmt(d,{weekday:'short',day:'numeric',month:'short'})+'</td><td>'+esc(e.start||'')+'</td><td>'+esc(e.finish||'')+(e.start&&e.finish&&e.finish<e.start?' (+1 day)':'')+'</td><td>'+hours(e).toFixed(2)+(e.manual!==''&&e.manual!=null?'*':'')+'</td><td>'+esc(e.site)+'</td><td>'+esc(e.notes)+'</td></tr>';
 if(list.length>1)rows+='<tr><td colspan="6" class="day-subtotal">'+fmt(d,{weekday:'long'})+' total: '+dailyTotal(list).toFixed(2)+' hours</td></tr>';
 }
 $('printSheet').innerHTML='<h1>Weekly timesheet</h1><div class="print-sub">'+esc(blankable([s.employer,s.legal],' · '))+'</div><div class="print-meta"><div><b>Employee:</b> '+esc(s.name||'')+'</div><div><b>Employee / contractor no.:</b> '+esc(s.employee||'')+'</div><div><b>Week ending:</b> '+fmt(sun,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</div><div><b>ABN:</b> '+esc(s.abn)+'</div><div><b>Submission:</b> '+fmt(add(selected,8),{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</div><div><b>Payment:</b> '+fmt(add(selected,9),{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</div></div><table><colgroup><col style="width:17%"><col style="width:10%"><col style="width:13%"><col style="width:9%"><col style="width:20%"><col style="width:31%"></colgroup><thead><tr><th>DATE</th><th>START</th><th>FINISH</th><th>HOURS</th><th>SITE / JOB</th><th>DESCRIPTION / NOTES</th></tr></thead><tbody>'+rows+'</tbody></table><div class="print-total">Total: '+dailyTotal(weekSlots()).toFixed(2)+' hours</div>'+(weekSlots().some(e=>e.manual!==''&&e.manual!=null)?'<p>* Manually adjusted hours.</p>':'')+'<div class="signature">Employee approval / signature: _________________________ &nbsp; Date: ______________</div>';
}
$('days').addEventListener('click',e=>{const b=e.target.closest('button[data-date]');if(b)openEntry(b.dataset.date,b.dataset.id||null);});
$('entryForm').addEventListener('submit',submitEntry);$('deleteSlot').onclick=deleteEntry;$('settingsForm').onsubmit=saveSettings;
for(const id of ['navSettings','profileBtn','editEmployer'])$(id).onclick=openSettings;
$('prevWeek').onclick=()=>{selected=add(selected,-7);render();};$('nextWeek').onclick=()=>{selected=add(selected,7);render();};
for(const id of ['thisWeek','navTimesheets'])$(id).onclick=()=>{selected=monday(new Date());render();};
$('addEntry').onclick=()=>{const today=iso(new Date());openEntry(today>=iso(selected)&&today<=iso(add(selected,6))?today:iso(selected));};
$('saveWeek').onclick=()=>transact(()=>{
 if(!weekSlots().length){toast('Add hours to this week before saving it.');return;}
 const next=structuredClone(state);next.savedWeeks=touchWeek(next,iso(selected));persist(next);
 const ending=fmt(add(selected,6),{day:'numeric',month:'short',year:'numeric'});
 if(validWorkspace(workspace())){syncNow('manual');toast('Week ending '+ending+' saved and syncing to your other devices.');}
 else toast('Week ending '+ending+' saved on this device. Connect a workspace in Settings to keep it on your other devices.');
});
$('copyWeek').onclick=copyPrevious;$('submitBtn').onclick=markSubmitted;$('pdfBtn').onclick=downloadPdf;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
window.addEventListener('storage',e=>{if(e.key===STORAGE&&e.newValue){if($('entryDialog').open||$('settingsDialog').open){toast('Another tab changed this timesheet. Reload before saving to avoid overwriting changes.');storageError=true;return;}try{state=migrate(JSON.parse(e.newValue));render();}catch{toast('Could not read changes from another tab.');}}});
if(document.modelContext?.registerTool)try{Promise.resolve(document.modelContext.registerTool({name:'add_time_entry',title:'Add time slot',description:'Append one time slot without replacing other slots on that day. Rejects overlapping times and submitted weeks.',inputSchema:{type:'object',properties:{date:{type:'string'},start:{type:'string'},finish:{type:'string'},site:{type:'string'},notes:{type:'string'}},required:['date','start','finish'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!input||typeof input!=='object')throw Error('A time slot is required.');for(const k of ['date','start','finish'])if(typeof input[k]!=='string')throw Error('Invalid '+k);for(const k of ['site','notes'])if(input[k]!=null&&typeof input[k]!=='string')throw Error('Invalid '+k);const e=saveSlot({...input,manual:'',site:input.site||'',notes:input.notes||''});selected=monday(parseDate(input.date));render();return {saved:true,id:e.id,date:input.date,hours:hours(e)};}})).catch(()=>{});}catch{}
const SYNC={url:SUPABASE_URL,key:SUPABASE_PUBLISHABLE_KEY};
let syncRevision=0,syncing=false,syncAgain=false;
const workspace=()=>String(state.settings.workspace||'').trim();
function syncBadge(text,tone){const badge=$('syncState');badge.hidden=!text;badge.textContent=text||'';badge.setAttribute('data-state',tone||'ok');}
// Every device holding the workspace code converges on the same timesheet:
// pull, merge without overwriting, push the union back.
async function syncNow(reason='save'){
 if(!validWorkspace(workspace())||storageError)return;
 if(syncing){syncAgain=true;return;}
 syncing=true;syncBadge('Syncing\u2026','working');
 try{
  const result=await exchange(SYNC,workspace(),state,syncRevision);
  syncRevision=result.revision;
  const changed=JSON.stringify(result.state.entries)!==JSON.stringify(state.entries)||JSON.stringify(result.state.companies)!==JSON.stringify(state.companies);
  if(changed){localStorage.setItem(STORAGE,JSON.stringify(result.state));state=result.state;render();}
  syncBadge('Synced','ok');
  if(result.report.slots)toast('Brought in '+result.report.slots+' time '+(result.report.slots===1?'slot':'slots')+' from your other devices.');
 }catch(e){syncBadge('Not synced','failed');if(reason==='manual')toast('Sync failed: '+e.message);}
 finally{syncing=false;if(syncAgain){syncAgain=false;setTimeout(()=>syncNow('save'),400);}}
}
let syncTimer=0;
const syncSoon=()=>{clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow('save'),900);};
$('workspaceNew').onclick=()=>{const code=newWorkspace();if(!code){toast('This browser cannot generate a code. Paste one from another device.');return;}$('workspaceCode').value=code;$('syncNote').textContent='New workspace. Save details, then paste this code on your other devices.';};
$('workspaceCopy').onclick=async()=>{const code=$('workspaceCode').value.trim();if(!code)return;try{await navigator.clipboard.writeText(code);$('syncNote').textContent='Code copied. Paste it into Settings on your other device.';}catch{$('syncNote').textContent='Copy it by hand: '+code;}};
render();if(storageError)toast('Stored data could not be read. Saving is paused to protect your entries.');
if(validWorkspace(workspace()))syncNow('load');
document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)syncNow('focus');});
window.addEventListener('online',()=>syncNow('online'));

function syncMode(){const summary=$('modeSummary').checked;for(const id of ['startLabel','finishLabel'])$(id).hidden=summary;$('manual').required=summary;$('hoursLabel').textContent=summary?'Total hours for the day':'Hours override (optional)';$('manual').placeholder=summary?'e.g. 8':'Calculated automatically';$('modeHint').textContent=summary?'One total for the day. Replaces split slots after confirmation.':'Separate start and finish times for each part of the day.';updateCalculation();}
$('modeSplit').onchange=syncMode;$('modeSummary').onchange=syncMode;
let previewUrl='',previewFile=null;
const pdfBlobUrl=file=>URL.createObjectURL(new Blob([file.bytes],{type:'application/pdf'}));
function savePdf(file,filename){const url=pdfBlobUrl(file),a=document.createElement('a');a.href=url;a.download=filename||file.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function releasePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}$('previewFrame').removeAttribute('src');}
async function downloadPdf(){try{const file=await createTimesheetPdf(state,selected);savePdf(file);$('mailFile').textContent='Attach: '+file.filename;toast('PDF downloaded');return file;}catch(e){toast('PDF export failed: '+e.message);return null;}}
async function previewPdf(){try{const file=await createTimesheetPdf(state,selected);releasePreview();previewFile=file;previewUrl=pdfBlobUrl(file);$('previewFrame').src=previewUrl;$('previewFile').textContent=file.filename;$('mailFile').textContent='Attach: '+file.filename;$('previewDialog').showModal();return file;}catch(e){toast('PDF preview failed: '+e.message);return null;}}
$('previewBtn').onclick=previewPdf;
$('previewDownload').onclick=()=>{if(!previewFile)return;savePdf(previewFile);toast('PDF downloaded');};
$('previewOpen').onclick=()=>{if(previewUrl)window.open(previewUrl,'_blank','noopener,noreferrer');};
$('previewPrint').onclick=()=>{const frame=$('previewFrame');try{frame.contentWindow.focus();frame.contentWindow.print();}catch{if(previewUrl)window.open(previewUrl,'_blank','noopener,noreferrer');else toast('Open the downloaded PDF to print it.');}};
$('previewDialog').addEventListener('close',()=>{releasePreview();previewFile=null;});
function sendStatus(){const record=state.sent?.[iso(selected)];
 $('sendState').textContent=record?.sentAt?'Sent to accounts '+new Date(record.sentAt).toLocaleString('en-AU'):sendConfigured(state.settings)?'Sends from '+(state.settings.sender||'your sending account'):'Not connected yet \u2014 set this up in Settings.';}
async function sendToAccounts(force=false){
 const s=state.settings,entries=weekSlots();
 if(!entries.length){toast('Add hours before sending this week.');return;}
 if(!sendConfigured(s)){toast('Add your send service and token in Settings first.');openSettings();return;}
 if(!s.recipient){toast('Add the accounts email in Settings first.');openSettings();return;}
 const sunday=add(selected,6);
 if(!confirm('Email this timesheet to '+s.recipient+'?\n\nWeek ending '+fmt(sunday,{day:'numeric',month:'long',year:'numeric'})+'\nTotal '+dailyTotal(entries).toFixed(2)+' hours'))return;
 $('sendBtn').disabled=true;$('sendState').textContent='Building the PDF\u2026';
 try{
  const file=await createTimesheetPdf(state,selected);
  $('mailFile').textContent='Attach: '+file.filename;$('sendState').textContent='Sending to '+s.recipient+'\u2026';
  const result=await deliver(s.sendEndpoint,sendPayload({settings:s,week:selected,file,entries,force,format:d=>fmt(d,{day:'numeric',month:'long',year:'numeric'})}));
  if(result.alreadySent){$('sendState').textContent='Already sent'+(result.sentAt?' '+new Date(result.sentAt).toLocaleString('en-AU'):'');
   if(confirm(result.error+'\n\nSend it again anyway?')){$('sendBtn').disabled=false;return sendToAccounts(true);}return;}
  if(!result.ok){$('sendState').textContent='Not sent';toast(result.error);return;}
  recordSend(result);
  $('sendState').textContent='Sent to '+s.recipient;
  toast(result.archived?'Sent to accounts and archived':'Sent to accounts'+(result.warning?' \u2014 not archived':''));
 }catch(e){$('sendState').textContent='Not sent';toast('Could not build the PDF: '+e.message);}
 finally{$('sendBtn').disabled=false;}
}
function recordSend(result){transact(()=>{const key=iso(selected),next=structuredClone(state);
 next.sent??={};next.sent[key]={sentAt:new Date().toISOString(),messageId:result.messageId||'',pdfPath:result.pdfPath||'',to:state.settings.recipient,bcc:state.settings.bcc};
 if(!next.submitted[key]){next.submitted[key]=true;next.history??=[];
  next.history.push({id:crypto.randomUUID(),week:key,savedAt:new Date().toISOString(),sentAt:next.sent[key].sentAt,revision:next.history.filter(h=>h.week===key).length+1,
   snapshot:{settings:structuredClone(next.settings),entries:structuredClone(next.entries),dayNotes:structuredClone(next.dayNotes),dayNotesIncluded:structuredClone(next.dayNotesIncluded),scheduleOverrides:structuredClone(next.scheduleOverrides)}});}
 persist(next);});}
$('sendBtn').onclick=()=>sendToAccounts(false);
$('sendTest').onclick=async()=>{const endpoint=$('sendEndpoint').value.trim(),token=$('sendToken').value.trim();
 if(!endpoint||!token){$('sendCheck').textContent='Enter both the send service address and the token.';return;}
 $('sendCheck').textContent='Checking\u2026';
 const result=await deliver(endpoint,{token,check:true});
 $('sendCheck').textContent=result.ok?'Connected. Sends from '+(result.sender||'the configured mailbox')+(result.recipients?' to '+result.recipients+' approved address'+(result.recipients===1?'':'es')+'.':'.'):result.error||'The send service did not accept this token.';};
$('emailBtn').onclick=()=>{if(!weekSlots().length){toast('Add hours before preparing an email.');return;}const s=state.settings,sun=add(selected,6);$('mailFrom').value=s.sender||'';$('mailTo').value=s.recipient||'';$('mailBcc').value=s.bcc||'';$('mailSubject').value='Timesheet - '+(s.name||'Gradcon')+' - week ending '+fmt(sun,{day:'numeric',month:'long',year:'numeric'});$('mailBody').value='Hi Accounts,\n\nPlease find attached my timesheet for '+fmt(selected)+' to '+fmt(sun,{day:'numeric',month:'short',year:'numeric'})+'.\n\nTotal hours: '+dailyTotal(weekSlots()).toFixed(2)+'\nSubmission date: '+fmt(add(selected,8))+'\nPayment date: '+fmt(add(selected,9))+'\n\nKind regards,\n'+(s.name||'');$('emailDialog').showModal();};
$('mailDownload').onclick=downloadPdf;
$('emailForm').onsubmit=e=>{e.preventDefault();const fields=['mailFrom','mailTo','mailBcc','mailSubject'];if(fields.some(id=>/[\r\n]/.test($(id).value))){toast('Email headers must be a single line.');return;}const next=structuredClone(state);next.settings.sender=$('mailFrom').value.trim();next.settings.recipient=$('mailTo').value.trim();next.settings.bcc=$('mailBcc').value.trim();try{persist(next);}catch(error){toast(error.message);return;}const params=new URLSearchParams({authuser:$('mailFrom').value.trim(),view:'cm',fs:'1',to:$('mailTo').value.trim(),bcc:$('mailBcc').value.trim(),su:$('mailSubject').value,body:$('mailBody').value});window.open('https://mail.google.com/mail/?'+params.toString(),'_blank','noopener,noreferrer');toast('Attach the PDF in Gmail, check sender and BCC, then press Send.');};

function openHistory(){
 const weeks=savedWeeks(state);
 $('weekList').innerHTML=weeks.map(w=>'<article class="week-row"><div><strong>Week ending '+esc(fmt(add(parseDate(w.key),6),{day:'numeric',month:'short',year:'numeric'}))+' \u00b7 '+w.hours.toFixed(2)+' hours</strong><p>'+w.slots+' time '+(w.slots===1?'slot':'slots')+(w.savedAt?' \u00b7 saved '+esc(since(w.savedAt)):'')+(w.submitted?' \u00b7 submitted':'')+(w.sentAt?' \u00b7 emailed':'')+'</p></div><div><button class="btn" data-history-week="'+esc(w.key)+'">Open</button><button class="btn" data-week-pdf="'+esc(w.key)+'">PDF</button></div></article>').join('')||'<p>No hours saved yet for this employer. Add hours on any week and they are saved as you go.</p>';
 openSubmissions();
}
function openSubmissions(){const records=[...(state.history||[])].reverse();const legacy=Object.keys(state.submitted).filter(w=>!records.some(h=>h.week===w));$('historyList').innerHTML=records.map(h=>'<article class="history-row"><div><strong>Week ending '+esc(fmt(add(parseDate(h.week),6),{day:'numeric',month:'short',year:'numeric'}))+'</strong><p>Marked submitted · Revision '+h.revision+'<br>'+esc(new Date(h.savedAt).toLocaleString('en-AU'))+'</p></div><div><button class="btn" data-history-week="'+esc(h.week)+'">Open week</button><button class="btn primary" data-history-pdf="'+esc(h.id)+'">Saved PDF</button></div></article>').join('')+legacy.map(w=>'<article class="history-row"><div><strong>Week ending '+esc(fmt(add(parseDate(w),6),{day:'numeric',month:'short',year:'numeric'}))+'</strong><p>Previously marked submitted · No saved PDF snapshot</p></div><button class="btn" data-history-week="'+esc(w)+'">Open week</button></article>').join('')||'<p>No submissions yet. Mark a completed week as submitted to save a PDF snapshot here.</p>';$('historyDialog').showModal();}
$('prefillWeek').onclick=()=>{
 const near=nearestWeekWithHours();if(!near)return;
 const source=parseDate(near.key),ending=fmt(add(source,6),{day:'numeric',month:'short'});
 if(!confirm('Copy the '+Array.from({length:7},(_,i)=>slots(iso(add(source,i))).length).reduce((a,b)=>a+b,0)+' time slots from the week ending '+ending+' into this week? You can edit them afterwards.'))return;
 transact(()=>{
  const next=structuredClone(state);
  for(let i=0;i<7;i++){const key=iso(add(selected,i));ensureUnlocked(state,key);
   next.entries[key]=slots(iso(add(source,i))).map(e=>({...e,id:crypto.randomUUID()}));}
  for(let i=0;i<7;i++){const key=iso(add(selected,i));
   for(const e of next.entries[key])if(overlaps(next,key,e,e.id))throw Error('Those slots would overlap in this week. Add them day by day instead.');}
  next.savedWeeks=touchWeek(next,iso(selected));persist(next);toast('Week prefilled from '+ending+'. Edit any day that differs.');
 });
};
$('elsewhere').onclick=()=>{const near=nearestWeekWithHours();if(!near)return;selected=parseDate(near.key);render();toast('Opened the week ending '+fmt(add(parseDate(near.key),6),{day:'numeric',month:'short'}));};
$('navHistory').onclick=openHistory;
let recoverable=[];
function openRecover(){
 recoverable=recoveryCandidates([{label:'This employer list',raw:readStore(STORAGE)},{label:'Older version of the app',raw:readStore(LEGACY)},...readBackups().map(b=>({label:'Automatic backup \u00b7 '+new Date(b.savedAt).toLocaleString('en-AU'),raw:b}))]);
 $('recoverList').innerHTML=recoverable.map((w,i)=>'<article class="history-row"><div><strong>Week ending '+esc(fmt(add(parseDate(w.key),6),{day:'numeric',month:'short',year:'numeric'}))+' \u00b7 '+w.hours.toFixed(2)+' hours</strong><p>'+w.slots+' time '+(w.slots===1?'slot':'slots')+(w.employer?' \u00b7 '+esc(w.employer):'')+'<br>'+esc(w.source)+'</p></div><div><button class="btn" data-recover-week="'+esc(w.key)+'">Open week</button><button class="btn primary" data-recover="'+i+'">Restore</button></div></article>').join('')||'<p>No stored hours were found in this browser. If you entered them on another device or browser, open the timesheet there \u2014 hours are not synced between devices.</p>';
 $('recoverDialog').showModal();
}
$('recoverBtn').onclick=openRecover;
$('backupSave').onclick=()=>{
 try{
  const payload=backupPayload(state),blob=new Blob([JSON.stringify(payload,null,1)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Gradcon-timesheet-backup-'+iso(new Date())+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  toast('Backup saved. Keep it somewhere outside this browser.');
 }catch(e){toast('Backup could not be created: '+e.message);}
};
$('backupRestore').onclick=()=>$('backupFile').click();
$('backupFile').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 e.target.value='';
 try{
  const {state:restored,report}=mergeBackup(state,JSON.parse(await file.text()));
  if(!report.slots&&!report.employers&&!report.snapshots){toast('That backup holds nothing this browser is missing.');return;}
  persist(restored);
  const near=nearestWeekWithHours();if(!weekSlots().length&&near){selected=parseDate(near.key);render();}
  openRecover();
  toast('Restored '+report.slots+' time '+(report.slots===1?'slot':'slots')+' across '+report.weeks+' '+(report.weeks===1?'week':'weeks')+(report.employers?' and '+report.employers+' employer profile'+(report.employers===1?'':'s'):'')+'. Nothing already here was changed.');
 }catch(error){toast('That file could not be restored: '+error.message);}
};
$('recoverList').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.recoverWeek){selected=parseDate(b.dataset.recoverWeek);render();$('recoverDialog').close();return;}
 if(!b.dataset.recover)return;const week=recoverable[Number(b.dataset.recover)];if(!week)return;
 if(!confirm('Add '+week.hours.toFixed(2)+' hours to the week ending '+fmt(add(parseDate(week.key),6),{day:'numeric',month:'short',year:'numeric'})+' for '+(state.settings.employer||'this employer')+'? Hours already in that week are kept.'))return;
 transact(()=>{persist(restoreWeek(state,week));selected=parseDate(week.key);render();$('recoverDialog').close();toast('Hours restored');});
});
$('weekList').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.historyWeek){selected=parseDate(b.dataset.historyWeek);render();$('historyDialog').close();return;}
 if(b.dataset.weekPdf){try{const file=await createTimesheetPdf(state,parseDate(b.dataset.weekPdf));savePdf(file);toast('PDF downloaded');}catch(error){toast('PDF export failed: '+error.message);}}
});
$('historyList').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.historyWeek){selected=parseDate(b.dataset.historyWeek);render();$('historyDialog').close();}if(b.dataset.historyPdf){const h=state.history.find(h=>h.id===b.dataset.historyPdf);if(!h)return;try{const file=await createTimesheetPdf(h.snapshot,parseDate(h.week));savePdf(file,file.filename.replace('.pdf','-revision-'+h.revision+'.pdf'));}catch(error){toast('Saved PDF could not be created: '+error.message);}}});
