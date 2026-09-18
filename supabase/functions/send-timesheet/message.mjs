// Pure helpers for the send-timesheet function. Imported by index.ts (Deno) and
// covered by send-test.mjs (Node), so the header and attachment rules are tested.

export const list=value=>String(value??'').split(/[,\s]+/).map(v=>v.trim().toLowerCase()).filter(Boolean);

// Constant-time comparison so a wrong token cannot be guessed byte by byte.
export function sameSecret(a,b){
 a=String(a??'');b=String(b??'');
 if(!a||!b||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}

// A newline in a header would let a caller add their own headers or recipients.
export const header=value=>String(value??'').replace(/[\r\n]+/g,' ').trim();

export const base64=bytes=>{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);};

export const encodeHeader=value=>{
 const clean=header(value);
 return /^[\x20-\x7E]*$/.test(clean)?clean:'=?UTF-8?B?'+base64(new TextEncoder().encode(clean))+'?=';
};

export const wrap=value=>value.replace(/.{1,76}/g,'$&\r\n');

export const addresses=value=>(Array.isArray(value)?value:String(value??'').split(','))
 .map(v=>header(v)).filter(Boolean);

export function mime({from,to,bcc=[],subject,body,filename,pdf},boundaryId='gradcon'){
 const boundary=boundaryId;
 return [
  'From: '+header(from),
  'To: '+addresses(to).join(', '),
  ...(addresses(bcc).length?['Bcc: '+addresses(bcc).join(', ')]:[]),
  'Subject: '+encodeHeader(subject),
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="'+boundary+'"',
  '',
  '--'+boundary,
  'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: base64',
  '',
  wrap(base64(new TextEncoder().encode(String(body??'')))),
  '--'+boundary,
  'Content-Type: application/pdf; name="'+header(filename)+'"',
  'Content-Disposition: attachment; filename="'+header(filename)+'"',
  'Content-Transfer-Encoding: base64',
  '',
  wrap(String(pdf??'')),
  '--'+boundary+'--',
  '',
 ].join('\r\n');
}

export const base64url=value=>btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const safeFilename=value=>String(value??'').replace(/[^A-Za-z0-9._-]/g,'-').slice(0,120);
export const looksLikePdf=bytes=>bytes.length>4&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
