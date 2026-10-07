(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_SHARING_CORE,client=()=>window.DAYFLOW_SUPABASE_CLIENT;
 const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 let owner='',epoch=0,mineSequence=0,lookupSequence=0,lookupEmail='',incoming=[],published=new Set(),ready=false,busy=false;
 detailLabels.shared='다른 사람 일정 · 읽기 전용';
 const managerButton=make('button','내 일정 공유 설정'),lookupButton=make('button','다른 사람 일정');
 managerButton.type=lookupButton.type='button';managerButton.id='sharing-menu';lookupButton.id='sharing-inbox-menu';q('calendar-menu').after(managerButton,lookupButton);
 const manager=make('dialog');manager.id='sharing-dialog';manager.setAttribute('aria-labelledby','sharing-title');
 manager.innerHTML=`<div class="dialog-head"><h2 id="sharing-title">내 일정 공유 설정</h2><button id="sharing-close" type="button" class="close-button" aria-label="공유 설정 닫기">×</button></div><div class="sharing-body">
 <p>공유한 일정은 <strong>운하루에 Google 로그인한 사람이 내 이메일을 입력하면 누구나</strong> 볼 수 있습니다. 공유하지 않은 일정·소비·교통·입력 원문은 보이지 않습니다.</p>
 <label for="publication-event">공유 여부를 바꿀 내 일정</label><select id="publication-event"></select><div id="publication-preview" class="sharing-preview"></div>
 <label class="publication-toggle"><input id="publication-enabled" type="checkbox"> 이 일정 공유</label><p>제목·날짜·시간·메모를 읽기 전용으로 보여줍니다. 공유 중 내용을 수정하면 바뀐 내용도 보입니다. 반복 일정은 선택한 날짜의 한 건만 적용합니다.</p>
 <button id="publication-save" type="button" disabled>공유 설정 저장</button><p id="publication-status" role="status"></p><button id="publication-refresh" type="button">공유 상태 새로고침</button></div>`;
 const lookup=make('dialog');lookup.id='sharing-inbox';lookup.setAttribute('aria-labelledby','lookup-title');
 lookup.innerHTML=`<div class="dialog-head"><h2 id="lookup-title">다른 사람 일정</h2><button id="lookup-close" type="button" class="close-button" aria-label="다른 사람 일정 닫기">×</button></div><div class="sharing-body">
 <p>운하루를 이용한 사람의 Google 이메일을 입력하세요. 상대방이 ‘공유’를 선택한 일정만 볼 수 있습니다. 사람 등록이나 승인 요청은 필요하지 않습니다.</p>
 <form id="lookup-form"><label for="lookup-email">보고 싶은 사람의 이메일</label><input id="lookup-email" type="email" required maxlength="320" autocomplete="off" placeholder="person@gmail.com"><button id="lookup-submit" type="submit">공유 일정 보기</button></form>
 <p id="lookup-status" role="status" aria-live="polite"></p><div id="lookup-results"></div><button id="lookup-refresh" type="button" disabled>다시 확인</button><button id="lookup-clear" type="button">보기 종료</button>
 <p class="sharing-hint">조회된 일정은 내 캘린더의 ‘전체’ 보기에도 함께 표시되며 내 소비 합계에는 포함되지 않습니다. 화면 복귀·1분 간격으로 다시 확인합니다. 공유 해제 후 새 조회에서는 보이지 않지만 이미 읽거나 복사한 내용은 회수할 수 없습니다.</p></div>`;
 document.body.append(manager,lookup);
 const note=(text,error=false)=>{q('publication-status').textContent=text;q('publication-status').dataset.error=String(error);};
 function display(){renderView();const day=q('day-details-dialog');if(day?.open&&day.dataset.date)openDayDetails(day.dataset.date);}
 function selected(){return items.find(item=>item.id===q('publication-event').value&&core.canShare(item));}
 function setBusy(value){busy=value;['publication-event','publication-refresh'].forEach(id=>q(id).disabled=value);q('publication-enabled').disabled=value||!ready||!selected();q('publication-save').disabled=value||!ready||!selected();}
 function renderSelection(){const item=selected(),root=q('publication-preview');root.replaceChildren();if(item)root.append(make('strong',item.title),make('p',`${item.date||'날짜 미정'} · ${item.time||'시간 미정'}`),make('p',item.notes||'메모 없음'));q('publication-enabled').checked=!!item&&published.has(item.id);setBusy(busy);}
 async function loadMine(preferred=''){
  const version=epoch,sequence=++mineSequence;if(!owner||!client())return;ready=false;setBusy(true);note('공유 상태를 확인하고 있습니다…');
  try{const result=await client().from('dayflow_published_events').select('event_id').eq('owner_id',owner);if(version!==epoch||sequence!==mineSequence)return;if(result.error)throw result.error;
   published=new Set((result.data||[]).map(row=>row.event_id));q('publication-event').replaceChildren(new Option('일정을 선택하세요',''));
   items.filter(core.canShare).sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(item=>q('publication-event').add(new Option(`${published.has(item.id)?'[공유] ':''}${item.date||'날짜 미정'} · ${item.title}`,item.id)));
   if(items.some(item=>item.id===preferred&&core.canShare(item)))q('publication-event').value=preferred;
   ready=true;renderSelection();note('선택한 일정의 공유 여부를 바꾸고 저장해 주세요.');
  }catch(error){if(version===epoch&&sequence===mineSequence){published.clear();q('publication-enabled').checked=false;note(core.errorText(error),true);}}
  finally{if(version===epoch&&sequence===mineSequence)setBusy(false);}
 }
 async function open(eventId=''){if(!owner||!window.DAYFLOW_CLOUD?.ready()){showToast('로그인 필요','Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.');return;}if(!manager.open)manager.showModal();q('sharing-close').focus();await loadMine(typeof eventId==='string'?eventId:'');}
 managerButton.addEventListener('click',()=>open());q('sharing-close').addEventListener('click',()=>manager.close());q('publication-event').addEventListener('change',renderSelection);q('publication-refresh').addEventListener('click',()=>loadMine(q('publication-event').value));
 q('publication-save').addEventListener('click',async()=>{
  const item=selected(),shared=q('publication-enabled').checked,version=epoch;if(!item||!ready||busy)return;
  if(!confirm(shared?`운하루에 로그인하고 내 이메일을 아는 누구나 아래 내용을 볼 수 있습니다.\n\n${item.title}\n${item.date||'날짜 미정'} ${item.time||'시간 미정'}\n${item.notes||'메모 없음'}\n\n이 일정을 공유할까요?`:`“${item.title}”의 이메일 조회 공유를 해제할까요?`))return;
  setBusy(true);note('공유 설정을 저장하고 있습니다…');
  try{if(shared&&!await window.DAYFLOW_CLOUD.flush())throw Error('Save not confirmed');if(version!==epoch)return;const result=await client().rpc('dayflow_set_event_published',{p_event_id:item.id,p_shared:shared});if(version!==epoch)return;if(result.error)throw result.error;await loadMine(item.id);if(version===epoch&&ready)note(shared?'이 일정을 이메일로 조회할 수 있도록 공유했습니다.':'공유를 해제했습니다. 다음 조회부터 보이지 않습니다.');}
  catch(error){if(version===epoch){ready=false;note('공유 설정 완료를 확인하지 못했습니다. 새로고침으로 현재 상태를 확인해 주세요.',true);}}
  finally{if(version===epoch)setBusy(false);}
 });
 function renderResults(){const root=q('lookup-results');root.replaceChildren();incoming.forEach(item=>{const card=make('article');card.className='shared-card';card.append(make('h3',item.title),make('p',`${item.date||'날짜 미정'} · ${item.time||'시간 미정'} · 읽기 전용`),make('p',item.notes||'메모 없음'));root.append(card);});lookupButton.textContent=incoming.length?`다른 사람 일정 · ${incoming.length}건`:'다른 사람 일정';display();}
 function clearResults(){lookupSequence++;lookupEmail='';incoming=[];q('lookup-submit').disabled=false;q('lookup-refresh').disabled=true;renderResults();}
 async function search(email=lookupEmail){
  if(!owner||!window.DAYFLOW_CLOUD?.ready()){clearResults();q('lookup-status').textContent='Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.';return;}
  const clean=core.email(email);if(!clean){clearResults();q('lookup-status').textContent='조회할 Google 이메일을 정확히 입력해 주세요.';return;}
  const version=epoch,sequence=++lookupSequence;lookupEmail=clean;incoming=[];renderResults();q('lookup-submit').disabled=true;q('lookup-refresh').disabled=true;q('lookup-status').textContent='공유된 일정만 확인하고 있습니다…';
  try{const result=await client().rpc('dayflow_lookup_calendar',{p_email:clean});if(version!==epoch||sequence!==lookupSequence)return;if(result.error)throw result.error;
   incoming=(result.data||[]).map(core.normalize).filter(Boolean).sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time));renderResults();
   q('lookup-status').textContent=incoming.length?`${clean} · 공유 일정 ${incoming.length}건`:'조회할 공유 일정이 없습니다. 상대방의 이메일과 공유 여부를 확인해 주세요.';
  }catch(error){if(version===epoch&&sequence===lookupSequence){incoming=[];renderResults();q('lookup-status').textContent='공유 일정을 확인하지 못했습니다. 연결과 로그인 상태를 확인한 뒤 다시 시도해 주세요.';}}
  finally{if(version===epoch&&sequence===lookupSequence){q('lookup-submit').disabled=false;q('lookup-refresh').disabled=!lookupEmail;}}
 }
 q('lookup-form').addEventListener('submit',event=>{event.preventDefault();search(q('lookup-email').value);});q('lookup-email').addEventListener('input',()=>{clearResults();q('lookup-status').textContent='이메일을 입력한 뒤 공유 일정 보기를 눌러 주세요.';});
 q('lookup-refresh').addEventListener('click',()=>search());q('lookup-clear').addEventListener('click',()=>{clearResults();q('lookup-email').value='';q('lookup-status').textContent='다른 사람 일정 보기를 종료했습니다.';});
 lookupButton.addEventListener('click',()=>{if(!lookup.open)lookup.showModal();q('lookup-email').focus();});q('lookup-close').addEventListener('click',()=>lookup.close());
 function sessionChanged(session){const next=session?.user?.id||'';if(next===owner)return;epoch++;mineSequence++;owner=next;ready=false;published.clear();clearResults();manager.close();lookup.close();q('lookup-email').value='';q('lookup-status').textContent='';q('publication-event').replaceChildren();q('publication-preview').replaceChildren();note('');setBusy(false);window.dispatchEvent(new Event('dayflow-sharing-account-change'));}
 const api=client();if(api){api.auth.onAuthStateChange((_event,session)=>window.setTimeout(()=>sessionChanged(session),0));const initialEpoch=epoch;api.auth.getSession().then(({data})=>{if(initialEpoch===epoch)sessionChanged(data?.session);}).catch(()=>{if(initialEpoch===epoch)sessionChanged(null);});}
 window.addEventListener('focus',()=>{if(lookupEmail)search();});document.addEventListener('visibilitychange',()=>{if(document.hidden){lookupSequence++;incoming=[];renderResults();q('lookup-submit').disabled=false;q('lookup-refresh').disabled=!lookupEmail;}else if(lookupEmail)search();});window.setInterval(()=>{if(lookupEmail&&owner&&!document.hidden)search();},60000);
 window.DAYFLOW_SHARING={received:()=>incoming,open,account:()=>owner,refresh:()=>search()};
})();
