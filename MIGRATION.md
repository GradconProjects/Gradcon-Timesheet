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
- Configure Google OAuth for sending from projects@gradcon.com.au. ChatGPT Gmail credentials cannot be transferred to the application.
- Implement scheduled PDF generation, private archive, email to accounts@gradcon.com.au and BCC fyne.boma@gmail.com, with duplicate-send prevention and delivery status.
- Requested schedule is Tuesday 23:00 Australia/Melbourne, editable per employer with per-week date overrides. Use a 30-hour Monday–Friday fallback only for weeks with no entries. Implement server scheduling before enabling automatic sends.

Current website still saves locally and opens Gmail drafts. Neither cross-device sync nor automatic email is live.

Five empty timesheet tables were previously added to xbmyhvrcuyapoarmchpv before the user supplied the new project. They have not been removed. Estimator tables were not changed.


The local UI now supports multiple employer profiles, configurable PDFs, logo uploads, private daily notes, historical submission snapshots, and scheduling preferences. The existing remote schema must be extended to persist these features; no such backend migration has been applied yet.
