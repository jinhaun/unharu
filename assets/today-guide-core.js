(function(root){
 'use strict';
 function clock(value){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value||''))return null;const [h,m]=value.split(':').map(Number);return h*60+m;}
 function nowParts(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
 }
 function duration(item){
  const start=clock(item.time),end=clock(item.endTime);
  if(!item.endTimeUnknown&&start!==null&&end!==null&&end>start)return end-start;
  const text=`${item.title||''} ${item.notes||''} ${item.raw||''}`;
  const hours=text.match(/(\d+(?:\.\d+)?)\s*시간/),minutes=text.match(/(\d+)\s*분/);
  if(hours||minutes)return Math.max(5,Math.round(Number(hours?.[1]||0)*60+Number(minutes?.[1]||0)));
  if(/답장|연락|전화|예약|신청|확인|결제|접수/.test(text))return 10;
  if(item.type==='meeting'||/공부|보고서|과제|분석|작성|운동/.test(text))return 60;
  return 30;
 }
 const important=item=>item.type==='meeting'||Boolean(item.review)||/병원|약국|시험|면접|결제|납부|마감|회의|약속|예약|자격증/.test(`${item.title||''} ${item.notes||''} ${item.raw||''}`);
 function score(item,state,minute){
  const d=duration(item),at=clock(item.time);let n=100;
  if(state.activeId===item.id)n+=80;
  if(important(item))n+=30;
  n+=d<=state.availableMinutes?28:-Math.min(45,d-state.availableMinutes);
  if(state.energy==='low')n+=d<=10?26:d>30?-24:4;
  if(state.energy==='high'&&d>=30)n+=10;
  if(at!==null){const gap=at-minute;n+=gap<0?22:gap<=120?34:gap<=240?16:0;}
  return n;
 }
 function recommend(records,state,now=new Date()){
  const {day,minute}=nowParts(now);
  const today=records.filter(x=>x.date===day&&['task','meeting'].includes(x.type));
  const pending=today.filter(x=>!x.completed).sort((a,b)=>score(b,state,minute)-score(a,state,minute)||(a.time||'99:99').localeCompare(b.time||'99:99')||String(a.title).localeCompare(String(b.title)));
  const available=pending.filter(x=>!(state.skippedIds||[]).includes(x.id));
  const choices=available.length?available:pending;
  const item=choices[0]||null;
  return {day,item,next:choices[1]||null,pending,completed:today.filter(x=>x.completed),cycled:!available.length&&pending.length>0,defer:pending.filter(x=>x.id!==item?.id&&!important(x)).at(-1)||null};
 }
 function reason(item,state,now=new Date()){
  const at=clock(item.time),gap=at===null?null:at-nowParts(now).minute,parts=[];
  if(state.activeId===item.id)parts.push('진행 중으로 선택한 일입니다.');
  if(gap!==null&&gap<0)parts.push(`${item.time} 예정 시간이 지났으니 처리 여부를 확인해 주세요.`);
  else if(gap!==null&&gap<=120)parts.push(`${item.time} 일정이 가까워 먼저 확인해 주세요.`);
  if(important(item))parts.push('중요 일정일 수 있어 임의로 미루지 않습니다.');
  if(state.energy==='low')parts.push('피곤한 상태를 고려해 짧게 시작할 일을 우선합니다.');
  parts.push(duration(item)<=state.availableMinutes?`예상 소요 시간이 가능한 ${state.availableMinutes}분 이내입니다.`:`전체 완료보다 우선 ${state.availableMinutes}분만 진행하는 제안입니다.`);
  return parts.join(' ');
 }
 function tomorrow(day){return new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);}
 root.UNHARU_GUIDE_CORE={clock,nowParts,duration,important,score,recommend,reason,tomorrow};
})(typeof window==='undefined'?globalThis:window);
