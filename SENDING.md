# One-click send to accounts

The app builds the weekly PDF in the browser and posts it to a Supabase Edge
Function, which emails it from the Gradcon Gmail account and files a copy in the
private `timesheet-pdfs` bucket. The browser never holds a Google credential.

```
browser  --POST {token, week, pdf, to, bcc}-->  send-timesheet  --Gmail API-->  accounts@gradcon.com.au
                                                      |
                                                      +--> timesheet-pdfs bucket + timesheet_sends log
```

Everything below is a one-time setup. Until it is done, the app keeps working
exactly as before: "Email by hand" opens a pre-filled Gmail draft for you to
attach the downloaded PDF yourself.

## 1. Authorise the Gmail account

Do this signed in as the account that should appear in the From line
(`projects@gradcon.com.au`).

1. In the [Google Cloud console](https://console.cloud.google.com/), create or
   select a project, then enable the **Gmail API**
   (APIs & Services → Library → Gmail API → Enable).
2. APIs & Services → **OAuth consent screen**:
   - If `gradcon.com.au` is a Google Workspace domain, choose **Internal**.
   - Otherwise choose **External**, add the sending address as a test user, and
     then **Publish** the app. An External app left in *Testing* expires its
     refresh token after 7 days, which would break sending each week.
   - Add the single scope `https://www.googleapis.com/auth/gmail.send`.
3. APIs & Services → Credentials → **Create credentials → OAuth client ID →
   Desktop app**. Keep the client ID and client secret.
4. Get a refresh token. Open this URL in a browser, replacing `CLIENT_ID`, and
   sign in as the sending account:

   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/gmail.send&access_type=offline&prompt=consent
   ```

   After you approve, the browser fails to load `http://localhost` — that is
   expected. Copy the `code=` value out of the address bar and exchange it:

   ```sh
   curl -s https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
     -d code=PASTED_CODE -d redirect_uri=http://localhost \
     -d grant_type=authorization_code
   ```

   Keep the `refresh_token` from the reply. It is shown once.

## 2. Prepare the database and secrets

```sh
# the send log, alongside the tables already applied
psql "$SUPABASE_DB_URL" -f database/send-log.sql

supabase secrets set --project-ref yflwwzmyakmwvslmirzx \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REFRESH_TOKEN=... \
  GMAIL_SENDER="Gradcon Projects <projects@gradcon.com.au>" \
  SEND_TOKEN="$(openssl rand -hex 32)" \
  ALLOWED_RECIPIENTS="accounts@gradcon.com.au,fyne.boma@gmail.com" \
  ALLOWED_ORIGINS="https://your-app.vercel.app"
```

- **SEND_TOKEN** is what the browser presents. Keep the value you generated.
- **ALLOWED_RECIPIENTS** is the safety net: the function refuses to email anyone
  not on this list, so a copied token cannot be used to send mail elsewhere.
- **ALLOWED_ORIGINS** is your deployed app's origin. Leave it unset only while
  testing locally.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.
  Never put the service-role key in the browser or this repository.

## 3. Deploy

```sh
supabase functions deploy send-timesheet --project-ref yflwwzmyakmwvslmirzx
```

`supabase/config.toml` sets `verify_jwt = false` for this function, because the
app has no sign-in yet; `SEND_TOKEN` and the recipient list are what protect it.

## 4. Connect the app

In the timesheet, open **Settings → Sending account** and fill in:

- **Send service address**
  `https://yflwwzmyakmwvslmirzx.supabase.co/functions/v1/send-timesheet`
- **Send token** — the `SEND_TOKEN` value from step 2.

Press **Check the connection**. It should report the sending mailbox and how many
approved addresses the service holds. Save, and **Send to accounts** on the
timesheet card is then one click: build PDF → email → archive → mark the week
submitted with a snapshot.

The sender, accounts address and BCC shown on the email come from Settings
(`projects@gradcon.com.au`, `accounts@gradcon.com.au`,
`fyne.boma@gmail.com`), and every address must also appear in
`ALLOWED_RECIPIENTS` or the service will refuse the send.

## What the service does with each send

- Refuses the request unless the token matches exactly (constant-time compare).
- Refuses any recipient outside `ALLOWED_RECIPIENTS`.
- Strips newlines from the subject, filename and addresses, so nothing can inject
  extra mail headers.
- Rejects an attachment that is not a PDF, or is over 8 MB.
- Returns **409** if that week was already sent; the app then offers to send again.
- Records every attempt in `timesheet_sends` with its status, Gmail message id and
  archived path, and uploads the PDF to `timesheet-pdfs/<week>/<timestamp>-<file>.pdf`.

## Known limits

- The send token lives in browser storage on your device. It can only mail the
  approved addresses, but treat it as a password: rotate `SEND_TOKEN` and
  re-enter it in Settings if a device is lost.
- Duplicate protection is per week across the whole project, not per employer,
  because there is no sign-in yet to tell profiles apart on the server.
- Scheduled, unattended sending is still not live. This is a button, not a cron
  job; `MIGRATION.md` covers what server scheduling would still need.
