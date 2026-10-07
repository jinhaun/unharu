-- Additive sharing only. Existing dayflow_user_state ownership policies stay unchanged.
create schema if not exists dayflow_private;
revoke all on schema dayflow_private from public, anon;
grant usage on schema dayflow_private to authenticated;

create table public.dayflow_share_contacts (
  owner_id uuid not null references public.dayflow_user_state(user_id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (length(email) between 3 and 320),
  created_at timestamptz not null default now(),
  primary key (owner_id,recipient_id),
  check (owner_id<>recipient_id)
);
create index dayflow_contacts_recipient_idx on public.dayflow_share_contacts(recipient_id);
alter table public.dayflow_share_contacts enable row level security;
revoke all on public.dayflow_share_contacts from public,anon,authenticated;
grant select,delete on public.dayflow_share_contacts to authenticated;
create policy "contacts owner read" on public.dayflow_share_contacts for select to authenticated using(owner_id=(select auth.uid()));
create policy "contacts owner delete" on public.dayflow_share_contacts for delete to authenticated using(owner_id=(select auth.uid()));

create table public.dayflow_event_shares (
  owner_id uuid not null,
  event_id text not null check(length(event_id) between 1 and 200),
  recipient_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,event_id,recipient_id),
  foreign key(owner_id,recipient_id) references public.dayflow_share_contacts(owner_id,recipient_id) on delete cascade
);
create index dayflow_shares_contact_idx on public.dayflow_event_shares(owner_id,recipient_id);
create index dayflow_shares_recipient_idx on public.dayflow_event_shares(recipient_id);
alter table public.dayflow_event_shares enable row level security;
revoke all on public.dayflow_event_shares from public,anon,authenticated;
grant select,insert,delete on public.dayflow_event_shares to authenticated;
create policy "shares owner read" on public.dayflow_event_shares for select to authenticated using(owner_id=(select auth.uid()));
create policy "shares owner delete" on public.dayflow_event_shares for delete to authenticated using(owner_id=(select auth.uid()));
create policy "shares owner insert" on public.dayflow_event_shares for insert to authenticated with check(
  owner_id=(select auth.uid()) and exists(
    select 1 from public.dayflow_user_state s where s.user_id=(select auth.uid()) and
    (s.items @> jsonb_build_array(jsonb_build_object('id',event_id,'type','task')) or
     s.items @> jsonb_build_array(jsonb_build_object('id',event_id,'type','meeting')))
  )
);

-- This helper checks the current caller, never a caller-supplied user ID/metadata.
create function dayflow_private.google_member() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from auth.users u join auth.identities i on i.user_id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null and i.provider='google'
  );
$$;
revoke all on function dayflow_private.google_member() from public,anon;
grant execute on function dayflow_private.google_member() to authenticated;

-- Exact email lookup only; no public account directory. Contacts are pinned to UUID.
create function dayflow_private.add_contact(p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare target_id uuid; clean_email text:=lower(btrim(p_email));
begin
  if auth.uid() is null or not dayflow_private.google_member() then raise exception 'Google login required' using errcode='42501'; end if;
  if clean_email is null or length(clean_email)>320 or clean_email not like '%@%.%' then raise exception 'Invalid email' using errcode='22023'; end if;
  if not exists(select 1 from public.dayflow_user_state where user_id=auth.uid()) then raise exception 'Calendar account not ready' using errcode='22023'; end if;
  select u.id into target_id from auth.users u
  where lower(u.email)=clean_email and u.email_confirmed_at is not null
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
    and exists(select 1 from public.dayflow_user_state s where s.user_id=u.id);
  if target_id is null then raise exception 'Registered Google account not found' using errcode='P0002'; end if;
  if target_id=auth.uid() then raise exception 'Cannot add yourself' using errcode='22023'; end if;
  if (select count(*) from public.dayflow_share_contacts where owner_id=auth.uid())>=100
    and not exists(select 1 from public.dayflow_share_contacts where owner_id=auth.uid() and recipient_id=target_id)
    then raise exception 'Contact limit reached' using errcode='22023'; end if;
  insert into public.dayflow_share_contacts(owner_id,recipient_id,email) values(auth.uid(),target_id,clean_email)
    on conflict(owner_id,recipient_id) do nothing;
  return target_id;
end;
$$;
revoke all on function dayflow_private.add_contact(text) from public,anon;
grant execute on function dayflow_private.add_contact(text) to authenticated;
create function public.dayflow_add_share_contact(p_email text) returns uuid language sql security invoker set search_path='' as $$
  select dayflow_private.add_contact(p_email);
$$;
revoke all on function public.dayflow_add_share_contact(text) from public,anon;
grant execute on function public.dayflow_add_share_contact(text) to authenticated;

-- One RPC transaction replaces recipients atomically; cannot publish expenses or raw input.
create function dayflow_private.set_event_sharing(p_event_id text,p_recipients uuid[]) returns integer language plpgsql security invoker set search_path='' as $$
declare source_items jsonb; target uuid;
begin
  if auth.uid() is null or not dayflow_private.google_member() then raise exception 'Google login required' using errcode='42501'; end if;
  if p_event_id is null or length(p_event_id) not between 1 and 200 or p_recipients is null or cardinality(p_recipients)>100
    then raise exception 'Invalid sharing request' using errcode='22023'; end if;
  select items into source_items from public.dayflow_user_state where user_id=auth.uid() for update;
  if cardinality(p_recipients)>0 and not exists(select 1 from jsonb_array_elements(source_items) e where e->>'id'=p_event_id and e->>'type' in ('task','meeting'))
    then raise exception 'Only your saved schedule can be shared' using errcode='42501'; end if;
  foreach target in array p_recipients loop
    if target is null or not exists(select 1 from public.dayflow_share_contacts c where c.owner_id=auth.uid() and c.recipient_id=target)
      then raise exception 'Recipient is not registered' using errcode='42501'; end if;
  end loop;
  delete from public.dayflow_event_shares where owner_id=auth.uid() and event_id=p_event_id and not(recipient_id=any(p_recipients));
  insert into public.dayflow_event_shares(owner_id,event_id,recipient_id)
    select auth.uid(),p_event_id,r from unnest(p_recipients) r on conflict do nothing;
  return (select count(*)::integer from public.dayflow_event_shares where owner_id=auth.uid() and event_id=p_event_id);
end;
$$;
revoke all on function dayflow_private.set_event_sharing(text,uuid[]) from public,anon;
grant execute on function dayflow_private.set_event_sharing(text,uuid[]) to authenticated;
create function public.dayflow_set_event_sharing(p_event_id text,p_recipients uuid[]) returns integer language sql security invoker set search_path='' as $$
  select dayflow_private.set_event_sharing(p_event_id,p_recipients);
$$;
revoke all on function public.dayflow_set_event_sharing(text,uuid[]) from public,anon;
grant execute on function public.dayflow_set_event_sharing(text,uuid[]) to authenticated;

-- The only cross-account read: caller's grants, four whitelisted fields, no full snapshots.
create function dayflow_private.received_events() returns table(owner_id uuid,event_id text,title text,date text,"time" text,notes text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not dayflow_private.google_member() then raise exception 'Google login required' using errcode='42501'; end if;
  return query select g.owner_id,g.event_id,coalesce(e->>'title',''),coalesce(e->>'date',''),coalesce(e->>'time',''),coalesce(e->>'notes','')
  from public.dayflow_event_shares g join public.dayflow_user_state s on s.user_id=g.owner_id
  cross join lateral jsonb_array_elements(s.items) e
  where g.recipient_id=auth.uid() and e->>'id'=g.event_id and e->>'type' in ('task','meeting');
end;
$$;
revoke all on function dayflow_private.received_events() from public,anon;
grant execute on function dayflow_private.received_events() to authenticated;
create function public.dayflow_received_events() returns table(owner_id uuid,event_id text,title text,date text,"time" text,notes text)
language sql stable security invoker set search_path='' as $$ select * from dayflow_private.received_events(); $$;
revoke all on function public.dayflow_received_events() from public,anon;
grant execute on function public.dayflow_received_events() to authenticated;

-- Deleted or reclassified schedules must not regain old permissions if IDs are reused.
create function dayflow_private.prune_event_shares() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  delete from public.dayflow_event_shares g where g.owner_id=new.user_id and not exists(
    select 1 from jsonb_array_elements(new.items) e where e->>'id'=g.event_id and e->>'type' in ('task','meeting')
  );
  return new;
end;
$$;
revoke all on function dayflow_private.prune_event_shares() from public,anon,authenticated;
create trigger dayflow_prune_event_shares after update of items on public.dayflow_user_state
for each row execute function dayflow_private.prune_event_shares();
