# Gradcon Timesheet

Personal Monday–Sunday timesheets with split slots or daily summaries, editable details, and polished PDF export. The export is always a single A4 page: the week is measured before it is drawn, the page compacts and the type shrinks to fit, long descriptions are trimmed only if that is not enough, and a week too busy for one page says on the page how many rows are not shown — the total always counts every slot. There are no break deductions or Xero integrations.

## Run

Serve `dist/` using a static HTTP server. Run checks with Node 22 or newer using `npm test`. No package installation is required.

## Deploy

Import this repository in Vercel, select framework **Other**, and use output directory `dist`. The repository includes `vercel.json`. Connect the repository through Vercel's GitHub integration for automatic deployments when changes are pushed.

## Current status

The app saves entries in browser storage. PDF export, preview and printing work. **Send to accounts** emails the PDF in one click once the send service is deployed and connected — see `SENDING.md`. Until then the button points you at Settings and "Email by hand" opens a pre-filled Gmail draft for you to attach the downloaded PDF yourself. Cloud sign-in, device sync and scheduled unattended sending are still not implemented.

## Saving a week

Entries save the moment you press **Save hours** in the slot editor — there is no unsaved state to lose. The ledger footer says so in words (“Saved 3 minutes ago”), and **Save this week** stamps the week again and pushes it to your other devices when a workspace is connected. **History → Saved weeks** lists every week that has hours, with its total, when it was saved and whether it was submitted or emailed; open any of them, or export its PDF straight from the list.

## Your signature

Settings takes a PNG or JPEG of your signature (up to 1 MB) alongside the company logo. It prints on the approval line of the PDF with the date beside it, and **Delete signature** removes it so the line prints blank to sign by hand. Switching the approval line off in PDF appearance hides both. The signature is stored with the employer profile, so it travels with sync and backups.

## Sync across devices

Settings → **Sync across devices** holds a workspace code. Create one on the device that already has your hours, then paste the same code into Settings on your phone or laptop: every device holding it keeps the same timesheet. Each device pulls what the workspace has, merges it without overwriting anything entered locally, and pushes the union back — so entries made on two devices both survive, and a slot deleted on one is deleted on the other rather than reappearing. Syncing runs after every save, when the tab comes back to the foreground, and when the network returns; the week bar shows the state.

The code is the only credential and it is a random UUID, so treat it like a password: anyone holding it can read and write that timesheet. Nothing else can — `database/sync.sql` keeps the table closed to the browser key and exposes only two functions that touch the single row whose id was supplied, so a workspace cannot be listed or discovered. A device that has not been given the code syncs nothing and keeps working exactly as before.

**Before sync works, `database/sync.sql` must be applied once** in the Supabase SQL editor of project `yflwwzmyakmwvslmirzx`. Until then a workspace code simply reports “Not synced” and hours stay local.

## Keeping hours safe

Without sync, hours live in this browser, per employer. A new week opens empty every Monday, so when the week on screen has none, the week bar points at the nearest week that does: “← Week ending 20 Sept has 23.50 hours”. **Prefill from last week** copies that week’s slots into the open one, sites and notes included, ready to edit. **Recover hours** lists everything still stored on the device — other employer profiles, submitted snapshots, the previous storage key and the automatic backups taken before every save — and restores any of it into the employer in view.

**Save backup file** writes every employer, entry, note and snapshot to a JSON file. **Restore from file** merges one back in on any browser or device: it only fills gaps, so a slot edited here keeps the edit and restoring twice changes nothing. That file is the only copy that survives cleared site data or a lost device — cloud sync is still not implemented.

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
