(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_COMMUTE_CORE;
 const field=document.createElement('div');field.className='field full commute-settings';field.id='edit-commute-field';field.hidden=true;
 field.innerHTML='<label for="edit-commute-role">이동 구분</label><select id="edit-commute-role" aria-describedby="edit-commute-help"><option value="general">일반 이동</option><option value="outbound">출근</option><option value="return">퇴근·귀가</option><option value="paired" hidden>출퇴근 결합 기록</option></select><div id="edit-commute-target-wrap" hidden><label for="edit-commute-target">결합할 출근 기록</label><select id="edit-commute-target"></select></div><p id="edit-commute-help" role="status"></p>';
 q('edit-trip-field').after(field);
 const error=document.createElement('p');error.id='edit-save-error';error.setAttribute('role','alert');error.tabIndex=-1;error.style.color='#b42318';field.after(error);
 function refresh(){
  const original=items.find(i=>i.id===q('edit-id').value);
  field.hidden=!(original&&q('edit-type').value==='expense'&&(original.transit||q('edit-category').value==='교통'));
  const paired=Boolean(original?.transit?.commuteLegs),role=q('edit-commute-role').value;
  q('edit-commute-role').disabled=paired;
  const options=core.candidates(items.filter(i=>i.id!==original?.id),q('edit-date').value),old=q('edit-commute-target').value;
  q('edit-commute-target').replaceChildren(new Option('출근 기록을 선택하세요',''));
  options.forEach(i=>q('edit-commute-target').add(new Option(`${i.time||'시간 미정'} · ${i.transit.originalTitle||i.title} · ${formatMoney(i.amount)}`,i.id)));
  if(options.some(i=>i.id===old))q('edit-commute-target').value=old;
  q('edit-commute-target-wrap').hidden=paired||role!=='return'||options.length<2;
  q('edit-commute-help').textContent=paired?'이미 한 건으로 결합된 기록입니다. 두 이동의 원본은 위 상세에 남아 있습니다.':role==='outbound'?'출근으로 저장한 다음, 같은 날짜의 퇴근 기록을 수정해 ‘퇴근·귀가’를 선택해 주세요.':role==='return'?(options.length===1?`저장하면 같은 날짜의 출근 ${formatMoney(options[0].amount)}과 이 기록을 한 건으로 합칩니다. 금액을 바꾸지 않으면 소비 총액은 그대로입니다.`:options.length>1?'연결할 출근 기록을 선택하세요. 저장 시 두 건을 한 건으로 합칩니다.':'같은 날짜의 출근 기록이 없습니다. 퇴근 한 건으로 유지됩니다.'):'이 기록만 수정합니다. 다른 교통비와 합치지 않습니다.';
 }
 for(const id of ['edit-commute-role','edit-date','edit-type','edit-category'])q(id).addEventListener('change',()=>{error.textContent='';refresh();});
 window.DAYFLOW_COMMUTE_EDIT={
  open(item){error.textContent='';q('edit-commute-role').value=item.transit?.commuteLegs?'paired':item.transit?.commuteRole||'general';q('edit-commute-target').value='';refresh();},
  plan(item){return core.edit(items,item,field.hidden?(item.transit?.commuteLegs?'paired':'general'):q('edit-commute-role').value,!q('edit-commute-target-wrap').hidden?q('edit-commute-target').value:'');},
  error(message){error.textContent=message;error.focus();}
 };
})();
