(function(){
 'use strict';
 const q=id=>document.getElementById(id),core=window.UNHARU_COMMUTE_CORE;
 const box=document.createElement('div');box.className='commute-settings';
 box.innerHTML='<label for="commute-role">이동 구분</label><select id="commute-role"><option value="general">일반 이동</option><option value="outbound">출근</option><option value="return">퇴근·귀가</option></select><div id="commute-target-wrap" hidden><label for="commute-target">결합할 출근 기록</label><select id="commute-target"></select></div><p id="commute-help" role="status"></p>';
 q('transit-save-footer').prepend(box);
 function refresh(){
  const role=q('commute-role').value,date=q('quick-date').value||TODAY;
  const options=core.candidates(items,date),old=q('commute-target').value;
  const multiple=role==='return'&&options.length>1;q('commute-target-wrap').hidden=!multiple;
  q('commute-target').replaceChildren(new Option('출근 기록을 선택하세요',''));
  options.forEach(i=>q('commute-target').add(new Option(`${i.time||'시간 미정'} · ${i.transit.origin||''} → ${i.transit.destination||''} · ${formatMoney(i.amount)}`,i.id)));
  if(options.some(i=>i.id===old))q('commute-target').value=old;
  q('commute-help').textContent=role==='outbound'?'출근 한 건으로 저장합니다. 같은 날짜에 퇴근을 저장하면 한 건으로 결합됩니다.':role==='return'?(options.length===1?`${date} 출근 ${formatMoney(options[0].amount)}에 이번 퇴근 금액을 합칩니다.`:multiple?'같은 날짜의 출근 기록이 여러 개입니다. 연결할 기록을 선택하세요.':'같은 날짜에 출근으로 저장한 기록이 없어 퇴근 한 건으로 저장합니다.'):'기존과 같이 교통비 한 건으로 저장합니다. 이전 기록은 자동으로 바꾸지 않습니다.';
 }
 q('commute-role').addEventListener('change',refresh);q('quick-date').addEventListener('change',refresh);
 box.addEventListener('focusin',event=>{if(event.target===q('commute-role'))refresh();});
 window.addEventListener('dayflow-sharing-account-change',()=>{q('commute-role').value='general';q('commute-target').value='';refresh();});
 const previousReverse=window.DAYFLOW_TRANSIT.reverse;
 // Existing reverse button uses its own closure; this listener only selects the role.
 q('reverse-transit').addEventListener('click',()=>{q('commute-role').value='return';refresh();});
 window.DAYFLOW_TRANSIT.reverse=function(){previousReverse();q('commute-role').value='return';refresh();};
 window.DAYFLOW_COMMUTE={
  plan(incoming){return core.plan(items,incoming,q('commute-role').value,q('commute-role').value==='return'&&!q('commute-target-wrap').hidden?q('commute-target').value:'');},
  reset(){q('commute-role').value='general';q('commute-target').value='';refresh();},
  details(root,item){
   const legs=item.transit?.commuteLegs;if(!Array.isArray(legs))return false;
   const heading=document.createElement('h4');heading.textContent='출퇴근 상세 · 합계 '+formatMoney(item.amount);root.append(heading);
   legs.forEach((leg,index)=>{
    const section=document.createElement('section'),title=document.createElement('h4'),memo=document.createElement('p');
    section.className='trip-record-detail';title.textContent=`${index?'퇴근':'출근'} · ${leg.time||'시간 미정'} · ${formatMoney(leg.amount)} · ${window.DAYFLOW_TRANSIT.basisLabel(leg.transit.amountBasis)}`;
    memo.textContent=leg.notes||'';section.append(title,memo);window.DAYFLOW_TRANSIT.appendDetails(section,leg);root.append(section);
   });
   const total=legs.reduce((sum,l)=>sum+l.amount,0);
   if(total!==item.amount){const p=document.createElement('p');p.textContent=`전체 금액이 수정되었습니다. 구간별 금액은 결합 당시 내역(${formatMoney(total)})이며 소비 집계는 현재 전체 금액(${formatMoney(item.amount)})을 사용합니다.`;root.append(p);}
   return true;
  }
 };
 refresh();
})();
