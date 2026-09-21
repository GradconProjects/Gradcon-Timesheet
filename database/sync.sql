-- Cross-device sync for the timesheet.
--
-- One row per workspace. The workspace id is a random UUID that the app
-- generates and you paste into each device; it is the only credential, so treat
-- it like a password — anyone holding it can read and write that timesheet.
-- Nothing else can: the table itself is closed to the browser key, and the two
-- functions below only ever touch the single row whose id was supplied, so a
-- workspace cannot be discovered or listed.
--
-- Apply once, in the Supabase SQL editor of project yflwwzmyakmwvslmirzx.

create table if not exists public.timesheet_spaces (
 space_id uuid primary key,
 payload jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);

alter table public.timesheet_spaces enable row level security;
revoke all on public.timesheet_spaces from anon, authenticated;
grant all on public.timesheet_spaces to service_role;

-- Read one workspace.
create or replace function public.timesheet_pull(space uuid)
returns jsonb language sql security definer set search_path='' stable as $$
 select coalesce(
  (select jsonb_build_object('payload',payload,'revision',revision,'updatedAt',updated_at)
   from public.timesheet_spaces where space_id=space),
  jsonb_build_object('payload',null,'revision',0));
$$;

-- Write one workspace. `since` is the revision the device last saw: if the
-- workspace moved on in the meantime the write is refused and the caller is
-- handed the newer copy to merge, so two devices cannot overwrite each other.
create or replace function public.timesheet_push(space uuid, body jsonb, since bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision bigint; stored jsonb; written_at timestamptz;
begin
 if body is null or jsonb_typeof(body)<>'object' then raise exception 'A timesheet payload is required'; end if;
 if pg_column_size(body) > 4*1024*1024 then raise exception 'This timesheet is too large to sync'; end if;

 select revision, payload into current_revision, stored from public.timesheet_spaces where space_id=space for update;

 if current_revision is not null and since is not null and since < current_revision then
  return jsonb_build_object('conflict',true,'payload',stored,'revision',current_revision);
 end if;

 insert into public.timesheet_spaces as t (space_id,payload) values (space,body)
 on conflict (space_id) do update set payload=excluded.payload, revision=t.revision+1, updated_at=now()
 returning revision, updated_at into current_revision, written_at;

 return jsonb_build_object('conflict',false,'revision',current_revision,'updatedAt',written_at);
end $$;

revoke all on function public.timesheet_pull(uuid) from public;
revoke all on function public.timesheet_push(uuid,jsonb,bigint) from public;
grant execute on function public.timesheet_pull(uuid) to anon, authenticated;
grant execute on function public.timesheet_push(uuid,jsonb,bigint) to anon, authenticated;
