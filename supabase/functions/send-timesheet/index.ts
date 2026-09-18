// Sends one weekly timesheet PDF from the Gradcon Gmail account and archives it.
//
// Deploy:  supabase functions deploy send-timesheet --project-ref yflwwzmyakmwvslmirzx
// Secrets: GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN
//          GMAIL_SENDER SEND_TOKEN ALLOWED_RECIPIENTS ALLOWED_ORIGINS
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
//
// The browser never holds a Google credential. It presents SEND_TOKEN, and this
// function will only send to addresses named in ALLOWED_RECIPIENTS, so a leaked
// token cannot be used to mail anyone else.

import {
  list, sameSecret, header, addresses, mime, base64url, safeFilename, looksLikePdf,
} from './message.mjs';

const env = (key: string) => Deno.env.get(key) ?? '';
const BUCKET = 'timesheet-pdfs';
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const corsHeaders = (origin: string) => {
  const allowed = list(env('ALLOWED_ORIGINS'));
  const ok = allowed.length === 0 || allowed.includes(origin.toLowerCase());
  return {
    'Access-Control-Allow-Origin': ok && origin ? origin : allowed[0] ?? '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Vary': 'Origin',
  };
};

const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      'Google refused the saved authorisation (' + response.status + '). ' +
        'Re-authorise the Gmail account and update GOOGLE_REFRESH_TOKEN. ' +
        (payload.error_description || payload.error || ''),
    );
  }
  return payload.access_token as string;
}

const db = (path: string, init: RequestInit = {}) =>
  fetch(env('SUPABASE_URL') + path, {
    ...init,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'),
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, origin);

  let payload: Record<string, any>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400, origin);
  }

  if (!sameSecret(String(payload.token ?? ''), env('SEND_TOKEN'))) {
    return json({ error: 'This timesheet app is not authorised to send. Check the send token in Settings.' }, 401, origin);
  }

  if (payload.check) {
    return json({ ok: true, sender: env('GMAIL_SENDER'), recipients: list(env('ALLOWED_RECIPIENTS')).length }, 200, origin);
  }

  const week = String(payload.week ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return json({ error: 'A week starting date is required.' }, 400, origin);

  const filename = safeFilename(payload.filename);
  if (!filename.toLowerCase().endsWith('.pdf')) return json({ error: 'The attachment must be a PDF.' }, 400, origin);

  const pdf = String(payload.pdf ?? '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdf)) return json({ error: 'The PDF could not be read.' }, 400, origin);
  const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_PDF_BYTES) return json({ error: 'That PDF is too large to email.' }, 413, origin);
  if (!looksLikePdf(bytes)) return json({ error: 'That attachment is not a PDF.' }, 400, origin);

  const allowed = list(env('ALLOWED_RECIPIENTS'));
  const to = addresses(payload.to), bcc = addresses(payload.bcc);
  if (!to.length) return json({ error: 'No recipient was given.' }, 400, origin);
  const refused = [...to, ...bcc].filter((address) => !allowed.includes(address.toLowerCase()));
  if (refused.length) {
    return json({ error: 'These addresses are not on the approved list for this mailbox: ' + refused.join(', ') }, 403, origin);
  }

  const from = env('GMAIL_SENDER');
  if (!from) return json({ error: 'The sending mailbox is not configured.' }, 500, origin);

  // One timesheet per week goes out once, unless a resend is asked for explicitly.
  const existing = await db('/rest/v1/timesheet_sends?week_start=eq.' + week + '&status=eq.sent&order=created_at.desc&limit=1');
  const previous = existing.ok ? await existing.json().catch(() => []) : [];
  if (previous.length && !payload.force) {
    return json({
      alreadySent: true,
      sentAt: previous[0].created_at,
      messageId: previous[0].gmail_message_id,
      error: 'This week was already sent to accounts.',
    }, 409, origin);
  }

  const path = week + '/' + Date.now() + '-' + filename;
  const stored = await fetch(env('SUPABASE_URL') + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'),
      'content-type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  const archived = stored.ok;
  const archiveError = archived ? '' : 'Archive failed: ' + (await stored.text().catch(() => '')).slice(0, 300);

  const record = await db('/rest/v1/timesheet_sends', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify([{
      week_start: week, filename, pdf_path: archived ? path : null, status: 'sending',
      sender_email: from, recipients: to, backup_recipients: bcc,
      hours: payload.hours ?? null, employer: header(String(payload.employer ?? '')).slice(0, 200),
      error_message: archiveError || null,
    }]),
  });
  const row = record.ok ? (await record.json().catch(() => []))[0] : null;
  const finish = (fields: Record<string, unknown>) =>
    row?.id
      ? db('/rest/v1/timesheet_sends?id=eq.' + row.id, { method: 'PATCH', body: JSON.stringify(fields) }).catch(() => {})
      : Promise.resolve();

  try {
    const raw = base64url(mime(
      { from, to, bcc, subject: String(payload.subject ?? ''), body: String(payload.body ?? ''), filename, pdf },
      'gradcon-' + crypto.randomUUID(),
    ));
    const sent = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    const result = await sent.json().catch(() => ({}));
    if (!sent.ok) throw new Error(result?.error?.message || 'Gmail refused the message (' + sent.status + ').');
    await finish({ status: 'sent', gmail_message_id: result.id ?? null, error_message: archiveError || null });
    return json({
      sent: true, messageId: result.id ?? null, pdfPath: archived ? path : null,
      archived, warning: archiveError || undefined,
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: 'failed', error_message: message.slice(0, 500) });
    return json({ error: message }, 502, origin);
  }
});
