-- Server-side record of every timesheet emailed to accounts.
-- The existing timesheet_submissions table hangs off auth.users and synced weeks;
-- the app has no sign-in yet, so sends are logged here by week instead.
-- Only the send-timesheet function (service role) can read or write this table.
create table public.timesheet_sends (
 id uuid primary key default gen_random_uuid(),
 week_start date not null check(extract(isodow from week_start)=1),
 filename text not null,
 pdf_path text,
 status text not null default 'sending' check(status in ('sending','sent','failed')),
 gmail_message_id text,
 sender_email text not null,
 recipients text[] not null default '{}',
 backup_recipients text[] not null default '{}',
 hours numeric(7,2),
 employer text not null default '',
 error_message text,
 created_at timestamptz not null default now()
);
create index timesheet_sends_week_idx on public.timesheet_sends(week_start,created_at desc);
alter table public.timesheet_sends enable row level security;
revoke all on public.timesheet_sends from anon,authenticated;
grant all on public.timesheet_sends to service_role;
