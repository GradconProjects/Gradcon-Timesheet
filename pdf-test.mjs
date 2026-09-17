import {createRequire} from 'node:module';
import fs from 'node:fs';
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
