# Gradcon timesheet migration

## Target

- Supabase project: Timesheet (yflwwzmyakmwvslmirzx)
- API: https://yflwwzmyakmwvslmirzx.supabase.co
- Region: Sydney

## Applied

The SQL in database/timesheets.sql and database/pdf-storage.sql has been applied to this project. Five timesheet tables have row-level security and user ownership policies. Submission records are read-only to signed-in clients. The timesheet-pdfs bucket is private, limits uploads to 10 MB PDFs, and requires paths beginning with the signed-in user's UUID.

The public browser configuration is in dist/supabase-config.mjs. It is not yet imported by the application.

## Remaining before launch

- Connect sign-in and cloud storage to the existing local-first UI, with conflict protection and explicit import of existing local entries.
- Connect an accessible GitHub repository and deploy to Vercel.
- Configure Google OAuth for sending from projects@gradcon.com.au. ChatGPT Gmail credentials cannot be transferred to the application. Steps are in SENDING.md; the function reads GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN as project secrets.
- On-demand send is built: supabase/functions/send-timesheet emails one week's PDF, archives it in timesheet-pdfs, logs it in timesheet_sends (database/send-log.sql) and refuses a repeat send for the same week. It is not deployed to this project yet, and the Supabase connector available to Claude cannot reach yflwwzmyakmwvslmirzx.
- Scheduled generation and unattended sending remain outstanding: they need server scheduling plus the cross-device sync below, since a browser-held token cannot fire on a schedule.
- Requested schedule is Tuesday 23:00 Australia/Melbourne, editable per employer with per-week date overrides. Use a 30-hour Monday–Friday fallback only for weeks with no entries. Implement server scheduling before enabling automatic sends.

The website still saves locally. One-click send is implemented in the client and the function, and becomes live as soon as the function is deployed and connected in Settings. Cross-device sync and scheduled sending are not live.

Five empty timesheet tables were previously added to xbmyhvrcuyapoarmchpv before the user supplied the new project. They have not been removed. Estimator tables were not changed.


The local UI now supports multiple employer profiles, configurable PDFs, logo uploads, private daily notes, historical submission snapshots, and scheduling preferences. The existing remote schema must be extended to persist these features; no such backend migration has been applied yet.
