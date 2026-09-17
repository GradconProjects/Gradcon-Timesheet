create table public.timesheet_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 employee_name text not null default '', employee_number text not null default '',
 employer jsonb not null default '{"name":"Gradcon Concrete Constructions","legal":"GRADCON PTY LTD","abn":"35 161 870 328"}'::jsonb,
 sender_email text not null default 'projects@gradcon.com.au',
 accounts_email text not null default 'accounts@gradcon.com.au',
 backup_email text not null default 'fyne.boma@gmail.com',
 timezone text not null default 'Australia/Melbourne',
 auto_send_enabled boolean not null default false,
 send_time time,
 updated_at timestamptz not null default now()
);
create table public.timesheet_weeks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 week_start date not null check(extract(isodow from week_start)=1),
 status text not null default 'draft' check(status in ('draft','ready','submitted','held')),
 revision integer not null default 1 check(revision>0),
 version bigint not null default 1 check(version>0),
 notes text not null default '',
 updated_at timestamptz not null default now(),
 unique(user_id,week_start), unique(id,user_id)
);
create table public.timesheet_days (
 id uuid primary key default gen_random_uuid(),
 week_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 work_date date not null,
 entry_mode text not null default 'split' check(entry_mode in ('split','summary')),
 summary_hours numeric(6,3) check(summary_hours between 0 and 24),
 site text not null default '', notes text not null default '',
 foreign key(week_id,user_id) references public.timesheet_weeks(id,user_id) on delete cascade,
 unique(user_id,work_date),unique(id,user_id),
 check((entry_mode='summary' and summary_hours is not null) or (entry_mode='split' and summary_hours is null))
);
create table public.timesheet_slots (
 id uuid primary key default gen_random_uuid(),
 day_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 start_time time not null,finish_time time not null,
 hours_override numeric(6,3) check(hours_override between 0 and 24),
 site text not null default '',notes text not null default '',
 foreign key(day_id,user_id) references public.timesheet_days(id,user_id) on delete cascade,
 check(start_time<>finish_time or hours_override is not null)
);
create index timesheet_days_week_idx on public.timesheet_days(week_id,user_id);
create index timesheet_slots_owner_day_idx on public.timesheet_slots(user_id,day_id);
create table public.timesheet_submissions (
 id uuid primary key default gen_random_uuid(),
 week_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null check(revision>0),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain')),
 pdf_path text, gmail_message_id text,
 sender_email text not null,recipient_email text not null,backup_email text not null,
 submitted_at timestamptz,error_message text,
 created_at timestamptz not null default now(),
 foreign key(week_id,user_id) references public.timesheet_weeks(id,user_id) on delete cascade,
 unique(week_id,revision)
);
create index timesheet_submissions_owner_idx on public.timesheet_submissions(user_id,created_at);
alter table public.timesheet_profiles enable row level security;
alter table public.timesheet_weeks enable row level security;
alter table public.timesheet_days enable row level security;
alter table public.timesheet_slots enable row level security;
alter table public.timesheet_submissions enable row level security;
revoke all on public.timesheet_profiles,public.timesheet_weeks,public.timesheet_days,public.timesheet_slots,public.timesheet_submissions from anon;
grant select,insert,update,delete on public.timesheet_profiles,public.timesheet_weeks,public.timesheet_days,public.timesheet_slots to authenticated;
revoke all on public.timesheet_submissions from authenticated;
grant select on public.timesheet_submissions to authenticated;
grant all on public.timesheet_profiles,public.timesheet_weeks,public.timesheet_days,public.timesheet_slots,public.timesheet_submissions to service_role;
create policy timesheet_profiles_owner on public.timesheet_profiles for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy timesheet_weeks_owner on public.timesheet_weeks for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy timesheet_days_owner on public.timesheet_days for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy timesheet_slots_owner on public.timesheet_slots for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy timesheet_submissions_owner_read on public.timesheet_submissions for select to authenticated using((select auth.uid())=user_id);

create function public.timesheet_validate_day() returns trigger language plpgsql security invoker set search_path='' as $$
declare start_date date;
begin
 select week_start into start_date from public.timesheet_weeks where id=new.week_id and user_id=new.user_id;
 if start_date is null or new.work_date<start_date or new.work_date>start_date+6 then raise exception 'Day is outside its timesheet week'; end if;
 if new.entry_mode='summary' and exists(select 1 from public.timesheet_slots where day_id=new.id) then raise exception 'Remove split slots before switching to summary'; end if;
 return new;
end $$;
create trigger timesheet_day_validate before insert or update on public.timesheet_days for each row execute function public.timesheet_validate_day();
create function public.timesheet_validate_slot() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.timesheet_days where id=new.day_id and user_id=new.user_id and entry_mode='split') then raise exception 'Slots require a split-hours day'; end if;
 return new;
end $$;
create trigger timesheet_slot_validate before insert or update on public.timesheet_slots for each row execute function public.timesheet_validate_slot();
revoke execute on function public.timesheet_validate_day(),public.timesheet_validate_slot() from public,anon,authenticated;
