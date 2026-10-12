-- Additive setup, run once in Supabase SQL Editor. No existing records are migrated.
-- Existing email publication remains independent. Never expose this private schema.
begin;
create schema if not exists dayflow_groups_private;
revoke all on schema dayflow_groups_private from public, anon, authenticated;
grant usage on schema dayflow_groups_private to authenticated;
create table dayflow_groups_private.groups (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.dayflow_user_state(user_id) on delete cascade,
 name text not null check(length(name) between 1 and 40),
 code_hash text not null unique,
 created_at timestamptz not null default now()
);
create index dayflow_groups_owner on dayflow_groups_private.groups(owner_id);
create table dayflow_groups_private.members (
 group_id uuid not null references dayflow_groups_private.groups(id) on delete cascade,
 user_id uuid not null references public.dayflow_user_state(user_id) on delete cascade,
 nickname text not null check(length(nickname) between 1 and 30),
 joined_at timestamptz not null default now(), primary key(group_id,user_id)
);
create index dayflow_groups_member_user on dayflow_groups_private.members(user_id);
create table dayflow_groups_private.shares (
 group_id uuid not null, owner_id uuid not null,
 event_id text not null check(length(event_id) between 1 and 200),
 primary key(group_id,owner_id,event_id),
 foreign key(group_id,owner_id) references dayflow_groups_private.members(group_id,user_id) on delete cascade
);
create table dayflow_groups_private.join_limits (
 user_id uuid primary key references public.dayflow_user_state(user_id) on delete cascade,
 window_start timestamptz not null, attempts integer not null
);
alter table dayflow_groups_private.groups enable row level security;
alter table dayflow_groups_private.members enable row level security;
alter table dayflow_groups_private.shares enable row level security;
alter table dayflow_groups_private.join_limits enable row level security;
revoke all on all tables in schema dayflow_groups_private from public,anon,authenticated;
-- Intentionally no direct table policies/grants. A narrowly scoped RPC gates every
-- operation, then projects only the explicitly selected schedule fields. Definer is
-- needed for code-hash lookup and reading another member's private calendar source.
create function dayflow_groups_private.run(p_action text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=auth.uid(); gid uuid; person uuid; group_row dayflow_groups_private.groups%rowtype;
 code text; label text; nick text; selected_event text; source_items jsonb; wanted jsonb; result jsonb;
 attempts integer; start_day text; end_day text;
begin
 if me is null or not dayflow_private.google_member() or not exists(select 1 from public.dayflow_user_state where user_id=me)
 then return jsonb_build_object('error','LOGIN_REQUIRED');end if;
 if p_action is null or p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>20000
 then return jsonb_build_object('error','INVALID_INPUT');end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'is_owner',g.owner_id=me) order by g.created_at),'[]'::jsonb)
  into result from dayflow_groups_private.groups g join dayflow_groups_private.members m on m.group_id=g.id where m.user_id=me;
  return jsonb_build_object('groups',result);
 end if;
 if p_action in ('create','join') then
  -- Serializes account-wide membership count and rate limits.
  perform 1 from public.dayflow_user_state where user_id=me for update;
  nick:=btrim(p_args->>'nickname');
  if nick is null or length(nick) not between 1 and 30 then return jsonb_build_object('error','INVALID_NICKNAME');end if;
  if (select count(*) from dayflow_groups_private.members where user_id=me)>=20 then return jsonb_build_object('error','GROUP_LIMIT');end if;
  if p_action='create' then
   label:=btrim(p_args->>'name');
   if label is null or length(label) not between 1 and 40 then return jsonb_build_object('error','INVALID_NAME');end if;
   code:=upper(replace(gen_random_uuid()::text,'-',''));
   insert into dayflow_groups_private.groups(owner_id,name,code_hash)
    values(me,label,encode(sha256(convert_to(code,'UTF8')),'hex')) returning id into gid;
   insert into dayflow_groups_private.members values(gid,me,nick,now());
   return jsonb_build_object('id',gid,'code',code);
  end if;
  insert into dayflow_groups_private.join_limits values(me,now(),1)
  on conflict(user_id) do update set
    attempts=case when dayflow_groups_private.join_limits.window_start<now()-interval '1 minute' then 1 else dayflow_groups_private.join_limits.attempts+1 end,
    window_start=case when dayflow_groups_private.join_limits.window_start<now()-interval '1 minute' then now() else dayflow_groups_private.join_limits.window_start end
  returning dayflow_groups_private.join_limits.attempts into attempts;
  if attempts>10 then return jsonb_build_object('error','JOIN_RATE_LIMIT');end if;
  code:=upper(regexp_replace(coalesce(p_args->>'code',''),'[[:space:]-]','','g'));
  if code!~'^[A-F0-9]{32}$' then return jsonb_build_object('error','INVALID_CODE');end if;
  select * into group_row from dayflow_groups_private.groups where code_hash=encode(sha256(convert_to(code,'UTF8')),'hex') for update;
  if not found then return jsonb_build_object('error','INVALID_CODE');end if;
  gid:=group_row.id;
  if exists(select 1 from dayflow_groups_private.members where group_id=gid and user_id=me) then return jsonb_build_object('id',gid,'already',true);end if;
  if (select count(*) from dayflow_groups_private.members where group_id=gid)>=100 then return jsonb_build_object('error','MEMBER_LIMIT');end if;
  insert into dayflow_groups_private.members values(gid,me,nick,now());
  return jsonb_build_object('id',gid);
 end if;
 if p_action in ('event_groups','set_event_groups') then
  selected_event:=p_args->>'event_id';
  if selected_event is null or length(selected_event) not between 1 and 200 then return jsonb_build_object('error','INVALID_INPUT');end if;
  if p_action='event_groups' then
   select coalesce(jsonb_agg(group_id),'[]'::jsonb) into result from dayflow_groups_private.shares s where s.owner_id=me and s.event_id=selected_event;
   return jsonb_build_object('group_ids',result);
  end if;
  wanted:=p_args->'group_ids';
  if wanted is null or jsonb_typeof(wanted)<>'array' then return jsonb_build_object('error','INVALID_INPUT');end if;
  if jsonb_array_length(wanted)>20 then return jsonb_build_object('error','GROUP_LIMIT');end if;
  select items into source_items from public.dayflow_user_state where user_id=me for update;
  if jsonb_array_length(wanted)>0 and not exists(select 1 from jsonb_array_elements(source_items) e where e->>'id'=selected_event and e->>'type' in ('task','meeting'))
  then return jsonb_build_object('error','EVENT_NOT_SHAREABLE');end if;
  -- Lock memberships to serialize this share with removal/leave. No partial updates.
  perform 1 from dayflow_groups_private.members where user_id=me order by group_id for update;
  if exists(select 1 from jsonb_array_elements_text(wanted) w(id) where not exists(select 1 from dayflow_groups_private.members m where m.user_id=me and m.group_id::text=w.id))
  then return jsonb_build_object('error','NOT_MEMBER');end if;
  delete from dayflow_groups_private.shares s where s.owner_id=me and s.event_id=selected_event;
  insert into dayflow_groups_private.shares select distinct w.id::uuid,me,selected_event from jsonb_array_elements_text(wanted) w(id);
  return jsonb_build_object('saved',true);
 end if;
 if coalesce(p_args->>'group_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then return jsonb_build_object('error','INVALID_INPUT');end if;
 gid:=(p_args->>'group_id')::uuid;
 select * into group_row from dayflow_groups_private.groups where id=gid for update;
 if not found or not exists(select 1 from dayflow_groups_private.members where group_id=gid and user_id=me)
 then return jsonb_build_object('error','NOT_MEMBER');end if;
 if p_action='detail' then
  select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname,'is_owner',user_id=group_row.owner_id,'is_me',user_id=me) order by joined_at),'[]'::jsonb)
  into result from dayflow_groups_private.members where group_id=gid;
  return jsonb_build_object('id',gid,'name',group_row.name,'is_owner',group_row.owner_id=me,'members',result);
 elsif p_action='leave' then
  if group_row.owner_id=me then return jsonb_build_object('error','OWNER_CANNOT_LEAVE');end if;
  delete from dayflow_groups_private.members where group_id=gid and user_id=me;
  return jsonb_build_object('left',true);
 elsif p_action in ('rotate','delete','remove') then
  if group_row.owner_id<>me then return jsonb_build_object('error','OWNER_REQUIRED');end if;
  if p_action='delete' then
   delete from dayflow_groups_private.groups where id=gid;return jsonb_build_object('deleted',true);
  elsif p_action='rotate' then
   code:=upper(replace(gen_random_uuid()::text,'-',''));
   update dayflow_groups_private.groups set code_hash=encode(sha256(convert_to(code,'UTF8')),'hex') where id=gid;
   return jsonb_build_object('code',code);
  else
   if coalesce(p_args->>'member_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return jsonb_build_object('error','INVALID_INPUT');end if;
   person:=(p_args->>'member_id')::uuid;
   if person=me then return jsonb_build_object('error','OWNER_CANNOT_LEAVE');end if;
   delete from dayflow_groups_private.members where group_id=gid and user_id=person;
   -- Also invalidate the old invitation so the removed account cannot reuse it.
   code:=upper(replace(gen_random_uuid()::text,'-',''));
   update dayflow_groups_private.groups set code_hash=encode(sha256(convert_to(code,'UTF8')),'hex') where id=gid;
   return jsonb_build_object('removed',true,'code',code);
  end if;
 elsif p_action='events' then
  start_day:=(date_trunc('week',now() at time zone 'Asia/Seoul')::date)::text;
  end_day:=(date_trunc('week',now() at time zone 'Asia/Seoul')::date+13)::text;
  select coalesce(jsonb_agg(row_data order by row_data->>'date',row_data->>'time',row_data->>'title'),'[]'::jsonb) into result from (
   select jsonb_build_object('owner_id',s.owner_id,'event_id',s.event_id,'nickname',m.nickname,
    'title',left(coalesce(e->>'title',''),500),'date',e->>'date','time',left(coalesce(e->>'time',''),5),
    'endTime',left(coalesce(e->>'endTime',''),5),'endTimeUnknown',e->'endTimeUnknown'='true'::jsonb,
    'notes',left(coalesce(e->>'notes',''),5000)) row_data
   from dayflow_groups_private.shares s
   join dayflow_groups_private.members m on m.group_id=s.group_id and m.user_id=s.owner_id
   join public.dayflow_user_state u on u.user_id=s.owner_id
   cross join lateral jsonb_array_elements(u.items) e
   where s.group_id=gid and e->>'id'=s.event_id and e->>'type' in ('task','meeting')
    and e->>'date' between start_day and end_day
  ) visible;
  return jsonb_build_object('events',result,'start',start_day,'end',end_day);
 end if;
 return jsonb_build_object('error','INVALID_INPUT');
end;
$$;
revoke all on function dayflow_groups_private.run(text,jsonb) from public,anon,authenticated;
grant execute on function dayflow_groups_private.run(text,jsonb) to authenticated;
create function public.dayflow_groups(p_action text,p_args jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select dayflow_groups_private.run(p_action,p_args); $$;
revoke all on function public.dayflow_groups(text,jsonb) from public,anon,authenticated;
grant execute on function public.dayflow_groups(text,jsonb) to authenticated;
-- Group-specific pruning only. Never touches existing email publications/private items.
create function dayflow_groups_private.prune() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from dayflow_groups_private.shares s where s.owner_id=new.user_id and not exists(
  select 1 from jsonb_array_elements(new.items) e where e->>'id'=s.event_id and e->>'type' in ('task','meeting'));
 return new;
end;
$$;
revoke all on function dayflow_groups_private.prune() from public,anon,authenticated;
create trigger dayflow_groups_prune after update of items on public.dayflow_user_state
for each row execute function dayflow_groups_private.prune();
notify pgrst, 'reload schema';
commit;
