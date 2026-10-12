(function(){
 'use strict';
 const core=window.DAYFLOW_GROUPS_CORE,dates=window.UNHARU_SHARING_CORE,q=id=>document.getElementById(id);
 const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 let epoch=0,owner='',groups=[],active='',detail=null,busy=false,shareReady=false,returnFocus=null,selectionSequence=0;
 const menu=make('button','그룹 일정');menu.type='button';menu.id='groups-menu';q('sharing-inbox-menu').after(menu);
 const dialog=make('dialog');dialog.id='groups-dialog';dialog.setAttribute('aria-labelledby','groups-title');
 dialog.innerHTML=`<div class="dialog-head"><h2 id="groups-title">함께 보는 그룹 일정</h2><button id="groups-close" type="button" class="close-button" aria-label="그룹 일정 닫기">×</button></div>
 <div class="groups-body"><p>그룹 코드로 참여한 구성원끼리 <strong>각자 선택한 일정만</strong> 읽기 전용으로 공유합니다. 기존 이메일 공유와는 별개이며 비공개 일정·소비 기록은 자동으로 공유되지 않습니다.</p>
 <p id="groups-status" role="status" aria-live="polite"></p>
 <details><summary>그룹 만들기 / 코드로 참여</summary><label for="groups-nickname">그룹에서 사용할 내 이름</label><input id="groups-nickname" maxlength="30" autocomplete="off" placeholder="구성원에게 보여줄 이름">
 <label for="groups-name">새 그룹 이름</label><input id="groups-name" maxlength="40" placeholder="예: 가족 일정"><button type="button" id="groups-create">새 그룹 만들기</button>
 <label for="groups-code">받은 초대 코드</label><input id="groups-code" maxlength="64" autocomplete="off" spellcheck="false" placeholder="초대 코드를 붙여넣으세요"><button type="button" id="groups-join">코드로 참여하기</button>
 <p>코드를 받은 로그인 사용자는 그룹에 참여할 수 있습니다. 믿을 수 있는 사람에게만 전달해 주세요. 참여하면 선택해 공유된 지난 일정도 이번 주 범위에서 볼 수 있습니다.</p></details>
 <div id="groups-invite" hidden><label for="groups-new-code">초대 코드 — 이 화면에서 복사해 전달하세요</label><input id="groups-new-code" readonly><button id="groups-copy" type="button">코드 복사</button><p>창을 닫으면 코드를 숨깁니다. 다시 필요하면 그룹장이 재발급할 수 있습니다.</p></div>
 <section><h3>참여한 그룹</h3><label for="groups-list">볼 그룹 선택</label><select id="groups-list"><option value="">그룹을 선택하세요</option></select><button id="groups-refresh" type="button">그룹 새로고침</button>
 <div id="groups-detail" hidden><h4 id="groups-name-view"></h4><div id="groups-members"></div><div class="groups-actions"><button id="groups-rotate" type="button">초대 코드 재발급</button><button id="groups-leave" type="button">그룹 탈퇴</button><button id="groups-delete" type="button">그룹 삭제</button></div>
 <h4>이번 주 · 다음 주 일정</h4><p id="groups-range"></p><div id="groups-events"></div></div></section>
 <section><h3>내 일정의 그룹 공유 설정</h3><label for="groups-event">공유할 내 일정</label><select id="groups-event"><option value="">일정을 선택하세요</option></select><div id="groups-event-preview"></div>
 <fieldset id="groups-targets"><legend>이 일정을 보여줄 그룹</legend></fieldset><button id="groups-save" type="button" disabled>선택한 그룹에 공유 설정 저장</button>
 <p>제목·날짜·시작/종료 시간·메모만 공유합니다. 수정된 내용도 다음 조회에 반영됩니다. 모두 해제하고 저장하면 그룹 공유가 종료됩니다. 반복 일정은 선택한 날짜 한 건만 적용됩니다.</p></section>
 <p>공유를 해제하거나 탈퇴하면 다음 조회부터 보이지 않습니다. 이미 보거나 복사한 내용은 회수할 수 없습니다. 이 창이 보일 때 1분 간격으로 다시 확인합니다.</p></div>`;
 document.body.append(dialog);
 const inline=make('section');inline.id='quick-groups';inline.className='quick-sharing';
 inline.innerHTML=`<fieldset id="quick-group" aria-describedby="quick-groups-help"><legend>이 일정의 그룹 공유 (여러 개 선택 가능)</legend><p>내 그룹 불러오기를 눌러 주세요.</p></fieldset><button id="quick-groups-load" type="button">내 그룹 불러오기</button><button id="quick-groups-clear" type="button">선택 모두 해제</button><p id="quick-groups-help">체크한 그룹에만 제목·날짜·시간·메모를 공유합니다. 아무것도 선택하지 않으면 그룹에 공유하지 않습니다. 반복 일정은 첫 날짜 한 건만 공유합니다. 위의 이메일 공유를 함께 선택하면 이메일 조회로도 공개됩니다.</p><p id="quick-groups-status" role="status" aria-live="polite"></p>`;
 q('parse-button').before(inline);
 const note=text=>q('groups-status').textContent=text;
 const current=version=>version===epoch;
 function loggedIn(){return !!owner&&!!window.DAYFLOW_CLOUD?.ready();}
 async function rpc(action,args={},version=epoch){
  if(!loggedIn())throw Error('LOGIN_REQUIRED');
  const reply=await window.DAYFLOW_SUPABASE_CLIENT.rpc('dayflow_groups',{p_action:action,p_args:args});
  if(!current(version))throw Error('STALE_ACCOUNT');
  if(reply.error)throw reply.error;
  if(reply.data?.error)throw Error(reply.data.error);
  if(!reply.data||typeof reply.data!=='object')throw Error('INVALID_RESPONSE');
  return reply.data;
 }
 function setBusy(value){
  busy=value;dialog.setAttribute('aria-busy',String(value));
  dialog.querySelectorAll('button:not(#groups-close),select,input').forEach(el=>el.disabled=value);
  q('groups-save').disabled=value||!shareReady;
 }
 async function run(work){
  if(busy)return;const version=epoch;setBusy(true);note('확인하고 있습니다…');
  try{await work(version);}catch(error){if(current(version)){shareReady=false;note(core.errorText(error));q('groups-events').replaceChildren();q('groups-detail').hidden=true;}}
  finally{if(current(version))setBusy(false);}
 }
 function invite(code){if(!dialog.open)return;q('groups-new-code').value=code;q('groups-invite').hidden=false;}
 function hideCode(){q('groups-new-code').value='';q('groups-invite').hidden=true;}
 function quickIds(){return [...q('quick-group').querySelectorAll('input:checked')].map(el=>el.value);}
 function clearQuick(){q('quick-group').querySelectorAll('input').forEach(el=>el.checked=false);}
 function quickStatus(){const count=quickIds().length;q('quick-groups-status').textContent=count?`${count}개 그룹 선택 · 저장할 때 공유 대상을 다시 확인합니다.`:'선택한 그룹이 없습니다. 그룹 공유 없이 저장합니다.';}
 function fillGroups(){
  const chosen=quickIds();
  q('groups-list').replaceChildren(new Option('그룹을 선택하세요',''));
  q('quick-group').replaceChildren(make('legend','이 일정의 그룹 공유 (여러 개 선택 가능)'));
  groups.forEach(g=>{q('groups-list').add(new Option(g.name,g.id));const label=make('label'),input=make('input');input.type='checkbox';input.value=g.id;input.checked=chosen.includes(g.id);input.addEventListener('change',quickStatus);label.append(input,make('span',g.name));q('quick-group').append(label);});
  if(!groups.length)q('quick-group').append(make('p','참여한 그룹이 없습니다. 그룹 일정 메뉴에서 만들거나 참여해 주세요.'));
  q('groups-list').value=groups.some(g=>g.id===active)?active:'';
  quickStatus();
 }
 async function loadGroups(version){const data=await rpc('list',{},version);groups=(data.groups||[]).filter(g=>core.uuid(g.id));fillGroups();}
 function fillEvents(preferred=''){
  q('groups-event').replaceChildren(new Option('일정을 선택하세요',''));
  items.filter(core.canShare).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(item=>q('groups-event').add(new Option(`${item.date||'날짜 미정'} · ${item.title}`,item.id)));
  if(items.some(i=>i.id===preferred&&core.canShare(i)))q('groups-event').value=preferred;
 }
 function selected(){return items.find(i=>i.id===q('groups-event').value&&core.canShare(i));}
 async function loadEvent(version){
  const sequence=++selectionSequence,item=selected();shareReady=false;q('groups-save').disabled=true;
  q('groups-targets').replaceChildren(make('legend','이 일정을 보여줄 그룹'));q('groups-event-preview').replaceChildren();
  if(!item)return;
  q('groups-event-preview').append(make('strong',item.title),make('p',`${dates.formatDate(item.date)} · ${window.DAYFLOW_TASK_TIME?.format(item)||'시간 미정'}`),make('p',item.notes||'메모 없음'));
  const data=await rpc('event_groups',{event_id:item.id},version);if(sequence!==selectionSequence||selected()?.id!==item.id)return;
  groups.forEach(g=>{const label=make('label'),input=make('input');input.type='checkbox';input.value=g.id;input.checked=data.group_ids?.includes(g.id)||false;label.append(input,make('span',g.name));q('groups-targets').append(label);});
  shareReady=groups.length>0;q('groups-save').disabled=busy||!shareReady;
 }
 function renderGroup(data,events){
  detail=data;q('groups-detail').hidden=false;q('groups-name-view').textContent=data.name;
  q('groups-members').replaceChildren();
  data.members.forEach(member=>{
   const row=make('p',member.nickname+(member.is_me?' (나)':'')+(member.is_owner?' · 그룹장':''));
   if(data.is_owner&&!member.is_owner){const btn=make('button','내보내기');btn.type='button';btn.setAttribute('aria-label',member.nickname+' 내보내기');btn.addEventListener('click',()=>{
    if(!confirm(`${member.nickname} 님을 내보낼까요? 그 사람의 그룹 공유도 종료하고 기존 초대 코드를 무효화합니다.`))return;
    run(async version=>{const result=await rpc('remove',{group_id:active,member_id:member.id},version);invite(result.code);await refreshDetail(version);note('구성원을 내보내고 초대 코드를 재발급했습니다.');});
   });row.append(btn);}q('groups-members').append(row);
  });
  q('groups-rotate').hidden=q('groups-delete').hidden=!data.is_owner;q('groups-leave').hidden=data.is_owner;
  q('groups-range').textContent=`${dates.formatDate(events.start)} ~ ${dates.formatDate(events.end)} · 대한민국 시간 · 월요일 시작`;
  const root=q('groups-events');root.replaceChildren();
  const range=dates.twoWeekRange();
  for(const [title,start,end] of [['이번 주',range.start,range.thisEnd],['다음 주',range.nextStart,range.end]]){
   const section=make('section');section.className='shared-week';section.append(make('h4',title));
   const rows=(events.events||[]).filter(e=>e.date>=start&&e.date<=end);
   if(!rows.length)section.append(make('p','공유된 일정이 없습니다.'));
   rows.forEach(e=>{const card=make('article');card.className='shared-card';
    const when=e.time?(e.endTime?e.time+'–'+e.endTime:e.time+(e.endTimeUnknown?' · 종료 잘 모름':'')):'시간 미정';
    card.append(make('small',e.nickname+' · 읽기 전용'),make('p',`${dates.formatDate(e.date)} · ${when}`),make('h4',e.title),make('p',e.notes||'메모 없음'));section.append(card);});root.append(section);
  }
 }
 async function refreshDetail(version){
  q('groups-events').replaceChildren();q('groups-detail').hidden=true;detail=null;
  if(!active||!groups.some(g=>g.id===active))return;
  const groupId=active,data=await rpc('detail',{group_id:groupId},version),events=await rpc('events',{group_id:groupId},version);
  if(active===groupId)renderGroup(data,events);
 }
 async function refresh(version,preferred=q('groups-event').value){await loadGroups(version);fillEvents(preferred);await loadEvent(version);await refreshDetail(version);}
 function open(eventId=''){
  if(!loggedIn()){showToast('로그인 필요','Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.');return;}
  returnFocus=document.activeElement;if(!dialog.open)dialog.showModal();q('groups-close').focus();
  return run(async version=>{await refresh(version,typeof eventId==='string'?eventId:'');note(groups.length?'그룹을 선택해 일정을 보거나 내 일정의 공유 범위를 설정하세요.':'아직 참여한 그룹이 없습니다. 그룹을 만들거나 받은 코드로 참여하세요.');});
 }
 menu.addEventListener('click',()=>open());q('groups-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{hideCode();q('groups-events').replaceChildren();returnFocus?.focus?.();});
 q('groups-create').addEventListener('click',()=>run(async version=>{
  const name=q('groups-name').value.trim(),nickname=q('groups-nickname').value.trim();
  if(!name)throw Error('INVALID_NAME');if(!nickname)throw Error('INVALID_NICKNAME');
  const result=await rpc('create',{name,nickname},version);active=result.id;invite(result.code);q('groups-name').value='';await refresh(version);note('그룹을 만들었습니다. 초대 코드를 전달해 주세요. 아직 어떤 일정도 공유하지 않았습니다.');
 }));
 q('groups-join').addEventListener('click',()=>run(async version=>{
  const code=core.code(q('groups-code').value),nickname=q('groups-nickname').value.trim();if(!core.validCode(code))throw Error('INVALID_CODE');if(!nickname)throw Error('INVALID_NICKNAME');
  const result=await rpc('join',{code,nickname},version);active=result.id;q('groups-code').value='';hideCode();await refresh(version);note(result.already?'이미 참여한 그룹을 열었습니다.':'그룹에 참여했습니다. 내 일정은 자동 공유되지 않습니다.');
 }));
 q('groups-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(q('groups-new-code').value);note('초대 코드를 복사했습니다.');}catch{q('groups-new-code').focus();q('groups-new-code').select();note('코드가 선택되었습니다. 길게 누르거나 복사 단축키로 복사하세요.');}});
 q('groups-list').addEventListener('change',()=>{active=q('groups-list').value;hideCode();run(async version=>{await refreshDetail(version);note('그룹 일정을 확인했습니다.');});});
 q('groups-event').addEventListener('change',()=>run(async version=>{await loadEvent(version);note('보여줄 그룹을 선택한 뒤 저장해 주세요.');}));
 q('groups-refresh').addEventListener('click',()=>run(async version=>{await refresh(version);note('그룹 상태를 다시 확인했습니다.');}));
 q('groups-save').addEventListener('click',()=>{
  if(!shareReady)return;const item=selected();if(!item)return;
  const ids=[...q('groups-targets').querySelectorAll('input:checked')].map(el=>el.value);
  if(!confirm(`${item.title}\n${item.date} ${item.time||''}\n${item.notes||'메모 없음'}\n\n${ids.length?groups.filter(g=>ids.includes(g.id)).map(g=>g.name).join(', ')+' 그룹에만 공유할까요?':'모든 그룹에서 이 일정의 공유를 해제할까요?'}\n기존 이메일 공유 설정은 별도로 유지됩니다.`))return;
  run(async version=>{const args=core.request(item,ids,groups);if(ids.length&&!await window.DAYFLOW_CLOUD.flush())throw Error('SAVE_FAILED');if(!current(version))return;
   await rpc('set_event_groups',args,version);await refresh(version,item.id);note(ids.length?'선택한 그룹에 공유했습니다.':'이 일정의 그룹 공유를 해제했습니다.');});
 });
 q('groups-rotate').addEventListener('click',()=>{if(!confirm('초대 코드를 재발급할까요? 기존 코드는 더 이상 참여에 사용할 수 없습니다. 현재 구성원은 유지됩니다.'))return;run(async version=>{const data=await rpc('rotate',{group_id:active},version);invite(data.code);note('초대 코드를 재발급했습니다.');});});
 for(const action of ['leave','delete'])q('groups-'+action).addEventListener('click',()=>{
  if(!confirm(action==='leave'?'그룹에서 탈퇴할까요? 내 일정의 이 그룹 공유도 종료됩니다. 원래 일정은 남습니다.':'그룹과 그룹 내 공유 연결을 삭제할까요? 구성원들의 원래 일정은 삭제하지 않습니다.'))return;
  run(async version=>{await rpc(action,{group_id:active},version);active='';hideCode();await refresh(version);note(action==='leave'?'탈퇴했습니다.':'그룹을 삭제했습니다.');});
 });
 q('quick-groups-load').addEventListener('click',async()=>{const version=epoch,button=q('quick-groups-load');button.disabled=true;
  try{await loadGroups(version);quickStatus();}
  catch(error){if(current(version))q('quick-groups-status').textContent=core.errorText(error);}finally{if(current(version))button.disabled=false;}
 });
 q('quick-groups-clear').addEventListener('click',()=>{clearQuick();quickStatus();});
 function prepare(savedItems){
  const groupIds=quickIds();if(!groupIds.length)return null;
  try{if(!loggedIn())throw Error('LOGIN_REQUIRED');const item=savedItems[0],args=core.request(item,groupIds,groups),names=groups.filter(g=>args.group_ids.includes(g.id)).map(g=>g.name);
   if(!confirm(`선택한 ${names.length}개 그룹 (${names.join(', ')})에 아래 일정의 제목·날짜·시간·메모를 공유할까요?\n\n${item.title}\n${item.date} ${item.time||''}\n${item.notes||'메모 없음'}\n반복 일정은 첫 날짜 한 건만 공유됩니다.`))return false;
   return {args,epoch,owner};
  }catch(error){q('quick-groups-status').textContent=core.errorText(error);return false;}
 }
 async function complete(request){
  if(!request)return;
  if(!current(request.epoch)||owner!==request.owner)return;
  clearQuick();
  q('quick-groups-status').textContent='내 일정을 저장한 뒤 그룹에 공유하고 있습니다…';
  try{if(!await window.DAYFLOW_CLOUD.flush())throw Error('SAVE_FAILED');if(!current(request.epoch)||owner!==request.owner)return;
   await rpc('set_event_groups',request.args,request.epoch);q('quick-groups-status').textContent='선택한 그룹에 공유했습니다. 다음 일정은 자동으로 공유하지 않습니다.';
  }catch(error){if(current(request.epoch))q('quick-groups-status').textContent='일정은 내 기록에 남아 있습니다. '+core.errorText(error)+' 그룹 일정 메뉴에서 공유 상태를 확인해 주세요.';}
 }
 function modeChanged(){inline.hidden=inputMode==='expense';if(inline.hidden){clearQuick();quickStatus();}}
 function accountChanged(session){const next=session?.user?.id||'';if(next===owner)return;epoch++;selectionSequence++;owner=next;groups=[];active='';detail=null;shareReady=false;busy=false;
  dialog.close();hideCode();q('groups-events').replaceChildren();q('groups-members').replaceChildren();q('groups-detail').hidden=true;
  q('groups-event-preview').replaceChildren();q('groups-targets').replaceChildren(make('legend','이 일정을 보여줄 그룹'));q('groups-event').replaceChildren(new Option('일정을 선택하세요',''));
  q('groups-nickname').value=q('groups-code').value=q('groups-name').value='';fillGroups();note('');q('quick-groups-status').textContent='';q('quick-groups-load').disabled=false;setBusy(false);
 }
 const client=window.DAYFLOW_SUPABASE_CLIENT;if(client){client.auth.onAuthStateChange((_event,session)=>window.setTimeout(()=>accountChanged(session),0));const version=epoch;client.auth.getSession().then(({data})=>{if(current(version))accountChanged(data?.session);}).catch(()=>{});}
 function autoRefresh(){if(dialog.open&&loggedIn()&&!document.hidden&&!busy)run(async version=>{await refreshDetail(version);note('그룹 일정을 다시 확인했습니다.');});}
 window.addEventListener('focus',autoRefresh);document.addEventListener('visibilitychange',()=>{if(document.hidden)q('groups-events').replaceChildren();else autoRefresh();});window.setInterval(autoRefresh,60000);
 window.DAYFLOW_GROUPS={open,prepare,complete,modeChanged};modeChanged();
})();
