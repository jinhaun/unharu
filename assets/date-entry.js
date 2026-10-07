(function(){
 'use strict';
 const q=id=>document.getElementById(id),dialog=q('day-details-dialog'),capture=document.querySelector('.capture'),records=q('day-details-list');
 const shell=document.createElement('section');shell.className='card capture-shell';shell.id='capture-shell';
 const homeHead=document.createElement('div');homeHead.className='capture-shell-head';
 const homeTitle=document.createElement('h2');homeTitle.textContent='일정 추가';
 const fold=document.createElement('button');fold.type='button';fold.id='capture-fold';fold.setAttribute('aria-controls','capture-home-body');
 const summary=document.createElement('p');summary.textContent='달력에서 날짜를 누르거나 펼치기로 바로 입력하세요.';
 const home=document.createElement('div');home.id='capture-home-body';capture.before(shell);homeHead.append(homeTitle,fold);shell.append(homeHead,summary,home);
 let expanded=false;
 function homeView(){shell.dataset.collapsed=String(!expanded);fold.textContent=expanded?'접기':'펼치기';fold.setAttribute('aria-expanded',String(expanded));summary.hidden=expanded;home.hidden=!expanded;capture.hidden=!expanded;}
 const actions=document.createElement('div');actions.className='date-entry-switch';actions.setAttribute('role','group');actions.setAttribute('aria-label','선택한 날짜 작업');
 const add=document.createElement('button');add.type='button';add.id='day-entry-add';add.textContent='일정 추가';
 const view=document.createElement('button');view.type='button';view.id='day-entry-records';view.textContent='이날 기록 보기';
 actions.append(add,view);q('day-details-summary').after(actions);home.append(capture);
 capture.classList.add('date-entry-capture');
 const hint=document.createElement('p');hint.className='calendar-entry-hint';hint.textContent='날짜를 누르면 그날의 일정을 입력하거나 기록을 확인할 수 있습니다.';
 document.querySelector('.calendar-head').after(hint);
 const shortcut=document.createElement('button');shortcut.type='button';shortcut.id='calendar-add-event';shortcut.className='today-button';shortcut.textContent='일정 추가';
 document.querySelector('.calendar-head').append(shortcut);
 let selected='',mode='add';
 function show(next){
  mode=next;capture.hidden=next!=='add';records.hidden=next!=='records';
  add.setAttribute('aria-pressed',String(next==='add'));view.setAttribute('aria-pressed',String(next==='records'));
 }
 add.addEventListener('click',()=>{q('quick-date').value=selected;show('add');q('quick-input').focus();});
 view.addEventListener('click',()=>show('records'));
 fold.addEventListener('click',()=>{if(dialog.open)return;expanded=!expanded;homeView();if(expanded)q('quick-input').focus();});
 dialog.addEventListener('close',()=>{home.append(capture);fold.disabled=false;homeView();});
 shortcut.addEventListener('click',()=>openDayDetails(window.UNHARU_SHARING_CORE?.twoWeekRange().today||TODAY));
 q('quick-date').addEventListener('change',()=>{
  if(!dialog.open)return;
  if(!q('quick-date').value){q('quick-date').value=selected;return;}
  const key=q('quick-date').value;
  if(key!==selected){selected=key;openDayDetails(key);}
 });
 window.DAYFLOW_DATE_ENTRY={
  open(key){
   actions.after(capture);fold.disabled=true;
   if(!dialog.open||key!==selected){selected=key;q('quick-date').value=key;show('add');}
  },
  saved(key){
   if(!dialog.open)return;
   selected=key;q('quick-date').value=key;openDayDetails(key);
   if(q('quick-share-status')?.dataset.error!=='true')show('records');
  }
 };
 // Preserve an unsaved draft when the dialog is closed; no record is written by opening a date.
 homeView();
})();
