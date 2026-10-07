(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_SHARING_CORE,sharing=window.DAYFLOW_SHARING;
 let generation=0,requestNumber=0,contacts=[],loaded=false,lastSavedId='';
 const panel=document.createElement('section');panel.id='quick-sharing';panel.className='quick-sharing';
 panel.innerHTML=`<label class="quick-sharing-toggle"><input id="quick-share-enabled" type="checkbox"> 공유</label>
 <p class="quick-sharing-hint">선택하지 않으면 나만 보는 일정입니다. 등록한 사람에게 자동 공유되지 않습니다.</p>
 <div id="quick-share-options" hidden><fieldset><legend>이번 일정을 공유할 사람</legend><div id="quick-share-people"></div></fieldset>
 <p class="quick-sharing-hint">제목·날짜·시간·메모만 읽기 전용으로 공유합니다. 반복 일정은 첫 날짜의 한 건만 공유합니다.</p>
 <button type="button" id="quick-share-refresh">사람 목록 새로고침</button><button type="button" id="quick-share-manage">공유할 사람 등록·관리</button></div>
 <p id="quick-share-status" role="status" aria-live="polite"></p><button type="button" id="quick-share-check" hidden>방금 저장한 일정의 공유 설정 확인</button>`;
 q('parse-button').before(panel);
 const account=()=>sharing?.account()||'';
 const status=(text,error=false)=>{q('quick-share-status').textContent=text;q('quick-share-status').dataset.error=String(error);};
 function reset(){requestNumber++;contacts=[];loaded=false;q('quick-share-enabled').checked=false;q('quick-share-options').hidden=true;q('quick-share-people').replaceChildren();}
 function clear(){generation++;reset();lastSavedId='';q('quick-share-check').hidden=true;status('');}
 function renderPeople(){
  const root=q('quick-share-people');root.replaceChildren();
  if(!contacts.length){const p=document.createElement('p');p.textContent='등록한 사람이 없습니다. 먼저 공유할 사람을 등록해 주세요.';root.append(p);}
  contacts.forEach(contact=>{const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');box.type='checkbox';box.value=contact.recipient_id;text.textContent=contact.email;label.append(box,text);root.append(label);});
 }
 async function load(){
  const owner=account(),version=generation,sequence=++requestNumber;loaded=false;contacts=[];q('quick-share-people').replaceChildren();
  if(!owner||!window.DAYFLOW_CLOUD?.ready()){status('Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.',true);return;}
  status('등록한 사람을 불러오고 있습니다…');
  try{
   const reply=await window.DAYFLOW_SUPABASE_CLIENT.from('dayflow_share_contacts').select('recipient_id,email').eq('owner_id',owner).order('created_at');
   if(version!==generation||sequence!==requestNumber||owner!==account()||!q('quick-share-enabled').checked)return;
   if(reply.error)throw reply.error;contacts=reply.data||[];loaded=true;renderPeople();status(contacts.length?'이번 일정을 보여줄 사람을 선택한 뒤 저장해 주세요.':'사람 등록 후 목록 새로고침을 눌러 주세요.');
  }catch(error){if(version===generation&&sequence===requestNumber)status(core.errorText(error),true);}
 }
 function modeChanged(){panel.hidden=inputMode==='expense';if(panel.hidden)clear();}
 q('quick-share-enabled').addEventListener('change',()=>{if(q('quick-share-enabled').checked){q('quick-share-options').hidden=false;load();}else{reset();status('공유하지 않고 나만 보는 일정으로 저장합니다.');}});
 q('quick-share-refresh').addEventListener('click',load);
 q('quick-share-manage').addEventListener('click',()=>sharing.open());
 q('quick-share-check').addEventListener('click',()=>sharing.open(lastSavedId));
 function prepare(savedItems){
  if(!q('quick-share-enabled').checked)return null;
  const item=savedItems[0],owner=account();
  if(!core.canShare(item)){status('소비는 공유할 수 없습니다. 공유를 해제하거나 입력 종류를 할 일·회의로 선택해 주세요.',true);return false;}
  if(!owner||!window.DAYFLOW_CLOUD?.ready()||!loaded){status('등록한 사람 목록과 로그인 상태를 먼저 확인해 주세요.',true);return false;}
  const selected=[...q('quick-share-people').querySelectorAll('input:checked')].map(el=>el.value);
  const chosen=contacts.filter(c=>selected.includes(c.recipient_id));
  if(!selected.length||chosen.length!==selected.length){status('이번 일정을 공유할 사람을 한 명 이상 선택해 주세요.',true);return false;}
  const repeat=savedItems.length>1?`\n반복 ${savedItems.length}건 중 첫 날짜 한 건만 공유하고, 나머지는 비공개로 저장합니다.`:'';
  if(!confirm(`${chosen.map(c=>c.email).join(', ')}에게 아래 일정을 공유합니다.\n\n${item.title}\n${item.date||'날짜 미정'} ${item.time||'시간 미정'}\n${item.notes||'메모 없음'}${repeat}\n\n일정을 저장하고 공유할까요?`))return false;
  return {owner,generation,eventId:item.id,recipients:selected};
 }
 async function complete(request){
  if(!request){clear();return;}
  const current=()=>request.generation===generation&&request.owner===account();
  if(!current())return;
  reset();lastSavedId=request.eventId;q('quick-share-check').hidden=false;status('내 일정을 저장한 뒤 공유 권한을 설정하고 있습니다…');
  try{
   if(!await window.DAYFLOW_CLOUD.flush())throw new Error('Private save not confirmed');
   if(!current())return;
   const reply=await window.DAYFLOW_SUPABASE_CLIENT.rpc('dayflow_set_event_sharing',{p_event_id:request.eventId,p_recipients:request.recipients});
   if(!current())return;if(reply.error)throw reply.error;
   status(`일정을 저장하고 ${request.recipients.length}명에게 공유했습니다. 다음 일정은 다시 선택하지 않으면 비공개입니다.`);
  }catch(error){if(current())status('일정은 내 기록에 남겨 두었지만 공유 완료를 확인하지 못했습니다. 다시 입력하지 말고 아래 공유 설정에서 저장·공유 상태를 확인해 주세요.',true);}
 }
 window.addEventListener('dayflow-sharing-account-change',clear);
 window.DAYFLOW_INLINE_SHARING={prepare,complete,modeChanged};modeChanged();
})();
