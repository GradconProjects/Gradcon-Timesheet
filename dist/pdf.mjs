import {iso,add,hours,dailyTotal,parseDate} from './core.mjs';
import {submissionSchedule} from './automation.mjs';
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
 const LOGO_MAX_W=300,LOGO_MAX_H=86,LOGO_TOP=16;
 const logoScale=logo?Math.min(LOGO_MAX_W/logo.width,LOGO_MAX_H/logo.height):0,logoW=logo?logo.width*logoScale:0,logoH=logo?logo.height*logoScale:0;
 const dayEntries=i=>state.entries[iso(add(week,i))]||[],all=Array.from({length:7},(_,i)=>dayEntries(i)).flat();
 const clean=value=>Array.from(String(value??'').replace(/[–—]/g,'-')).map(c=>{if(c==='\n')return c;try{regular.encodeText(c);return c;}catch{return '?';}}).join('');
 const wrap=(text,width,size=9,font=regular)=>{
 let lines=[],current='';for(const para of clean(text).split('\n')){for(const word of para.split(/\s+/)){let part=word;while(font.widthOfTextAtSize(part,size)>width){let n=1;while(n<part.length&&font.widthOfTextAtSize(part.slice(0,n+1),size)<=width)n++;if(current){lines.push(current);current='';}lines.push(part.slice(0,n));part=part.slice(n);}const candidate=current?current+' '+part:part;if(font.widthOfTextAtSize(candidate,size)>width){lines.push(current);current=part;}else current=candidate;}lines.push(current);current='';}return lines.length?lines:[''];};
 let page,y;
 const text=(v,x,top,size=9,font=regular,color=navy)=>page.drawText(clean(v),{x,y:H-top-size,font,size,color});
 const rect=(x,top,w,h,color)=>page.drawRectangle({x,y:H-top-h,width:w,height:h,color});
 const rule=(top)=>page.drawLine({start:{x:M,y:H-top},end:{x:B,y:H-top},thickness:.6,color:line});
 const headers=()=>{rect(M,y,content,24,navy);['DATE',show('times')?'START':'',show('times')?'FINISH':'','HOURS',show('sites')||show('slotNotes')?'WORK DETAILS':''].forEach((v,i)=>text(v,[M+9,M+100,M+153,M+207,M+258][i],y+8,8,bold,white));y+=24;};
 const newPage=(first=false)=>{page=doc.addPage([W,H]);rect(0,0,W,7,blue);const right=(v,top,size,font,color)=>text(v,B-font.widthOfTextAtSize(clean(v),size),top,size,font,color);
 if(logo){page.drawImage(logo,{x:M,y:H-LOGO_TOP-logoH,width:logoW,height:logoH});right('WEEKLY TIMESHEET',44,16,bold,navy);right('Week ending '+format(sun),69,9.5,regular,gray);}
 else{if(show('employer'))text(wrap(s.employer,330,12,bold)[0],M,30,12,bold,blue);text('WEEKLY TIMESHEET',M,57,25,bold);text('Week ending '+format(sun),M,92,10,regular,gray);text('PERSONAL HOUR LOG',B-118,34,8,bold,gray);}
 rule(116);y=132;
 if(first){
 const fields=[[show('employer')?'PREPARED FOR':'',show('employer')?value(s.employer):''],['EMPLOYEE',value(s.name)],[show('legal')?'LEGAL ENTITY / ABN':'',show('legal')?join([s.legal,s.abn],' / '):''],[show('employee')?'EMPLOYEE / CONTRACTOR NO.':'',show('employee')?value(s.employee):'']];
 for(let r=0;r<2;r++){let height=0;for(let c=0;c<2;c++){const [label,value]=fields[r*2+c],x=M+c*(content/2+8),lines=wrap(value,content/2-20,10,bold);text(label,x,y,7.5,bold,gray);lines.forEach((v,i)=>text(v,x,y+16+i*13,10,bold));height=Math.max(height,31+lines.length*13);}y+=height;}
 rect(M,y,content,51,pale);[['PERIOD',format(week)+' - '+format(sun)],[show('schedule')?'SUBMISSION':'',show('schedule')?format(parseDate(submissionSchedule(state,week).date)):''],[show('schedule')?'PAYMENT':'',show('schedule')?format(add(week,9)):'']].forEach(([label,value],i)=>{let x=M+12+[0,218,360][i];text(label,x,y+10,7,bold,gray);text(value,x,y+27,9,bold);});y+=70;
 }else{text(value(s.name),M,y,10,bold);text('Continued',B-49,y,9,regular,gray);y+=26;}
 headers();};
 newPage(true);
 const ensure=h=>{if(y+h>H-75)newPage();};
 for(let i=0;i<7;i++){
 const d=add(week,i),list=dayEntries(i),date=d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
 const entries=list.length?list:[null];
 for(let j=0;j<entries.length;j++){
 const e=entries[j],description=e?[e.kind==='summary'?'Daily summary':null,show('sites')?value(e.site):null,show('slotNotes')?value(e.notes):null].filter(Boolean).join('\n'):'';
 const lines=wrap(description,content-270,9),chunks=[];for(let k=0;k<lines.length;k+=27)chunks.push(lines.slice(k,k+27));
 for(let k=0;k<chunks.length;k++){
 const chunk=chunks[k],height=Math.max(28,chunk.length*12+12);ensure(height);
 if(i%2===0)rect(M,y,content,height,rgb(.976,.983,.989));
 text(k?'(continued)':j?'':date,M+9,y+11,9,j?regular:bold);
 if(!k){if(show('times')){text(e?.kind==='summary'?'':value(e?.start),M+100,y+11);text(e?.kind==='summary'?'':value(e?.finish),M+153,y+11);}text(e?hours(e).toFixed(2)+(e.kind!=='summary'&&e.manual!==''&&e.manual!=null?'*':''):'',M+207,y+11,9,bold);}
 chunk.forEach((v,n)=>text(v,M+258,y+10+n*12,9,regular,gray));y+=height;rule(y);
 }
 }
 if(list.length>1){ensure(24);text('Daily total',M+100,y+6,8,bold,gray);text(dailyTotal(list).toFixed(2)+' hrs',M+207,y+6,9,bold,blue);y+=24;rule(y);}
 const note=state.dayNotes?.[iso(d)];if(show('dayNotes')&&note&&state.dayNotesIncluded?.[iso(d)]){const lines=wrap('Day notes: '+note,content-24,9);for(let n=0;n<lines.length;n+=25){const chunk=lines.slice(n,n+25),h=chunk.length*12+18;ensure(h);rect(M,y,content,h,pale);chunk.forEach((v,k)=>text(v,M+12,y+9+k*12,9,regular,gray));y+=h;rule(y);}}
 }
 ensure(136);y+=16;rect(M,y,content,51,blue);text('TOTAL HOURS',M+15,y+17,10,bold,white);const total=dailyTotal(all).toFixed(2)+' hrs';text(total,B-bold.widthOfTextAtSize(total,23)-15,y+11,23,bold,white);y+=65;
 if(all.some(e=>e.kind!=='summary'&&e.manual!==''&&e.manual!=null)){text('* Manually adjusted hours.',M,y,8,regular,gray);y+=15;}
 if(show('signature')){text('Employee approval / signature',M,y+12,8,regular,gray);text('Date',B-110,y+12,8,regular,gray);y+=46;rule(y);}
 const pages=doc.getPages();pages.forEach((p,i)=>{page=p;rule(H-49);text('WEEK ENDING '+format(sun).toUpperCase(),M,H-35,7,regular,gray);text('Page '+(i+1)+' of '+pages.length,B-59,H-35,7,regular,gray);});
 doc.setTitle('Timesheet - '+(s.name||'Gradcon')+' - '+iso(sun));doc.setAuthor(s.name||s.employer);doc.setSubject('Weekly hours for '+s.employer);
 return {bytes:await doc.save(),filename:'Timesheet-'+(s.name||'Gradcon').replace(/[^a-z0-9]+/gi,'-')+'-WE-'+iso(sun)+'.pdf'};
}
