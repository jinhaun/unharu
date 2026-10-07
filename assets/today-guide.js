(function(){
 'use strict';
 const core=window.UNHARU_GUIDE_CORE,q=id=>document.getElementById(id);
 const defaults=()=>({energy:'normal',availableMinutes:30,activeId:null,skippedIds:[]});
 let state=defaults(),day=core.nowParts().day,current=null,opener=null,pendingDefer=null;
 const summary=document.createElement('button');summary.type='button';summary.id='today-guide-summary';summary.setAttribute('aria-haspopup','dialog');summary.setAttribute('aria-controls','today-guide-dialog');
 summary.innerHTML='<span>오늘 도우미 · 지금 추천</span><strong id="guide-summary-title">오늘 할 일 확인 중</strong><small id="guide-summary-detail">에너지와 시간 선택하기 →</small>';
 document.querySelector('.weather-overview').after(summary);
 const dialog=document.createElement('dialog');dialog.id='today-guide-dialog';dialog.setAttribute('aria-labelledby','guide-title');
 dialog.innerHTML=`<header class="guide-heading"><div><p>오늘의 페이스에 맞춰</p><h2 id="guide-title">오늘 도우미</h2></div><button type="button" id="guide-close">닫기</button></header>
 <p class="guide-intro">오늘 내 할 일·회의와 에너지, 사용 가능한 시간을 비교합니다. 외부 AI 전송 없이 기기 안의 규칙으로 추천하며, 예상 시간은 실제와 다를 수 있습니다.</p>
 <div class="guide-controls"><fieldset><legend>지금 에너지는 어떤가요?</legend><div><button type="button" data-guide-energy="high">충분함</button><button type="button" data-guide-energy="normal">보통</button><button type="button" data-guide-energy="low">피곤함</button></div></fieldset>
 <fieldset><legend>지금 얼마나 쓸 수 있나요?</legend><div><button type="button" data-guide-time="10">10분</button><button type="button" data-guide-time="30">30분</button><button type="button" data-guide-time="60">1시간+</button></div></fieldset></div>
 <article class="guide-recommendation" aria-live="polite" aria-atomic="true"><p id="guide-status"></p><h3 id="guide-task-title"></h3><p id="guide-reason"></p><p id="guide-meta"></p></article>
 <div class="guide-actions" id="guide-actions"><button type="button" id="guide-start">시작할게요</button><button type="button" id="guide-complete">완료했어요</button><button type="button" id="guide-skip">다른 추천</button><button type="button" id="guide-defer">내일로 미루기</button></div>
 <p id="guide-action-status" role="status"></p>
 <section id="guide-defer-confirmation" hidden aria-label="내일로 이동 확인"><p id="guide-defer-question"></p><button type="button" id="guide-defer-cancel">취소</button> <button type="button" id="guide-defer-confirm">확인 후 내일로 이동</button></section>
 <div class="guide-next"><p><strong>그다음</strong><span id="guide-next"></span></p><p><strong>미루기 검토</strong><span id="guide-defer-preview"></span></p></div>
 <button type="button" id="guide-add">오늘 일정 추가하기</button>
 <details id="guide-completed"><summary id="guide-completed-count">오늘 완료한 일</summary><div id="guide-completed-list"></div></details>`;
 document.body.append(dialog);
 const menu=document.createElement('button');menu.type='button';menu.id='today-guide-menu';menu.textContent='오늘 도우미';menu.setAttribute('aria-haspopup','dialog');menu.setAttribute('aria-controls',dialog.id);q('calendar-menu').after(menu);
 const ready=()=>typeof IS_TEST_MODE!=='undefined'&&IS_TEST_MODE||Boolean(window.DAYFLOW_CLOUD?.ready());
 function refresh(){
  const today=core.nowParts().day;if(today!==day){day=today;state=defaults();pendingDefer=null;q('guide-defer-confirmation').hidden=true;}
  const result=core.recommend(ready()?items:[],state);current=result.item;
  if(result.cycled)state.skippedIds=[];
  if(!result.pending.some(x=>x.id===state.activeId))state.activeId=null;
  dialog.querySelectorAll('[data-guide-energy]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guideEnergy===state.energy)));
  dialog.querySelectorAll('[data-guide-time]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.guideTime)===state.availableMinutes)));
  const active=current&&current.id===state.activeId;
  q('guide-status').textContent=active?'진행 중':`오늘 남은 일정 ${result.pending.length}개 · 완료 ${result.completed.length}개`;
  q('guide-task-title').textContent=current?.title||(result.completed.length?'오늘 할 일을 모두 마쳤어요':'오늘 등록된 할 일이 없습니다');
  q('guide-reason').textContent=current?core.reason(current,state):'오늘 일정을 추가하면 현재 상태에 맞춰 추천해 드립니다.';
  q('guide-meta').textContent=current?`${window.DAYFLOW_TASK_TIME?.format(current)||current.time||'시간 미정'} · 약 ${core.duration(current)}분 예상`:'';
  q('guide-summary-title').textContent=q('guide-task-title').textContent;
  q('guide-summary-detail').textContent=current?`${active?'진행 중 · ':''}약 ${core.duration(current)}분 예상 · 추천 확인 →`:'에너지와 시간 선택하기 →';
  q('guide-actions').hidden=!current;
  q('guide-start').disabled=Boolean(active);q('guide-start').textContent=active?'진행 중이에요':'시작할게요';
  q('guide-next').textContent=result.next?`${result.next.title} · 약 ${core.duration(result.next)}분 예상`:'다음 추천이 없습니다.';
  q('guide-defer-preview').textContent=result.defer?`${result.defer.title} — 미뤄도 괜찮은지 직접 확인해 주세요.`:'미루기를 제안할 일정이 없습니다.';
  q('guide-completed-count').textContent=`오늘 완료한 일 ${result.completed.length}개`;
  q('guide-completed-list').replaceChildren();
  for(const item of result.completed){const row=document.createElement('div'),label=document.createElement('span'),undo=document.createElement('button');label.textContent=item.title;undo.type='button';undo.textContent='완료 취소';undo.addEventListener('click',()=>change(item.id,'undo'));row.append(label,undo);q('guide-completed-list').append(row);}
 }
 function open(event){opener=event.currentTarget;refresh();q('guide-action-status').textContent='';if(!dialog.open)dialog.showModal();}
 function change(id,action,confirmed=false){
  if(!ready())return;
  const record=items.find(x=>x.id===id&&x.date===core.nowParts().day&&['task','meeting'].includes(x.type));
  if(!record)return refresh();
  if(action==='defer'&&!confirmed){pendingDefer={id,date:record.date};q('guide-defer-question').textContent=`“${record.title}”을 내일(${core.tomorrow(record.date)})로 미룰까요?${core.important(record)?' 중요한 일정일 수 있습니다.':''} 반복 일정은 이 회차만 이동합니다. 이미 공유하거나 휴대폰 캘린더에 내보낸 일정은 별도로 확인해 주세요.`;q('guide-defer-confirmation').hidden=false;q('guide-defer-cancel').focus();return;}
  const previous={...record};
  if(action==='complete'){record.completed=true;record.completedAt=new Date().toISOString();}
  if(action==='undo'){record.completed=false;delete record.completedAt;}
  if(action==='defer')record.date=core.tomorrow(record.date);
  try{persist(action==='complete'?'완료 처리했습니다.':action==='undo'?'완료를 취소했습니다.':'선택한 일정 한 건을 내일로 미뤘습니다.');}
  catch{for(const key of Object.keys(record))delete record[key];Object.assign(record,previous);q('guide-action-status').textContent='저장하지 못했습니다. 변경 전 상태를 유지했습니다.';return;}
  state.activeId=null;state.skippedIds=state.skippedIds.filter(x=>x!==id);renderView();
  q('guide-action-status').textContent=action==='complete'?'완료했습니다. 아래 ‘오늘 완료한 일’에서 취소할 수 있습니다.':action==='undo'?'완료를 취소했습니다.':'내일로 이동했습니다. 공유 일정과 외부 캘린더는 별도 확인해 주세요.';
 }
 summary.addEventListener('click',open);menu.addEventListener('click',open);
 q('guide-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{pendingDefer=null;q('guide-defer-confirmation').hidden=true;opener?.focus();});
 q('guide-defer-cancel').addEventListener('click',()=>{pendingDefer=null;q('guide-defer-confirmation').hidden=true;q('guide-defer').focus();});
 q('guide-defer-confirm').addEventListener('click',()=>{const pending=pendingDefer;pendingDefer=null;q('guide-defer-confirmation').hidden=true;if(pending&&items.some(x=>x.id===pending.id&&x.date===pending.date&&!x.completed))change(pending.id,'defer',true);});
 dialog.querySelectorAll('[data-guide-energy]').forEach(b=>b.addEventListener('click',()=>{state.energy=b.dataset.guideEnergy;state.activeId=null;state.skippedIds=[];refresh();}));
 dialog.querySelectorAll('[data-guide-time]').forEach(b=>b.addEventListener('click',()=>{state.availableMinutes=Number(b.dataset.guideTime);state.activeId=null;state.skippedIds=[];refresh();}));
 q('guide-start').addEventListener('click',()=>{if(current){state.activeId=current.id;refresh();}});
 q('guide-complete').addEventListener('click',()=>{if(current)change(current.id,'complete');});
 q('guide-defer').addEventListener('click',()=>{if(current)change(current.id,'defer');});
 q('guide-skip').addEventListener('click',()=>{if(current){state.skippedIds.push(current.id);state.activeId=null;refresh();}});
 q('guide-add').addEventListener('click',()=>{dialog.close();openDayDetails(core.nowParts().day);});
 window.addEventListener('dayflow-sharing-account-change',()=>{state=defaults();dialog.close();q('guide-action-status').textContent='';refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 window.setInterval(()=>{if(!document.hidden)refresh();},60000);
 window.DAYFLOW_GUIDE={refresh};refresh();
})();
