export const DEFAULTS={name:'',employee:'',employer:'Gradcon Concrete Constructions',legal:'GRADCON PTY LTD',abn:'35 161 870 328',phone:'0415 653 555',email:'grady@gradcon.com.au',location:'Rosebud VIC 3939'};
export const pad=n=>String(n).padStart(2,'0');
export const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
export const parseDate=s=>new Date(s+'T12:00:00');
export function monday(date){const d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;}
export function add(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(parseDate(s))===s;}
export function hours(e){if(e.manual!==''&&e.manual!=null)return Number(e.manual);if(!e.start||!e.finish)return 0;const minutes=t=>+t.slice(0,2)*60+(+t.slice(3));let diff=minutes(e.finish)-minutes(e.start);if(diff<0)diff+=1440;return diff/60;}
export function validateSlot(e){if(!validDate(e.date))throw Error('Choose a valid date.');const time=/^([01]\d|2[0-3]):[0-5]\d$/;if((e.start&&!time.test(e.start))||(e.finish&&!time.test(e.finish)))throw Error('Enter valid start and finish times.');const override=e.manual!==''&&e.manual!=null;if(override&&(!Number.isFinite(Number(e.manual))||Number(e.manual)<0||Number(e.manual)>24))throw Error('Hours must be between 0 and 24.');if(!override&&(!e.start||!e.finish||e.start===e.finish))throw Error('Enter different start and finish times, or an hours override.');}
export function migrate(raw){const state={schema:3,activeCompany:raw?.activeCompany||'gradcon',companies:{...raw?.companies},history:[...(raw?.history||[])],scheduleOverrides:{...raw?.scheduleOverrides},dayNotes:{...raw?.dayNotes},dayNotesIncluded:{...raw?.dayNotesIncluded},sent:{...raw?.sent},settings:{...DEFAULTS,tag:'Concrete construction',logo:'',sender:'projects@gradcon.com.au',recipient:'accounts@gradcon.com.au',bcc:'fyne.boma@gmail.com',...raw?.settings},entries:{},submitted:{...raw?.submitted}};for(const [date,value] of Object.entries(raw?.entries||{})){state.entries[date]=(Array.isArray(value)?value:[value]).filter(Boolean).map((e,i)=>({...e,id:e.id||'legacy-'+date+'-'+i}));}return state;}
export function companySnapshot(state){return structuredClone({settings:state.settings,entries:state.entries,submitted:state.submitted,sent:state.sent||{},dayNotes:state.dayNotes,dayNotesIncluded:state.dayNotesIncluded,history:state.history,scheduleOverrides:state.scheduleOverrides});}
export function switchCompany(state,id){const next=structuredClone(state);next.companies[next.activeCompany]=companySnapshot(next);if(!next.companies[id])throw Error('Employer not found.');Object.assign(next,structuredClone(next.companies[id]));next.activeCompany=id;return next;}
export const dailyTotal=slots=>(slots||[]).reduce((n,s)=>n+hours(s),0);
export function recoveryCandidates(stores){
 const found=[],seen=new Set();
 const collect=(source,employer,entries)=>{
  const weeks={};
  for(const [date,value] of Object.entries(entries||{})){
   if(!validDate(date))continue;
   const list=(Array.isArray(value)?value:[value]).filter(Boolean);if(!list.length)continue;
   const key=weekKey(date),week=weeks[key]??={key,source,employer,days:{},slots:0,hours:0};
   week.days[date]=list;week.slots+=list.length;week.hours+=dailyTotal(list);
  }
  for(const week of Object.values(weeks)){
   const signature=[source,employer,week.key,week.slots,week.hours.toFixed(2)].join('|');
   if(seen.has(signature))continue;seen.add(signature);found.push(week);
  }
 };
 for(const {label,raw} of stores||[]){
  if(!raw||typeof raw!=='object')continue;
  collect(label,raw.settings?.employer||'',raw.entries);
  for(const company of Object.values(raw.companies||{}))collect(label,company?.settings?.employer||'',company?.entries);
  for(const record of raw.history||[])collect(label+' \u00b7 saved submission',record?.snapshot?.settings?.employer||'',record?.snapshot?.entries);
 }
 return found.sort((a,b)=>b.key.localeCompare(a.key)||b.hours-a.hours);
}
export function restoreWeek(state,week){
 const next=structuredClone(state);
 for(const [date,list] of Object.entries(week.days||{})){
  ensureUnlocked(next,date);
  const kept=next.entries[date]||[],ids=new Set(kept.map(e=>e.id));
  const added=list.filter(e=>!ids.has(e.id)).map(e=>({...e,id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'restored-'+date+'-'+Math.random().toString(36).slice(2)}));
  next.entries[date]=[...kept,...added].sort((a,b)=>(a.start||'').localeCompare(b.start||''));
 }
 return next;
}
export function appendSlot(state,date,slot){validateSlot({...slot,date});return {...state,entries:{...state.entries,[date]:[...(state.entries[date]||[]),slot]}};}
export function weekKey(date){return iso(monday(parseDate(date)));}
export function ensureUnlocked(state,date){if(state.submitted[weekKey(date)])throw Error('Reopen this timesheet before editing its slots.');}
export function overlaps(state,date,slot,excludeId){if(!slot.start||!slot.finish)return false;const epoch=parseDate(date).setHours(0,0,0,0);const range=(day,e)=>{const base=parseDate(day).setHours(0,0,0,0);const offset=t=>(+t.slice(0,2)*60+(+t.slice(3)))*60000;let a=base+offset(e.start),b=base+offset(e.finish);if(b<a)b=parseDate(iso(add(parseDate(day),1))).setHours(0,0,0,0)+offset(e.finish);return[a,b]};const [a,b]=range(date,slot);return Object.entries(state.entries).some(([day,slots])=>Math.abs(parseDate(day).setHours(0,0,0,0)-epoch)<172800000&&slots.some(e=>{if(e.id===excludeId||!e.start||!e.finish)return false;const [c,d]=range(day,e);return a<d&&b>c}));}
