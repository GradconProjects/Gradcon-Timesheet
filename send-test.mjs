import assert from 'node:assert/strict';
import {sameSecret,header,encodeHeader,mime,addresses,safeFilename,looksLikePdf,list} from './supabase/functions/send-timesheet/message.mjs';
import {sendConfigured,addressList,sendPayload,deliver,bytesToBase64} from './dist/send.mjs';
import {parseDate} from './dist/core.mjs';

// The token check gives nothing away and only matches the real secret.
assert.equal(sameSecret('abc123','abc123'),true);
assert.equal(sameSecret('abc123','abc124'),false);
assert.equal(sameSecret('abc','abc123'),false);
assert.equal(sameSecret('',''),false,'an unset secret never matches');

// A caller cannot smuggle extra headers or recipients through the subject or a name.
assert.equal(header('Timesheet\r\nBcc: sneak@example.com'),'Timesheet Bcc: sneak@example.com');
assert.deepEqual(addresses(['a@example.com\r\nBcc: b@example.com']),['a@example.com Bcc: b@example.com']);
assert.equal(encodeHeader('Timesheet – Boma').startsWith('=?UTF-8?B?'),true,'non-ASCII subjects are encoded');
assert.equal(encodeHeader('Timesheet - Boma'),'Timesheet - Boma');
assert.equal(safeFilename('../../etc/passwd.pdf'),'..-..-etc-passwd.pdf','no slash survives, so an upload cannot escape its folder');
assert.ok(!safeFilename('a/b\\c.pdf').includes('/')&&!safeFilename('a/b\\c.pdf').includes('\\'));
assert.equal(looksLikePdf(new TextEncoder().encode('%PDF-1.7 ...')),true);
assert.equal(looksLikePdf(new TextEncoder().encode('<html>')),false);
assert.deepEqual(list('A@x.com, b@y.com  c@z.com'),['a@x.com','b@y.com','c@z.com']);

const message=mime({from:'projects@gradcon.com.au',to:['accounts@gradcon.com.au'],bcc:['fyne.boma@gmail.com'],
 subject:'Timesheet\nInjected: yes',body:'Hi Accounts,',filename:'Timesheet.pdf',pdf:'JVBERi0='},'BOUNDARY');
assert.ok(message.includes('\r\nSubject: Timesheet Injected: yes\r\n'),'the newline is neutralised');
assert.equal(message.split('\r\n').filter(l=>l.startsWith('Bcc: ')).length,1);
assert.ok(message.includes('Content-Disposition: attachment; filename="Timesheet.pdf"'));
assert.ok(message.includes('Content-Type: multipart/mixed; boundary="BOUNDARY"'));
assert.ok(message.trimEnd().endsWith('--BOUNDARY--'));
assert.ok(message.includes('JVBERi0='),'the PDF rides along as base64');

// The browser payload carries every address and the built PDF.
assert.equal(sendConfigured({sendEndpoint:'https://x/f',sendToken:'t'}),true);
assert.equal(sendConfigured({sendEndpoint:'https://x/f',sendToken:'  '}),false);
assert.equal(sendConfigured({}),false);
assert.deepEqual(addressList('a@x.com, b@y.com; c@z.com'),['a@x.com','b@y.com','c@z.com']);
globalThis.btoa??=value=>Buffer.from(value,'binary').toString('base64');
const file={filename:'Timesheet-Boma-WE-2026-09-20.pdf',bytes:new TextEncoder().encode('%PDF-1.7 test')};
const payload=sendPayload({settings:{name:'Boma Ipalibo',employer:'Gradcon Concrete Constructions',sendToken:'secret',
 recipient:'accounts@gradcon.com.au',bcc:'fyne.boma@gmail.com'},week:parseDate('2026-09-14'),file,
 entries:[{start:'07:00',finish:'15:00',manual:''},{kind:'summary',manual:'8'}]});
assert.equal(payload.week,'2026-09-14');
assert.equal(payload.token,'secret');
assert.deepEqual(payload.to,['accounts@gradcon.com.au']);
assert.deepEqual(payload.bcc,['fyne.boma@gmail.com']);
assert.equal(payload.hours,16);
assert.ok(payload.subject.includes('week ending 20 September 2026'));
assert.ok(payload.body.includes('Total hours: 16.00'));
assert.equal(Buffer.from(payload.pdf,'base64').toString(),'%PDF-1.7 test');
assert.equal(bytesToBase64(new Uint8Array([37,80,68,70])),'JVBERg==');

// Every reply the service can give is turned into something the app can show.
const reply=(status,body)=>async()=>({ok:status<400,status,json:async()=>body});
assert.deepEqual(await deliver('https://x/f',payload,reply(200,{messageId:'m1',archived:true,pdfPath:'2026-09-14/x.pdf'})),
 {ok:true,messageId:'m1',pdfPath:'2026-09-14/x.pdf',archived:true,warning:'',sender:'',recipients:null});
const duplicate=await deliver('https://x/f',payload,reply(409,{error:'This week was already sent to accounts.',sentAt:'2026-09-22T13:00:00Z'}));
assert.equal(duplicate.alreadySent,true);assert.equal(duplicate.ok,false);assert.equal(duplicate.sentAt,'2026-09-22T13:00:00Z');
const refused=await deliver('https://x/f',payload,reply(401,{error:'This timesheet app is not authorised to send.'}));
assert.equal(refused.ok,false);assert.equal(refused.status,401);assert.ok(refused.error.includes('not authorised'));
const offline=await deliver('https://x/f',payload,async()=>{throw Error('network down');});
assert.equal(offline.ok,false);assert.ok(offline.error.includes('nothing has been sent'));
const garbled=await deliver('https://x/f',payload,async()=>({ok:false,status:502,json:async()=>{throw Error('not json');}}));
assert.equal(garbled.ok,false);assert.ok(garbled.error.includes('502'));
console.log('PASS: send token comparison, header injection, PDF attachment, payload build and every service reply.');
