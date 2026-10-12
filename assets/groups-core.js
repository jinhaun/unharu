(function(root){
 'use strict';
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
 const code=value=>String(value||'').replace(/[\s-]/g,'').toUpperCase();
 const validCode=value=>/^[A-F0-9]{32}$/.test(code(value));
 const canShare=item=>!!item&&['task','meeting'].includes(item.type)&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=200;
 function request(event,groupIds,available){
  if(!canShare(event))throw Error('EVENT_NOT_SHAREABLE');
  const ids=[...new Set(groupIds)];
  if(ids.length>20||ids.some(id=>!uuid(id)||!available.some(g=>g.id===id)))throw Error('NOT_MEMBER');
  // Only IDs are transmitted. The server reads the caller's own saved event.
  return {event_id:event.id,group_ids:ids};
 }
 function errorText(error){
  const messages={LOGIN_REQUIRED:'Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.',
   INVALID_CODE:'초대 코드를 확인해 주세요. 잘못되었거나 재발급된 코드일 수 있습니다.',
   JOIN_RATE_LIMIT:'코드 입력을 여러 번 시도했습니다. 1분 뒤 다시 시도해 주세요.',
   NOT_MEMBER:'그룹 접근 권한이 없습니다. 탈퇴·내보내기·삭제 여부를 확인하고 다시 불러와 주세요.',
   OWNER_REQUIRED:'그룹장만 할 수 있는 작업입니다.',OWNER_CANNOT_LEAVE:'그룹장은 탈퇴 대신 그룹 삭제를 이용해 주세요.',
   EVENT_NOT_SHAREABLE:'서버에 저장된 내 할 일·회의만 공유할 수 있습니다. 소비·교통 기록은 공유하지 않습니다.',
   INVALID_NAME:'그룹 이름을 1~40자로 입력해 주세요.',INVALID_NICKNAME:'그룹에서 사용할 이름을 1~30자로 입력해 주세요.',
   GROUP_LIMIT:'참여할 수 있는 그룹은 최대 20개입니다.',MEMBER_LIMIT:'그룹 정원이 100명입니다.',
   INVALID_INPUT:'입력한 내용을 확인해 주세요.',SAVE_FAILED:'내 일정의 서버 저장을 확인하지 못해 공유하지 않았습니다. 입력을 반복하지 말고 연결 후 다시 확인해 주세요.'};
  const key=error?.code||error?.message;
  if(['PGRST202','42883','42P01'].includes(key))return '그룹 저장소 설정이 아직 필요합니다. Supabase 설정 후 다시 불러와 주세요. 기존 일정은 변경하지 않았습니다.';
  return messages[key]||'완료 여부를 확인하지 못했습니다. 다시 입력하기 전에 새로고침으로 현재 상태를 확인해 주세요.';
 }
 root.DAYFLOW_GROUPS_CORE={uuid,code,validCode,canShare,request,errorText};
})(typeof window!=='undefined'?window:globalThis);
