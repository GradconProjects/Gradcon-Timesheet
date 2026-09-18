# Gradcon Timesheet

Personal Monday–Sunday timesheets with split slots or daily summaries, editable details, and polished PDF export. The export is always a single A4 page: the week is measured before it is drawn, the page compacts and the type shrinks to fit, long descriptions are trimmed only if that is not enough, and a week too busy for one page says on the page how many rows are not shown — the total always counts every slot. There are no break deductions or Xero integrations.

## Run

Serve `dist/` using a static HTTP server. Run checks with Node 22 or newer using `npm test`. No package installation is required.

## Deploy

Import this repository in Vercel, select framework **Other**, and use output directory `dist`. The repository includes `vercel.json`. Connect the repository through Vercel's GitHub integration for automatic deployments when changes are pushed.

## Current status

The app saves entries in browser storage. PDF export, preview and printing work. **Send to accounts** emails the PDF in one click once the send service is deployed and connected — see `SENDING.md`. Until then the button points you at Settings and "Email by hand" opens a pre-filled Gmail draft for you to attach the downloaded PDF yourself. Cloud sign-in, device sync and scheduled unattended sending are still not implemented.

## Send to accounts

One click builds the weekly PDF, posts it to the `send-timesheet` Supabase Edge Function, and that function emails it from `projects@gradcon.com.au` through the Gmail API, archives it in the private `timesheet-pdfs` bucket, and logs the send. The browser holds only its own send token; no Google credential and no service-role key ever reaches the page. Setup steps are in `SENDING.md`; the function is in `supabase/functions/send-timesheet/`.

Supabase project `yflwwzmyakmwvslmirzx` has the database and private PDF bucket prepared. See `MIGRATION.md` for remaining integration tasks. Never place service-role keys, Gmail credentials, or access tokens in this repository or browser code.


## Employer profiles and preferences

Add employers using the employer switcher. Each profile keeps its own entries, submission history, daily notes, logo, editable company tag, email defaults, and PDF visibility preferences. Upload the actual logo as PNG or JPEG (up to 1 MB); the app compresses it for local storage and uses it on PDFs. No company logo is fabricated or preloaded.

Daily notes are private by default. To include one, enable its individual checkbox and leave day notes enabled in Settings → PDF appearance. Settings also controls logo, employer name, legal details, employee number, dates, time columns, site names, slot notes and signature visibility. Themes and compact spacing are available.

History saves a snapshot when a week is marked submitted. Opening/revising a week preserves previous snapshots, which can be downloaded again. Older submissions without snapshots can still be opened. Status is user-recorded, not verified email delivery.

## Requested automation (not active)

The requested default is Tuesday 23:00 Australia/Melbourne, with editable weekday/time and an optional date override for the selected week. With no entries anywhere in that week, the preparation function creates five 6-hour daily summaries (30 hours). Partial weeks are preserved without filling missing days. Schedule and fallback logic is covered by tests, including daylight saving. These are preparation functions and saved preferences only: no scheduler or automatic mail sender is deployed.

Data currently remains in browser storage, including historical snapshots. A different device or deployment origin will not automatically inherit it. Production sync must incorporate employers, per-day notes and visibility, snapshots and schedules in its database model before automated sending is enabled.
