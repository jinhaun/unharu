/* Pure, local calculations over the report's already bounded real records. */
(function(root){
 'use strict';
 const categories=['식비','간식','카페','교통','쇼핑','구독','의료','기타'];
 function validRow(r){
  if(!r||r.type!=='expense'||!Number.isSafeInteger(r.amount)||r.amount<=0||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))return false;
  const d=new Date(r.date+'T12:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===r.date;
 }
 function profile(rows){
  const groups=categories.map(name=>({name,count:0,total:0,average:0}));
  const dates=new Set(),titles=new Map();
  let total=0,count=0,smallCount=0,smallTotal=0,weekendTotal=0,weekdayTotal=0;
  for(const r of Array.isArray(rows)?rows:[]){
   if(!validRow(r))continue;
   const category=categories.includes(r.category)?r.category:'기타';
   const g=groups.find(g=>g.name===category);
   g.count++;g.total+=r.amount;total+=r.amount;count++;dates.add(r.date);
   if(r.amount<=5000){smallCount++;smallTotal+=r.amount;}
   const weekday=new Date(r.date+'T12:00:00Z').getUTCDay();
   if(weekday===0||weekday===6)weekendTotal+=r.amount;else weekdayTotal+=r.amount;
   const title=typeof r.title==='string'?r.title.trim().replace(/\s+/g,' '):'';
   if(title){const key=JSON.stringify([category,title]);const item=titles.get(key)||{title,category,count:0,total:0};item.count++;item.total+=r.amount;titles.set(key,item);}
  }
  groups.forEach(g=>{g.average=g.count?g.total/g.count:0;});
  return {count,total,recordedDays:dates.size,sparse:count<5||dates.size<3,groups,
   top:groups.filter(g=>g.count).sort((a,b)=>b.total-a.total)[0]||null,
   frequent:groups.filter(g=>g.count).sort((a,b)=>b.count-a.count||b.total-a.total)[0]||null,
   repeated:[...titles.values()].filter(t=>t.count>=2).sort((a,b)=>b.count-a.count||b.total-a.total).slice(0,3),
   smallCount,smallTotal,weekendTotal,weekdayTotal};
 }
 function analyze(rows,priorRows){
  const current=profile(rows),prior=priorRows===null?null:profile(priorRows);
  const changes=prior&&prior.count&&current.count?current.groups.map((g,i)=>({name:g.name,
   count:g.count,priorCount:prior.groups[i].count,delta:g.total-prior.groups[i].total,
   percent:prior.groups[i].total>0?(g.total-prior.groups[i].total)/prior.groups[i].total*100:null
  })).filter(g=>g.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)):[];
  return {current,prior,changes,canCompare:!!(prior?.count&&current.count)};
 }
 function simulate(current,category,reductions){
  const g=current.groups.find(g=>g.name===category);
  if(!g||g.count<2)return {error:'기록이 2건 이상인 분야를 선택해 주세요.'};
  if(!Number.isInteger(reductions)||reductions<1||reductions>g.count)return {error:'줄여볼 횟수를 1~'+g.count+'회 사이의 정수로 입력해 주세요.'};
  return {category,count:g.count,average:g.average,reductions,saving:Math.min(g.total,Math.round(g.average*reductions))};
 }
 root.UnharuHabitCore={profile,analyze,simulate};
})(typeof window!=='undefined'?window:globalThis);
