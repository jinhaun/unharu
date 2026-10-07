-- Opt-in email lookup for registered Google members. Never migrate old private grants.
create table public.dayflow_published_events (
 owner_id uuid not null references public.dayflow_user_state(user_id) on delete cascade,
 event_id text not null check(length(event_id) between 1 and 200),
 created_at timestamptz not null default now(),
 primary key(owner_id,event_id)
);
alter table public.dayflow_published_events enable row level security;
revoke all on public.dayflow_published_events from public,anon,authenticated;
grant select,insert,delete on public.dayflow_published_events to authenticated;
create policy "published owner read" on public.dayflow_published_events for select to authenticated using(owner_id=(select auth.uid()));
create policy "published owner delete" on public.dayflow_published_events for delete to authenticated using(owner_id=(select auth.uid()));
create policy "published owner insert" on public.dayflow_published_events for insert to authenticated with check(
 owner_id=(select auth.uid()) and (select dayflow_private.google_member()) and exists(
  select 1 from public.dayflow_user_state s where s.user_id=(select auth.uid()) and
  (s.items @> jsonb_build_array(jsonb_build_object('id',event_id,'type','task')) or
   s.items @> jsonb_build_array(jsonb_build_object('id',event_id,'type','meeting')))
 )
);
create function public.dayflow_set_event_published(p_event_id text,p_shared boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare source_items jsonb;
begin
 if auth.uid() is null or not dayflow_private.google_member() then raise exception 'Google login required' using errcode='42501';end if;
 if p_event_id is null or length(p_event_id) not between 1 and 200 or p_shared is null then raise exception 'Invalid request' using errcode='22023';end if;
 select items into source_items from public.dayflow_user_state where user_id=auth.uid() for update;
 if source_items is null then raise exception 'Calendar account not ready' using errcode='42501';end if;
 if p_shared then
  if not exists(select 1 from jsonb_array_elements(source_items) e where e->>'id'=p_event_id and e->>'type' in ('task','meeting'))
   then raise exception 'Only your saved schedule can be shared' using errcode='42501';end if;
  insert into public.dayflow_published_events(owner_id,event_id) values(auth.uid(),p_event_id) on conflict do nothing;
 else
  delete from public.dayflow_published_events where owner_id=auth.uid() and event_id=p_event_id;
 end if;
 return p_shared;
end;
$$;
revoke all on function public.dayflow_set_event_published(text,boolean) from public,anon;
grant execute on function public.dayflow_set_event_published(text,boolean) to authenticated;

-- Exact email, not wildcard search/account directory. Missing/nonsharing accounts both return [].
create function dayflow_private.lookup_calendar(p_email text)
returns table(owner_id uuid,event_id text,title text,date text,"time" text,notes text)
language plpgsql stable security definer set search_path='' as $$
declare target_id uuid; clean_email text:=lower(btrim(p_email));
begin
 if auth.uid() is null or not dayflow_private.google_member() or not exists(select 1 from public.dayflow_user_state where user_id=auth.uid())
  then raise exception 'Registered Google login required' using errcode='42501';end if;
 if clean_email is null or length(clean_email)>320 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'Invalid email' using errcode='22023';end if;
 select u.id into target_id from auth.users u
 where lower(u.email)=clean_email and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
 and exists(select 1 from public.dayflow_user_state s where s.user_id=u.id);
 if target_id is null then return;end if;
 return query select g.owner_id,g.event_id,coalesce(e->>'title',''),coalesce(e->>'date',''),coalesce(e->>'time',''),coalesce(e->>'notes','')
 from public.dayflow_published_events g join public.dayflow_user_state s on s.user_id=g.owner_id
 cross join lateral jsonb_array_elements(s.items) e
 where g.owner_id=target_id and e->>'id'=g.event_id and e->>'type' in ('task','meeting');
end;
$$;
revoke all on function dayflow_private.lookup_calendar(text) from public,anon;
grant execute on function dayflow_private.lookup_calendar(text) to authenticated;
create function public.dayflow_lookup_calendar(p_email text)
returns table(owner_id uuid,event_id text,title text,date text,"time" text,notes text)
language sql stable security invoker set search_path='' as $$ select * from dayflow_private.lookup_calendar(p_email); $$;
revoke all on function public.dayflow_lookup_calendar(text) from public,anon;
grant execute on function public.dayflow_lookup_calendar(text) to authenticated;

create function dayflow_private.prune_published_events() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 delete from public.dayflow_published_events g where g.owner_id=new.user_id and not exists(
  select 1 from jsonb_array_elements(new.items) e where e->>'id'=g.event_id and e->>'type' in ('task','meeting')
 );
 return new;
end;
$$;
revoke all on function dayflow_private.prune_published_events() from public,anon,authenticated;
create trigger dayflow_prune_published_events after update of items on public.dayflow_user_state
for each row execute function dayflow_private.prune_published_events();
