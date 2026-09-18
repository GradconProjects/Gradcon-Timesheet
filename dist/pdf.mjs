import {iso,add,hours,dailyTotal,parseDate} from './core.mjs';
import {submissionSchedule} from './automation.mjs';

// The weekly timesheet is always one A4 page. Nothing is drawn until the whole
// week has been measured: the page is laid out at the largest text size that
// fits, compacting the header and footer blocks before shrinking type further.
// Only if a week still will not fit are long descriptions trimmed, and only if
// it still will not fit are rows left off — and then the page says so, with the
// weekly total still counting every slot.
export const SCALE_MAX=1,SCALE_MIN=.42,SIZE_MIN=6;

// Two page shapes. Roomy is the original layout; compact tightens every fixed
// block so a busy week keeps readable type instead of shrinking to fit.
const ROOMY={ruleTop:116,bodyTop:132,titleSize:25,titleTop:57,subTop:92,logoMax:86,logoTitleTop:44,logoSubTop:69,
 fieldBase:31,fieldLine:13,fieldSize:10,labelSize:7.5,band:51,bandAdvance:70,bandLabel:10,bandValue:27,
 totalGap:16,totalBand:51,totalAdvance:65,totalSize:23,totalLabel:17,signature:46,rowFloor:11};
const COMPACT={ruleTop:98,bodyTop:110,titleSize:21,titleTop:46,subTop:76,logoMax:64,logoTitleTop:36,logoSubTop:58,
 fieldBase:26,fieldLine:11,fieldSize:9,labelSize:7,band:40,bandAdvance:52,bandLabel:8,bandValue:22,
 totalGap:10,totalBand:40,totalAdvance:50,totalSize:19,totalLabel:13,signature:32,rowFloor:9.5};

export async function createTimesheetPdf(state,week,api=globalThis.PDFLib){
 if(!api)throw Error('PDF tools have not loaded. Reload the page and try again.');
 const {PDFDocument,StandardFonts,rgb}=api,doc=await PDFDocument.create();
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const blue=rgb(.03,.40,.66),navy=rgb(.10,.20,.29),gray=rgb(.38,.45,.51),line=rgb(.85,.89,.92),pale=rgb(.94,.97,.99),white=rgb(1,1,1);
 const W=595.28,H=841.89,M=38,B=W-M,content=W-2*M;
 const s=state.settings,sun=add(week,6),format=d=>d.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
 const show=key=>s.pdf?.[key]!==false;
 const value=v=>String(v??'').trim(),join=(parts,sep)=>parts.map(value).filter(Boolean).join(sep);
 let logo=null;
 if(show('logo')&&/^data:image\/(png|jpeg);base64,/.test(s.logo||'')){try{logo=s.logo.startsWith('data:image/png')?await doc.embedPng(s.logo):await doc.embedJpg(s.logo);}catch{throw Error('The employer logo could not be embedded. Replace or remove it in employer details.');}}
 const dayEntries=i=>state.entries[iso(add(week,i))]||[],all=Array.from({length:7},(_,i)=>dayEntries(i)).flat();
 const clean=value=>Array.from(String(value??'').replace(/[–—]/g,'-')).map(c=>{if(c==='\n')return c;try{regular.encodeText(c);return c;}catch{return '?';}}).join('');
 const wrap=(text,width,size=9,font=regular)=>{
 let lines=[],current='';for(const para of clean(text).split('\n')){for(const word of para.split(/\s+/)){let part=word;while(font.widthOfTextAtSize(part,size)>width){let n=1;while(n<part.length&&font.widthOfTextAtSize(part.slice(0,n+1),size)<=width)n++;if(current){lines.push(current);current='';}lines.push(part.slice(0,n));part=part.slice(n);}const candidate=current?current+' '+part:part;if(font.widthOfTextAtSize(candidate,size)>width){lines.push(current);current=part;}else current=candidate;}lines.push(current);current='';}return lines.length?lines:[''];};

 const page=doc.addPage([W,H]);
 let y;
 const text=(v,x,top,size=9,font=regular,color=navy)=>page.drawText(clean(v),{x,y:H-top-size,font,size,color});
 const rect=(x,top,w,h,color)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color});
 const rule=(top)=>page.drawLine({start:{x:M,y:H-top},end:{x:B,y:H-top},thickness:.6,color:line});
 const right=(v,top,size,font,color)=>text(v,B-font.widthOfTextAtSize(clean(v),size),top,size,font,color);

 const fields=[[show('employer')?'PREPARED FOR':'',show('employer')?value(s.employer):''],['EMPLOYEE',value(s.name)],[show('legal')?'LEGAL ENTITY / ABN':'',show('legal')?join([s.legal,s.abn],' / '):''],[show('employee')?'EMPLOYEE / CONTRACTOR NO.':'',show('employee')?value(s.employee):'']];
 const adjusted=all.some(e=>e.kind!=='summary'&&e.manual!==''&&e.manual!=null);

 // Height of everything fixed: identity rows, period band, totals, signature.
 const identity=L=>[0,1].reduce((sum,r)=>sum+Math.max(...[0,1].map(c=>L.fieldBase+wrap(fields[r*2+c][1],content/2-20,L.fieldSize,bold).length*L.fieldLine)),0);
 const frame=L=>({top:L.bodyTop+identity(L)+L.bandAdvance,
  tail:L.totalGap+L.totalAdvance+(adjusted?15:0)+(show('signature')?L.signature:0)});

 const metrics=(L,k)=>({size:Math.max(SIZE_MIN,9*k),head:Math.max(6.5,8*k),line:Math.max(7,12*k),pad:12*k,
  min:Math.max(L.rowFloor,28*k),gap:Math.max(L.rowFloor,24*k),notePad:Math.max(10,18*k),header:Math.max(15,24*k)});
 const clip=v=>{const t=v.replace(/\s+\S*$/,'');return (t||v.slice(0,Math.max(1,v.length-1)))+'...';};

 // One week's table laid out at a given shape and scale, descriptions capped.
 const plan=(L,k,cap,joined,totals)=>{
  const m=metrics(L,k),blocks=[];
  for(let i=0;i<7;i++){
   const d=add(week,i),list=dayEntries(i),date=d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
   const entries=list.length?list:[null];
   entries.forEach((e,j)=>{
    const parts=e?[e.kind==='summary'?'Daily summary':null,show('sites')?value(e.site):null,show('slotNotes')?value(e.notes):null].filter(Boolean):[];
    const description=parts.join(joined?' \u00b7 ':'\n');
    let lines=wrap(description,content-270,m.size);
    if(lines.length>cap){lines=lines.slice(0,cap);lines[lines.length-1]=clip(lines[lines.length-1]);}
    const sub=totals==='fold'&&j===0&&list.length>1?dailyTotal(list).toFixed(2)+' hrs':'';
    blocks.push({kind:'row',stripe:i%2===0,date:j?'':date,sub,
     start:show('times')?(e?.kind==='summary'?'':value(e?.start)):'',
     finish:show('times')?(e?.kind==='summary'?'':value(e?.finish)):'',
     hours:e?hours(e).toFixed(2)+(e.kind!=='summary'&&e.manual!==''&&e.manual!=null?'*':''):'',
     lines,height:Math.max(m.min,Math.max(lines.length,sub?2:1)*m.line+m.pad)});
   });
   if(list.length>1&&totals==='rows')blocks.push({kind:'total',hours:dailyTotal(list).toFixed(2)+' hrs',height:m.gap});
   const note=state.dayNotes?.[iso(d)];
   if(show('dayNotes')&&note&&state.dayNotesIncluded?.[iso(d)]){
    let lines=wrap('Day notes: '+note,content-24,m.size);
    if(lines.length>cap){lines=lines.slice(0,cap);lines[lines.length-1]=clip(lines[lines.length-1]);}
    blocks.push({kind:'note',lines,height:lines.length*m.line+m.notePad});
   }
  }
  const {top,tail}=frame(L);
  return {L,m,blocks,budget:H-70-top-tail,height:m.header+blocks.reduce((n,b)=>n+b.height,0)};
 };

 // Biggest type wins; at equal type the roomier page wins.
 // Tried in order at each size: give up the roomy frame first, then put site and
 // notes on one line, then the per-day totals — every row's own hours stay.
 const shapes=[[ROOMY,false,'rows'],[COMPACT,false,'fold'],[ROOMY,true,'rows'],[COMPACT,true,'fold'],[COMPACT,true,'none']];
 const fit=cap=>{
  for(let k=SCALE_MAX;k>=SCALE_MIN-1e-9;k-=.02)
   for(const [L,joined,totals] of shapes){const attempt=plan(L,k,cap,joined,totals);if(attempt.height<=attempt.budget)return attempt;}
  return null;
 };
 let chosen=fit(Infinity);
 for(let cap=12;cap>=1&&!chosen;cap--)chosen=fit(cap);
 let hidden=0;
 if(!chosen){
  chosen=plan(COMPACT,SCALE_MIN,1,true,'none');
  let used=chosen.m.header;const kept=[];
  for(const block of chosen.blocks){
   if(used+block.height<=chosen.budget-chosen.m.line-6){kept.push(block);used+=block.height;}
   else if(block.kind==='row')hidden++;
  }
  chosen={...chosen,blocks:kept,height:used};
 }
 const {L,m}=chosen;

 // Masthead
 rect(0,0,W,7,blue);
 if(logo){
  const scale=Math.min(300/logo.width,L.logoMax/logo.height);
  page.drawImage(logo,{x:M,y:H-16-logo.height*scale,width:logo.width*scale,height:logo.height*scale});
  right('WEEKLY TIMESHEET',L.logoTitleTop,16,bold,navy);right('Week ending '+format(sun),L.logoSubTop,9.5,regular,gray);
 }else{
  if(show('employer'))text(wrap(s.employer,330,12,bold)[0],M,30,12,bold,blue);
  text('WEEKLY TIMESHEET',M,L.titleTop,L.titleSize,bold);
  text('Week ending '+format(sun),M,L.subTop,10,regular,gray);
  text('PERSONAL HOUR LOG',B-118,34,8,bold,gray);
 }
 rule(L.ruleTop);y=L.bodyTop;

 // Who the week is for, and the dates it covers
 for(let r=0;r<2;r++){
  let height=0;
  for(let c=0;c<2;c++){
   const [label,field]=fields[r*2+c],x=M+c*(content/2+8),lines=wrap(field,content/2-20,L.fieldSize,bold);
   text(label,x,y,L.labelSize,bold,gray);
   lines.forEach((v,i)=>text(v,x,y+L.fieldBase/2+i*L.fieldLine,L.fieldSize,bold));
   height=Math.max(height,L.fieldBase+lines.length*L.fieldLine);
  }
  y+=height;
 }
 rect(M,y,content,L.band,pale);
 [['PERIOD',format(week)+' - '+format(sun)],[show('schedule')?'SUBMISSION':'',show('schedule')?format(parseDate(submissionSchedule(state,week).date)):''],[show('schedule')?'PAYMENT':'',show('schedule')?format(add(week,9)):'']]
  .forEach(([label,field],i)=>{const x=M+12+[0,218,360][i];text(label,x,y+L.bandLabel,7,bold,gray);text(field,x,y+L.bandValue,9,bold);});
 y+=L.bandAdvance;

 // The week
 rect(M,y,content,m.header,navy);
 ['DATE',show('times')?'START':'',show('times')?'FINISH':'','HOURS',show('sites')||show('slotNotes')?'WORK DETAILS':'']
  .forEach((v,i)=>text(v,[M+9,M+100,M+153,M+207,M+258][i],y+(m.header-m.head)/2,m.head,bold,white));
 y+=m.header;
 for(const block of chosen.blocks){
  if(block.kind==='row'){
   if(block.stripe)rect(M,y,content,block.height,rgb(.976,.983,.989));
   const baseline=y+(block.height-m.size)/2;
   if(block.sub){text(block.date,M+9,y+m.pad/2,m.size,bold);text(block.sub,M+9,y+m.pad/2+m.line,m.head,bold,blue);}
   else text(block.date,M+9,baseline,m.size,bold);
   text(block.start,M+100,baseline,m.size);
   text(block.finish,M+153,baseline,m.size);
   text(block.hours,M+207,baseline,m.size,bold);
   block.lines.forEach((v,n)=>text(v,M+258,y+(block.height-block.lines.length*m.line)/2+n*m.line-1,m.size,regular,gray));
  }else if(block.kind==='total'){
   text('Daily total',M+100,y+(block.height-m.head)/2,m.head,bold,gray);
   text(block.hours,M+207,y+(block.height-m.size)/2,m.size,bold,blue);
  }else{
   rect(M,y,content,block.height,pale);
   block.lines.forEach((v,n)=>text(v,M+12,y+m.notePad/2+n*m.line-1,m.size,regular,gray));
  }
  y+=block.height;rule(y);
 }
 if(hidden){text(hidden+' further time '+(hidden===1?'slot is':'slots are')+' not shown on this page. The total below includes them.',M+9,y+3,m.size,bold,blue);y+=m.line+6;}

 y+=L.totalGap;rect(M,y,content,L.totalBand,blue);
 text('TOTAL HOURS',M+15,y+L.totalLabel,10,bold,white);
 const total=dailyTotal(all).toFixed(2)+' hrs';
 text(total,B-bold.widthOfTextAtSize(total,L.totalSize)-15,y+(L.totalBand-L.totalSize)/2-2,L.totalSize,bold,white);
 y+=L.totalAdvance;
 if(adjusted){text('* Manually adjusted hours.',M,y,8,regular,gray);y+=15;}
 if(show('signature')){text('Employee approval / signature',M,y+L.signature/4,8,regular,gray);text('Date',B-110,y+L.signature/4,8,regular,gray);y+=L.signature;rule(y);}
 rule(H-49);text('WEEK ENDING '+format(sun).toUpperCase(),M,H-35,7,regular,gray);
 doc.setTitle('Timesheet - '+(s.name||'Gradcon')+' - '+iso(sun));doc.setAuthor(s.name||s.employer);doc.setSubject('Weekly hours for '+s.employer);
 return {bytes:await doc.save(),filename:'Timesheet-'+(s.name||'Gradcon').replace(/[^a-z0-9]+/gi,'-')+'-WE-'+iso(sun)+'.pdf',
  pages:1,textSize:Math.round(m.size*10)/10,layout:L===ROOMY?'roomy':'compact',hidden};
}
