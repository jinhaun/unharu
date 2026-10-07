(function(){
  'use strict';
  const core=window.UNHARU_SHARING_CORE,q=id=>document.getElementById(id);
  let userId='',epoch=0,contacts=[],grants=[],incoming=[],busy=false,managerReady=false,refreshSequence=0;
  detailLabels.shared='공유받음 · 읽기 전용';
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const manageButton=make('button','일정 공유 관리');manageButton.type='button';manageButton.id='sharing-menu';
  const inboxButton=make('button','공유받은 일정');inboxButton.type='button';inboxButton.id='sharing-inbox-menu';
  q('calendar-menu').after(manageButton,inboxButton);
  const dialog=make('dialog');dialog.id='sharing-dialog';dialog.setAttribute('aria-labelledby','sharing-title');
  dialog.innerHTML=`<div class="dialog-head"><h2 id="sharing-title">일정 공유 관리</h2><button type="button" id="sharing-close" aria-label="공유 관리 닫기" class="close-button">×</button></div>
  <div class="sharing-body"><p>등록한 Google 계정에 선택한 일정의 <strong>제목·날짜·시간·메모</strong>만 보여줍니다. 상대는 수정·삭제할 수 없습니다. 소비·교통·입력 원문은 공유하지 않습니다.</p>
  <section><h3>1. 공유할 사람 등록</h3><form id="sharing-contact-form"><label for="sharing-email">상대방의 Google 이메일</label><input id="sharing-email" type="email" autocomplete="off" maxlength="320" required placeholder="friend@gmail.com"><button id="sharing-add-contact" type="submit">사람 등록</button></form><p class="sharing-hint">상대방이 <a href="https://unharu.vercel.app/" target="_blank" rel="noopener">나다운하루</a>에 Google 로그인을 한 번 완료해야 합니다. 사람 등록만으로 일정이 공유되거나 이메일이 발송되지는 않습니다.</p><div id="sharing-contacts"></div></section>
  <section><h3>2. 일정과 사람 선택</h3><label for="sharing-event">공유할 내 일정</label><select id="sharing-event"></select><div id="sharing-preview" class="sharing-preview"></div><fieldset id="sharing-recipients"><legend>이 일정에 접근할 수 있는 사람</legend><div id="sharing-checks"></div></fieldset><button type="button" id="sharing-save" disabled>선택한 사람에게 공유</button><button type="button" id="sharing-revoke" disabled>이 일정 공유 모두 해제</button><p class="sharing-hint">반복 일정도 선택한 날짜의 한 건만 공유합니다. 공유 중인 제목·날짜·시간·메모를 수정하면 상대에게도 바뀐 내용이 보입니다.</p></section>
  <p id="sharing-status" role="status" aria-live="polite"></p><button type="button" id="sharing-refresh">공유 설정 새로고침</button></div>`;
  const inbox=make('dialog');inbox.id='sharing-inbox';inbox.setAttribute('aria-labelledby','sharing-inbox-title');
  inbox.innerHTML=`<div class="dialog-head"><h2 id="sharing-inbox-title">공유받은 일정</h2><button id="sharing-inbox-close" type="button" class="close-button" aria-label="공유받은 일정 닫기">×</button></div><div class="sharing-body"><p>나에게 허용된 일정만 표시합니다. 수정·삭제는 공유한 사람만 할 수 있습니다. 내 소비 합계에는 포함되지 않습니다.</p><p>화면에 돌아오거나 1분마다 권한을 다시 확인합니다. 공유 해제 이후 새 조회에서는 보이지 않지만, 이미 읽거나 따로 저장한 내용까지 회수할 수는 없습니다.</p><button type="button" id="sharing-inbox-refresh">받은 일정 새로고침</button><p id="sharing-inbox-status" role="status"></p><div id="sharing-inbox-list"></div></div>`;
  document.body.append(dialog,inbox);
  const status=(text,error=false)=>{q('sharing-status').textContent=text;q('sharing-status').dataset.state=error?'error':'';};
  const client=()=>window.DAYFLOW_SUPABASE_CLIENT;
  function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const id of ['sharing-add-contact','sharing-refresh','sharing-event'])q(id).disabled=value;dialog.querySelectorAll('#sharing-checks input,#sharing-contacts button').forEach(el=>el.disabled=value||!managerReady);renderActions();}
  function refreshDisplay(){renderView();const detail=q('day-details-dialog');if(detail?.open&&detail.dataset.date)openDayDetails(detail.dataset.date);}
  function currentItem(){return items.find(i=>i.id===q('sharing-event').value&&core.canShare(i));}
  function renderActions(){const disabled=busy||!managerReady||!currentItem();q('sharing-save').disabled=disabled;q('sharing-revoke').disabled=disabled;}
  function renderSelection(){
    const item=currentItem(),root=q('sharing-preview');root.replaceChildren();
    if(item){root.append(make('strong',item.title),make('p',`${item.date||'날짜 미정'} · ${item.time||'시간 미정'}`),make('p',item.notes||'메모 없음'));}
    const checks=q('sharing-checks');checks.replaceChildren();
    if(!contacts.length)checks.append(make('p','먼저 공유할 사람을 등록해 주세요.'));
    contacts.forEach(c=>{
      const label=make('label'),input=make('input');input.type='checkbox';input.value=c.recipient_id;
      input.checked=grants.some(g=>g.event_id===item?.id&&g.recipient_id===c.recipient_id);input.disabled=!managerReady||busy;
      label.append(input,make('span',c.email));checks.append(label);
    });renderActions();
  }
  function renderManager(preferred=q('sharing-event').value){
    const choices=items.filter(core.canShare).sort((a,b)=>`${b.date||''} ${b.time||''}`.localeCompare(`${a.date||''} ${a.time||''}`));
    q('sharing-event').replaceChildren(new Option(choices.length?'일정을 선택하세요':'공유할 일정이 없습니다',''));
    choices.forEach(item=>q('sharing-event').add(new Option(`${item.date||'날짜 미정'} · ${item.title}`,item.id)));
    if(choices.some(i=>i.id===preferred))q('sharing-event').value=preferred;
    const list=q('sharing-contacts');list.replaceChildren();
    contacts.forEach(c=>{
      const row=make('div'),remove=make('button','등록 해제');row.className='sharing-contact';remove.type='button';remove.disabled=busy;
      remove.setAttribute('aria-label',c.email+' 공유 대상 등록 해제');
      remove.addEventListener('click',async()=>{
        if(busy||!confirm(`${c.email} 등록을 해제하면 이 사람에게 허용했던 모든 일정 공유도 해제됩니다. 진행할까요?`))return;
        await mutate(()=>client().from('dayflow_share_contacts').delete().eq('owner_id',userId).eq('recipient_id',c.recipient_id),'공유 대상과 해당 사람의 공유 권한을 해제했습니다.');
      });row.append(make('span',c.email),remove);list.append(row);
    });renderSelection();
  }
  async function loadManager(preferred){
    const version=epoch;if(!userId||!client())return false;
    managerReady=false;setBusy(true);status('공유 설정을 확인하고 있습니다…');
    try{
      const [a,b]=await Promise.all([client().from('dayflow_share_contacts').select('recipient_id,email').eq('owner_id',userId).order('created_at'),client().from('dayflow_event_shares').select('event_id,recipient_id').eq('owner_id',userId)]);
      if(version!==epoch)return false;if(a.error||b.error)throw a.error||b.error;
      contacts=a.data||[];grants=b.data||[];managerReady=true;setBusy(false);renderManager(preferred);status('공유할 일정과 사람을 선택해 주세요. 선택 후 저장해야 적용됩니다.');return true;
    }catch(e){if(version===epoch){contacts=[];grants=[];status(core.errorText(e),true);renderManager(preferred);}return false;}
    finally{if(version===epoch)setBusy(false);}
  }
  async function mutate(operation,message){
    const version=epoch;setBusy(true);status('변경 사항을 저장하고 있습니다…');
    try{
      const reply=await operation();if(version!==epoch)return;if(reply.error)throw reply.error;
      const selected=q('sharing-event').value;if(await loadManager(selected))status(message);
    }catch(e){if(version===epoch){managerReady=false;status(core.errorText(e),true);}}
    finally{if(version===epoch)setBusy(false);}
  }
  async function open(eventId){
    if(!userId||!window.DAYFLOW_CLOUD?.ready()){showToast('공유 준비','Google 로그인 후 내 기록을 불러온 다음 이용해 주세요.');return;}
    if(!dialog.open)dialog.showModal();q('sharing-close').focus();await loadManager(typeof eventId==='string'?eventId:'');
  }
  q('sharing-contact-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const value=core.email(q('sharing-email').value);
    if(!value){status('올바른 Google 이메일을 입력해 주세요.',true);return;}
    await mutate(()=>client().rpc('dayflow_add_share_contact',{p_email:value}),'사람을 등록했습니다. 아직 일정은 공유하지 않았습니다.');
  });
  async function saveSharing(revoke){
    const item=currentItem();if(busy||!managerReady||!item)return;
    const selected=revoke?[]:[...q('sharing-checks').querySelectorAll('input:checked')].map(el=>el.value);
    const emails=contacts.filter(c=>selected.includes(c.recipient_id)).map(c=>c.email);
    const copy=selected.length?`${emails.join(', ')}에게 아래 내용을 공유합니다.\n\n${item.title}\n${item.date||'날짜 미정'} ${item.time||'시간 미정'}\n${item.notes||'메모 없음'}\n\n이후 이 일정의 수정 내용도 보입니다. 적용할까요?`:`“${item.title}”의 모든 공유 권한을 해제할까요?`;
    if(!confirm(copy))return;
    const version=epoch;
    await mutate(async()=>{
      if(!await window.DAYFLOW_CLOUD.flush())throw new Error('Private record not saved');
      if(version!==epoch)throw new Error('Account changed');
      return client().rpc('dayflow_set_event_sharing',{p_event_id:item.id,p_recipients:selected});
    },selected.length?`${selected.length}명에게 선택한 일정을 공유했습니다.`:'이 일정의 공유를 모두 해제했습니다.');
  }
  q('sharing-save').addEventListener('click',()=>saveSharing(false));q('sharing-revoke').addEventListener('click',()=>saveSharing(true));
  q('sharing-event').addEventListener('change',renderSelection);q('sharing-refresh').addEventListener('click',()=>loadManager(q('sharing-event').value));
  q('sharing-close').addEventListener('click',()=>dialog.close());manageButton.addEventListener('click',()=>open());
  function renderInbox(){
    const root=q('sharing-inbox-list');root.replaceChildren();
    if(!incoming.length)root.append(make('p','현재 표시할 공유 일정이 없습니다.'));
    incoming.forEach(item=>{const article=make('article');article.className='shared-card';article.append(make('h3',item.title),make('p',`${item.date||'날짜 미정'} · ${item.time||'시간 미정'} · 읽기 전용`),make('p',item.notes||'메모 없음'));root.append(article);});
    inboxButton.textContent=`공유받은 일정 · ${incoming.length}건`;
  }
  async function refreshInbox(){
    const version=epoch,sequence=++refreshSequence;if(!userId||!client()||document.hidden)return;
    try{
      const result=await client().rpc('dayflow_received_events');if(version!==epoch||sequence!==refreshSequence)return;if(result.error)throw result.error;
      incoming=(result.data||[]).map(core.normalize).filter(Boolean).sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      q('sharing-inbox-status').textContent='서버에서 공유 권한을 확인했습니다.';renderInbox();refreshDisplay();
    }catch(e){if(version===epoch&&sequence===refreshSequence){incoming=[];renderInbox();refreshDisplay();q('sharing-inbox-status').textContent=core.errorText(e);inboxButton.textContent='공유받은 일정 · 연결 확인';}}
  }
  inboxButton.addEventListener('click',()=>{if(!inbox.open)inbox.showModal();q('sharing-inbox-close').focus();refreshInbox();});
  q('sharing-inbox-close').addEventListener('click',()=>inbox.close());q('sharing-inbox-refresh').addEventListener('click',refreshInbox);
  function clear(){epoch++;refreshSequence++;userId='';incoming=[];contacts=[];grants=[];managerReady=false;setBusy(false);dialog.close();inbox.close();renderInbox();refreshDisplay();}
  function sessionChanged(session){const next=session?.user?.id||'';if(next===userId)return;clear();userId=next;window.dispatchEvent(new Event('dayflow-sharing-account-change'));if(userId)refreshInbox();}
  const api=client();
    if(api){api.auth.onAuthStateChange((_event,session)=>{window.setTimeout(()=>sessionChanged(session),0);});const initialEpoch=epoch;api.auth.getSession().then(({data})=>{if(epoch===initialEpoch)sessionChanged(data?.session);}).catch(()=>{if(epoch===initialEpoch)clear();});}
  window.addEventListener('focus',()=>refreshInbox());document.addEventListener('visibilitychange',()=>{if(document.hidden){refreshSequence++;incoming=[];renderInbox();refreshDisplay();}else refreshInbox();});
  window.setInterval(()=>{if(userId&&!document.hidden)refreshInbox();},60000);
  window.DAYFLOW_SHARING={received:()=>incoming,open,refresh:refreshInbox,account:()=>userId};
})();
