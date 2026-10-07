(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_SHARING_CORE,sharing=window.DAYFLOW_SHARING;
 let generation=0,lastSavedId='';
 const panel=document.createElement('section');panel.id='quick-sharing';panel.className='quick-sharing';
 panel.innerHTML=`<label class="quick-sharing-toggle"><input id="quick-share-enabled" type="checkbox"> 이 일정 공유</label><p>공유를 선택하면 <strong>운하루에 Google 로그인한 사람이 내 이메일을 입력하여</strong> 이 일정의 제목·날짜·시간·메모를 볼 수 있습니다.</p><p class="quick-sharing-hint">선택하지 않으면 비공개입니다. 공유할 사람을 등록할 필요가 없습니다. 반복 일정은 첫 날짜의 한 건만 공유합니다.</p><p id="quick-share-status" role="status" aria-live="polite"></p><button id="quick-share-check" type="button" hidden>방금 저장한 일정의 공유 설정 확인</button>`;
 q('parse-button').before(panel);
 const account=()=>sharing?.account()||'';
 const status=(text,error=false)=>{q('quick-share-status').textContent=text;q('quick-share-status').dataset.error=String(error);};
 function clear(){generation++;q('quick-share-enabled').checked=false;lastSavedId='';q('quick-share-check').hidden=true;status('');}
 function modeChanged(){panel.hidden=inputMode==='expense';if(panel.hidden)clear();}
 q('quick-share-check').addEventListener('click',()=>sharing.open(lastSavedId));
 function prepare(savedItems){
  if(!q('quick-share-enabled').checked)return null;
  const item=savedItems[0],owner=account();
  if(!core.canShare(item)){status('소비는 공유할 수 없습니다. 공유를 해제하거나 입력 종류를 할 일·회의로 선택해 주세요.',true);return false;}
  if(!owner||!window.DAYFLOW_CLOUD?.ready()){status('Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.',true);return false;}
  const repeat=savedItems.length>1?`\n반복 ${savedItems.length}건 중 첫 날짜 한 건만 공유하고 나머지는 비공개로 저장합니다.`:'';
  if(!confirm(`운하루에 로그인하고 내 이메일을 아는 누구나 아래 일정을 볼 수 있습니다.\n\n${item.title}\n${item.date||'날짜 미정'} ${item.time||'시간 미정'}\n${item.notes||'메모 없음'}${repeat}\n\n일정을 저장하고 공유할까요?`))return false;
  return {owner,generation,eventId:item.id};
 }
 async function complete(request){
  if(!request){clear();return;}
  const current=()=>request.generation===generation&&request.owner===account();if(!current())return;
  q('quick-share-enabled').checked=false;lastSavedId=request.eventId;q('quick-share-check').hidden=false;status('내 일정을 저장한 뒤 공유를 설정하고 있습니다…');
  try{if(!await window.DAYFLOW_CLOUD.flush())throw Error('Private save not confirmed');if(!current())return;const result=await window.DAYFLOW_SUPABASE_CLIENT.rpc('dayflow_set_event_published',{p_event_id:request.eventId,p_shared:true});if(!current())return;if(result.error)throw result.error;status('일정을 저장하고 공유했습니다. 다른 사람이 내 이메일로 이 일정을 조회할 수 있습니다. 다음 일정은 다시 선택하지 않으면 비공개입니다.');}
  catch(error){if(current())status('일정은 내 기록에 남겨 두었지만 공유 완료를 확인하지 못했습니다. 다시 입력하지 말고 아래 공유 설정에서 현재 상태를 확인해 주세요.',true);}
 }
 window.addEventListener('dayflow-sharing-account-change',clear);window.DAYFLOW_INLINE_SHARING={prepare,complete,modeChanged};modeChanged();
})();
