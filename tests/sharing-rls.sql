-- Run after the proposed migration in a single BEGIN/ROLLBACK transaction.
-- Synthetic, uncommitted identities only. No Auth API or outbound email.
insert into auth.users(id,email,email_confirmed_at) values
('19440000-0000-4000-8000-000000000001','owner-v44@example.invalid',now()),
('19440000-0000-4000-8000-000000000002','reader-v44@example.invalid',now()),
('19440000-0000-4000-8000-000000000003','outsider-v44@example.invalid',now()),
('19440000-0000-4000-8000-000000000004','nongoogle-v44@example.invalid',now());
insert into auth.identities(user_id,provider_id,identity_data,provider)
select id,id::text,jsonb_build_object('sub',id::text,'email',email),'google' from auth.users
where id in ('19440000-0000-4000-8000-000000000001','19440000-0000-4000-8000-000000000002','19440000-0000-4000-8000-000000000003');
insert into public.dayflow_user_state(user_id,items) values
('19440000-0000-4000-8000-000000000001','[{"id":"share-one","type":"task","title":"공유 시험","date":"2026-10-20","time":"12:30","notes":"보이는 메모","raw":"DO NOT EXPOSE","amount":900},{"id":"private-two","type":"meeting","title":"비공개"},{"id":"expense-three","type":"expense","title":"비공개 소비","amount":999}]'),
('19440000-0000-4000-8000-000000000002','[]'),
('19440000-0000-4000-8000-000000000003','[]'),
('19440000-0000-4000-8000-000000000004','[]');
do $$ begin
  if has_table_privilege('anon','public.dayflow_event_shares','SELECT') or has_table_privilege('anon','public.dayflow_share_contacts','SELECT')
    or has_function_privilege('anon','public.dayflow_received_events()','EXECUTE') then raise exception 'Anonymous privilege leak'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.dayflow_add_share_contact('reader-v44@example.invalid');
select public.dayflow_add_share_contact('READER-v44@example.invalid');
do $$ begin
  if (select count(*) from public.dayflow_share_contacts)<>1 then raise exception 'Duplicate contact'; end if;
  if (select public.dayflow_set_event_sharing('share-one',array['19440000-0000-4000-8000-000000000002'::uuid]))<>1 then raise exception 'Grant not saved'; end if;
  begin perform public.dayflow_set_event_sharing('expense-three',array['19440000-0000-4000-8000-000000000002'::uuid]);raise exception 'Expense shared';exception when insufficient_privilege then null;end;
  begin perform public.dayflow_set_event_sharing('share-one',array['19440000-0000-4000-8000-000000000003'::uuid]);raise exception 'Unknown recipient accepted';exception when insufficient_privilege then null;end;
  begin perform public.dayflow_add_share_contact('nongoogle-v44@example.invalid');raise exception 'Non-google accepted';exception when no_data_found then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare received jsonb; n integer; begin
  if (select count(*) from public.dayflow_user_state)<>1 then raise exception 'Private state exposed';end if;
  if (select count(*) from public.dayflow_share_contacts)<>0 or (select count(*) from public.dayflow_event_shares)<>0 then raise exception 'Owner contacts/permissions exposed';end if;
  select to_jsonb(r) into received from public.dayflow_received_events() r;
  if received->>'title'<>'공유 시험' or received->>'notes'<>'보이는 메모' or received ? 'raw' or received ? 'amount' then raise exception 'Wrong shared fields';end if;
  if (select count(*) from public.dayflow_received_events())<>1 then raise exception 'Unshared event exposed';end if;
  update public.dayflow_user_state set items='[]' where user_id='19440000-0000-4000-8000-000000000001';get diagnostics n=row_count;
  if n<>0 then raise exception 'Recipient edited owner state';end if;
  delete from public.dayflow_event_shares where owner_id='19440000-0000-4000-8000-000000000001';get diagnostics n=row_count;
  if n<>0 then raise exception 'Recipient changed permissions';end if;
  begin insert into public.dayflow_event_shares values('19440000-0000-4000-8000-000000000001','private-two','19440000-0000-4000-8000-000000000003',now());raise exception 'Forged owner accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"owner_id":"19440000-0000-4000-8000-000000000001"}}',true);
do $$ begin if (select count(*) from public.dayflow_received_events())<>0 then raise exception 'Uninvited account exposed';end if;end $$;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.dayflow_user_state set items=jsonb_set(items,'{0,notes}','"수정된 메모"') where user_id=auth.uid();
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if (select notes from public.dayflow_received_events())<>'수정된 메모' then raise exception 'Stale source content';end if;end $$;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.dayflow_set_event_sharing('share-one','{}'::uuid[]);
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if (select count(*) from public.dayflow_received_events())<>0 then raise exception 'Revocation ineffective';end if;end $$;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.dayflow_set_event_sharing('share-one',array['19440000-0000-4000-8000-000000000002'::uuid]);
update public.dayflow_user_state set items=items-'0' where false; -- no-op; next line removes a real array element
update public.dayflow_user_state set items=items-0 where user_id=auth.uid();
do $$ begin if (select count(*) from public.dayflow_event_shares)<>0 then raise exception 'Deleted source grant survived';end if;end $$;
update public.dayflow_user_state set items=items||'[{"id":"share-one","type":"task","title":"再登録"}]'::jsonb where user_id=auth.uid();
do $$ begin if (select count(*) from public.dayflow_event_shares)<>0 then raise exception 'Reused ID regained access';end if;end $$;
select public.dayflow_set_event_sharing('share-one',array['19440000-0000-4000-8000-000000000002'::uuid]);
delete from public.dayflow_share_contacts where owner_id=auth.uid();
do $$ begin if (select count(*) from public.dayflow_event_shares)<>0 then raise exception 'Contact removal did not revoke';end if;end $$;
select set_config('request.jwt.claims','{"sub":"19440000-0000-4000-8000-000000000004","role":"authenticated","user_metadata":{"provider":"google"}}',true);
do $$ begin
  begin perform public.dayflow_received_events();raise exception 'Forged Google metadata accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
