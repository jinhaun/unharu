-- Synthetic identities; caller wraps this file in BEGIN/ROLLBACK. No persistent accounts/emails.
insert into auth.users(id,email,email_confirmed_at) values
('19460000-0000-4000-8000-000000000001','owner-v46@example.invalid',now()),
('19460000-0000-4000-8000-000000000002','viewer-v46@example.invalid',now()),
('19460000-0000-4000-8000-000000000003','nongoogle-v46@example.invalid',now()),
('19460000-0000-4000-8000-000000000004','no-calendar-v46@example.invalid',now());
insert into auth.identities(user_id,provider_id,identity_data,provider)
select id,id::text,jsonb_build_object('sub',id::text,'email',email),'google' from auth.users
where id in ('19460000-0000-4000-8000-000000000001','19460000-0000-4000-8000-000000000002','19460000-0000-4000-8000-000000000004');
insert into public.dayflow_user_state(user_id,items) values
('19460000-0000-4000-8000-000000000001','[{"id":"one","type":"task","title":"공유 시험","date":"2026-10-07","time":"18:00","notes":"공유 메모","raw":"SECRET","amount":999},{"id":"private","type":"meeting","title":"PRIVATE"},{"id":"expense","type":"expense","title":"SPENDING","amount":999}]'),
('19460000-0000-4000-8000-000000000002','[]'),('19460000-0000-4000-8000-000000000003','[]');
do $$ begin
 if has_function_privilege('anon','public.dayflow_lookup_calendar(text)','EXECUTE') or has_table_privilege('anon','public.dayflow_published_events','SELECT') or has_function_privilege('anon','public.dayflow_set_event_published(text,boolean)','EXECUTE') then raise exception 'Anon leak';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19460000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.dayflow_lookup_calendar('owner-v46@example.invalid'))<>0 then raise exception 'Not private by default';end if;
 perform public.dayflow_set_event_published('one',true);perform public.dayflow_set_event_published('one',true);
 if (select count(*) from public.dayflow_published_events)<>1 then raise exception 'Duplicate publication';end if;
 begin perform public.dayflow_set_event_published('expense',true);raise exception 'Expense published';exception when insufficient_privilege then null;end;
 begin insert into public.dayflow_published_events values(auth.uid(),'expense',now());raise exception 'Direct expense publication';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"19460000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare payload jsonb;n integer;begin
 if (select count(*) from public.dayflow_lookup_calendar(' OWNER-v46@EXAMPLE.INVALID '))<>1 then raise exception 'Exact normalized email lookup failed';end if;
 select to_jsonb(r) into payload from public.dayflow_lookup_calendar('owner-v46@example.invalid') r;
 if payload->>'notes'<>'공유 메모' or payload ? 'raw' or payload ? 'amount' then raise exception 'Projection leak';end if;
 if (select count(*) from public.dayflow_lookup_calendar('%@example.invalid'))<>0 or (select count(*) from public.dayflow_lookup_calendar('missing@example.invalid'))<>0 then raise exception 'Wildcard/account enumeration';end if;
 if (select count(*) from public.dayflow_published_events)<>0 or (select count(*) from public.dayflow_user_state)<>1 then raise exception 'Private table leak';end if;
 update public.dayflow_user_state set items='[]' where user_id='19460000-0000-4000-8000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Viewer edited owner';end if;
 delete from public.dayflow_published_events where owner_id='19460000-0000-4000-8000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Viewer revoked owner';end if;
 begin insert into public.dayflow_published_events values('19460000-0000-4000-8000-000000000001','private',now());raise exception 'Forged owner';exception when insufficient_privilege then null;end;
 begin perform public.dayflow_set_event_published('one',true);raise exception 'Viewer published owner record';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"19460000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"provider":"google"}}',true);
do $$ begin begin perform public.dayflow_lookup_calendar('owner-v46@example.invalid');raise exception 'Fake Google identity';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claims','{"sub":"19460000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin begin perform public.dayflow_lookup_calendar('owner-v46@example.invalid');raise exception 'No calendar membership';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claims','{"sub":"19460000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.dayflow_user_state set items=jsonb_set(items,'{0,notes}','"UPDATED"') where user_id=auth.uid();
do $$ begin
 if (select notes from public.dayflow_lookup_calendar('owner-v46@example.invalid'))<>'UPDATED' then raise exception 'Stale note';end if;
 perform public.dayflow_set_event_published('one',false);
 if (select count(*) from public.dayflow_lookup_calendar('owner-v46@example.invalid'))<>0 then raise exception 'Unshare failed';end if;
 perform public.dayflow_set_event_published('one',true);
end $$;
update public.dayflow_user_state set items=jsonb_set(items,'{0,type}','"expense"') where user_id=auth.uid();
do $$ begin if (select count(*) from public.dayflow_published_events)<>0 then raise exception 'Reclassified grant retained';end if;end $$;
update public.dayflow_user_state set items=jsonb_set(items,'{0,type}','"task"') where user_id=auth.uid();
do $$ begin
 if (select count(*) from public.dayflow_lookup_calendar('owner-v46@example.invalid'))<>0 then raise exception 'Reused ID grant revived';end if;
 perform public.dayflow_set_event_published('one',true);
end $$;
update public.dayflow_user_state set items='[]' where user_id=auth.uid();
do $$ begin if (select count(*) from public.dayflow_published_events)<>0 then raise exception 'Deleted grant retained';end if;end $$;
reset role;
