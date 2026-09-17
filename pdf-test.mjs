import {createRequire} from 'node:module';
import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createTimesheetPdf} from './dist/pdf.mjs';
import {migrate} from './dist/core.mjs';
const require=createRequire(import.meta.url),api=require('./dist/pdf-lib.min.js');
const state=migrate({settings:{name:'Boma Ipalibo',employee:'Projects'},entries:{
 '2026-09-14':[{start:'07:00',finish:'11:00',manual:'',site:'Rosebud',notes:'Project coordination and site inspection'},{start:'12:00',finish:'16:00',manual:'',site:'Sorrento',notes:'Concrete works and documentation'}],
 '2026-09-15':[{kind:'summary',start:'',finish:'',manual:'8',site:'Rosebud',notes:'Daily site work summary'}],
 '2026-09-16':[{start:'07:30',finish:'16:00',manual:'',site:'Sorrento',notes:'Site supervision'}]
 }});
const result=await createTimesheetPdf(state,new Date('2026-09-14T12:00:00'),api);
fs.mkdirSync('test-output',{recursive:true});
fs.writeFileSync('test-output/pdf-review.pdf',result.bytes);
let doc=await api.PDFDocument.load(result.bytes);assert.equal(doc.getPageCount(),1);
state.entries['2026-09-17']=[{kind:'summary',manual:8,site:'Long site title',notes:'Detailed work notes '.repeat(450)}];
doc=await api.PDFDocument.load((await createTimesheetPdf(state,new Date('2026-09-14T12:00:00'),api)).bytes);
assert.ok(doc.getPageCount()>1);
console.log('PDF: single-page weekly log and long-note pagination passed.');

// Missing details must print as blank space, never as placeholder wording.
const pdfStrings=bytes=>{
 const buf=Buffer.from(bytes);let content='',i=0;
 while((i=buf.indexOf('stream',i))!==-1){
  let start=i+6;if(buf[start]===13)start++;if(buf[start]===10)start++;
  const end=buf.indexOf('endstream',start);if(end===-1)break;
  try{content+=zlib.inflateSync(buf.subarray(start,end)).toString('latin1');}catch{}
  i=end+9;
 }
 return [...content.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1'));
};
const sparse=migrate({settings:{name:'',employee:'',legal:'',abn:'  '},entries:{'2026-09-14':[{start:'07:00',finish:'15:00',manual:'',site:'  ',notes:''}]}});
const drawn=pdfStrings((await createTimesheetPdf(sparse,new Date('2026-09-14T12:00:00'),api)).bytes);
for(const placeholder of ['Not provided','Not entered','No hours recorded','Employee not entered'])
 assert.ok(!drawn.some(t=>t.includes(placeholder)),'PDF still prints placeholder: '+placeholder);
assert.ok(drawn.includes('EMPLOYEE'),'field labels are kept so blanks can be filled in by hand');
assert.ok(!drawn.some(t=>t.trim()==='-'),'missing times and hours are left blank, not dashed');
assert.ok(drawn.includes('Tue, 15 Sept'),'days without hours still get a row');
console.log('PDF: missing details are left blank.');

// The employer logo prints large: it fills the header box instead of a 32pt strip.
const dot='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const branded=migrate({settings:{name:'Boma Ipalibo',logo:dot},entries:{'2026-09-14':[{start:'07:00',finish:'15:00',manual:'',site:'Rosebud',notes:'Site works'}]}});
const branded_pdf=await createTimesheetPdf(branded,new Date('2026-09-14T12:00:00'),api);
const streams=(()=>{const buf=Buffer.from(branded_pdf.bytes);let out='',i=0;
 while((i=buf.indexOf('stream',i))!==-1){let start=i+6;if(buf[start]===13)start++;if(buf[start]===10)start++;
  const end=buf.indexOf('endstream',start);if(end===-1)break;
  try{out+=zlib.inflateSync(buf.subarray(start,end)).toString('latin1');}catch{}i=end+9;}
 return out;})();
const drawnLogo=/([\d.]+) 0 0 ([\d.]+) 0 0 cm\s*\n1 0 0 1 0 0 cm\s*\n\/Image/.exec(streams);
assert.ok(drawnLogo,'the logo is drawn on the page');
assert.equal(Number(drawnLogo[2]),86,'a square logo prints at the full header height');
assert.ok(Number(drawnLogo[1])>=86,'the logo keeps its aspect ratio at the larger size');
assert.equal((await api.PDFDocument.load(branded_pdf.bytes)).getPageCount(),1,'the larger logo does not push a normal week onto a second page');
console.log('PDF: employer logo prints at the large header size.');
