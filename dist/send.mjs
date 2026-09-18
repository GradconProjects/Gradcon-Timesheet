import {iso,add,dailyTotal} from './core.mjs';

export const sendConfigured=settings=>!!(String(settings?.sendEndpoint||'').trim()&&String(settings?.sendToken||'').trim());
export const addressList=value=>String(value??'').split(/[,;\s]+/).map(v=>v.trim()).filter(Boolean);

export function bytesToBase64(bytes){
 let binary='';const chunk=0x8000;
 for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
 return btoa(binary);
}

// Everything the server needs to email one week, built from the state the app already holds.
export function sendPayload({settings,week,file,entries,force=false,format}){
 const sunday=add(week,6),pretty=format||(d=>d.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}));
 const total=dailyTotal(entries||[]).toFixed(2),name=String(settings.name||'').trim();
 return {
  token:String(settings.sendToken||'').trim(),
  week:iso(week),
  filename:file.filename,
  pdf:bytesToBase64(file.bytes),
  to:addressList(settings.recipient),
  bcc:addressList(settings.bcc),
  subject:'Timesheet - '+(name||settings.employer||'Gradcon')+' - week ending '+pretty(sunday),
  body:'Hi Accounts,\n\nPlease find attached my timesheet for '+pretty(week)+' to '+pretty(sunday)+'.\n\n'+
   'Total hours: '+total+'\nSubmission date: '+pretty(add(week,8))+'\nPayment date: '+pretty(add(week,9))+
   '\n\nKind regards,\n'+(name||settings.employer||''),
  hours:Number(total),
  employer:String(settings.employer||''),
  force:!!force,
 };
}

// One network call. Never throws: the caller gets a result it can show as-is.
export async function deliver(endpoint,payload,fetchImpl){
 const request=fetchImpl||(typeof fetch==='function'?fetch:null);
 if(!request)return {ok:false,error:'This browser cannot send. Download the PDF and email it instead.'};
 let response;
 try{
  response=await request(String(endpoint).trim(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 }catch{
  return {ok:false,error:'The send service could not be reached. Check your connection, then try again — nothing has been sent.'};
 }
 let result={};
 try{result=await response.json();}catch{}
 if(response.status===409)return {ok:false,alreadySent:true,sentAt:result.sentAt||'',messageId:result.messageId||'',error:result.error||'This week was already sent to accounts.'};
 if(!response.ok)return {ok:false,status:response.status,error:result.error||('The send service replied '+response.status+'. Nothing has been sent.')};
 return {ok:true,messageId:result.messageId||'',pdfPath:result.pdfPath||'',archived:!!result.archived,warning:result.warning||'',sender:result.sender||'',recipients:result.recipients??null};
}
