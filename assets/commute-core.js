(function(root){
 'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v));
 const valid=v=>Number.isSafeInteger(v)&&v>=0&&v%10===0;
 function candidates(items,date){return items.filter(i=>i.type==='expense'&&i.date===date&&i.transit&&i.transit.commuteRole==='outbound'&&!i.transit.commuteLegs&&valid(i.amount));}
 function plan(items,incoming,role,targetId=''){
  if(!incoming.transit||!valid(incoming.amount))throw Error('교통비 금액을 확인해 주세요.');
  if(items.some(i=>i.id===incoming.id||i.transit?.commuteLegs?.some(l=>l.id===incoming.id)))throw Error('이미 저장된 이동입니다.');
  const trip=copy(incoming);trip.transit.commuteRole=role;
  if(role!=='outbound'&&role!=='return')return {items:[...items,trip],saved:trip,merged:false};
  if(role==='outbound'){trip.title='출근 교통비';return {items:[...items,trip],saved:trip,merged:false};}
  const choices=candidates(items,trip.date);
  const outbound=targetId?choices.find(i=>i.id===targetId):choices.length===1?choices[0]:null;
  if((targetId&&!outbound)||(!targetId&&choices.length>1))throw Error('결합할 출근 기록을 선택해 주세요.');
  if(!outbound){trip.title='퇴근 교통비';return {items:[...items,trip],saved:trip,merged:false};}
  const total=outbound.amount+trip.amount;if(!valid(total))throw Error('합계 금액을 확인해 주세요.');
  const legs=[copy(outbound),trip],reference=legs.every(l=>valid(l.transit.referenceFare))?legs.reduce((n,l)=>n+l.transit.referenceFare,0):null;
  const saved={...copy(outbound),title:'출퇴근 교통비',amount:total,category:'교통',
   notes:legs.map((l,i)=>`${i?'퇴근':'출근'}${l.time?' '+l.time:''}${l.notes?' · '+l.notes:''}`).join('\n'),
   transit:{version:4,commuteRole:'paired',commuteLegs:legs,referenceFare:reference,
    amountBasis:legs.every(l=>l.transit.amountBasis==='confirmed')?'confirmed':'estimated'}};
  return {items:items.map(i=>i.id===outbound.id?saved:i),saved,merged:true};
 }
 function edit(items,updated,role,targetId=''){
  const original=items.find(i=>i.id===updated.id);
  if(!original)throw Error('수정할 기록을 찾지 못했습니다. 다시 열어 주세요.');
  const replace=()=>({items:items.map(i=>i.id===updated.id?copy(updated):i),saved:copy(updated),merged:false});
  if(original.transit?.commuteLegs){
   if(role!=='paired')throw Error('이미 결합된 출퇴근 기록입니다.');
   return replace();
  }
  if(updated.type!=='expense'||(!updated.transit&&updated.category!=='교통'))return replace();
  if(!['general','outbound','return'].includes(role))throw Error('이동 구분을 확인해 주세요.');
  if(role==='general'){
   const result=replace();if(result.saved.transit)result.saved.transit.commuteRole='general';
   result.items=result.items.map(i=>i.id===updated.id?result.saved:i);return result;
  }
  const trip=copy(updated);
  if(!trip.transit)trip.transit={source:'manual',amountBasis:'confirmed',referenceFare:trip.amount,steps:[]};
  trip.transit.originalTitle=original.transit?.originalTitle||original.title;
  const result=plan(items.filter(i=>i.id!==updated.id),trip,role,targetId);
  if(!result.merged)result.items=items.map(i=>i.id===updated.id?result.saved:i);
  return result;
 }
 root.UNHARU_COMMUTE_CORE={candidates,plan,edit};
})(typeof window==='undefined'?globalThis:window);
