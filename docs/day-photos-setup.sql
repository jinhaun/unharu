-- 검토용 설정안입니다. 운영에서 아직 실행하지 않았습니다.
-- 승인 후 대상 프로젝트를 확인하고 한 번만 실행하세요.
-- 기존 일정 표·공유 표·다른 저장 공간은 변경하지 않습니다.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('unharu-day-photos', 'unharu-day-photos', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'unharu-day-photos' and public = false
      and file_size_limit = 4194304 and allowed_mime_types = array['image/jpeg']
  ) then
    raise exception '사진 저장 공간의 기존 설정이 다릅니다. 자동 변경하지 않고 중단합니다.';
  end if;
  if not exists (select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity) then
    raise exception '저장소의 행별 접근 제한이 꺼져 있습니다. 설정을 검토해야 합니다.';
  end if;
end $$;

-- 다른 서비스의 넓은 허용 규칙이 있어도 이 공간은 본인 폴더만 허용합니다.
create policy "unharu_photos_owner_guard"
on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'unharu-day-photos' or (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id <> 'unharu-day-photos' or (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "unharu_photos_no_guest"
on storage.objects as restrictive for all to anon
using (bucket_id <> 'unharu-day-photos')
with check (bucket_id <> 'unharu-day-photos');

-- 사진은 새 이름으로 추가하거나 명시적으로 삭제합니다. 덮어쓰기·이동은 막습니다.
create policy "unharu_photos_no_update"
on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'unharu-day-photos')
with check (bucket_id <> 'unharu-day-photos');

create policy "unharu_photos_read_own"
on storage.objects for select to authenticated
using (bucket_id = 'unharu-day-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "unharu_photos_add_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'unharu-day-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.jpg$'
);

create policy "unharu_photos_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'unharu-day-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
