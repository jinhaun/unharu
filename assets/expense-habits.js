(function(){
 'use strict';
 const core=window.UnharuHabitCore;
 const money=n=>Math.round(n).toLocaleString('ko-KR')+'원';
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 function render(host,real,prior,options){
  const data=core.analyze(real.rows,options.demo?null:prior.rows),p=data.current;
  const section=node('section',undefined,'habit-section');section.setAttribute('aria-labelledby','habit-title');
  const heading=node('h3','소비습관 분석');heading.id='habit-title';
  section.append(heading,node('p',options.target+' · 1~'+options.days+'일 실제 기록 '+p.count+'건 / 기록이 있는 날 '+p.recordedDays+'일','report-period'));
  section.append(node('p','입력된 기록만 분석합니다. 미입력일은 무소비일이 아니며, 소비의 필요성이나 낭비 여부를 판단하지 않습니다.','report-note'));
  if(options.demo)section.append(node('p','가상 비교 모드에서도 아래 습관 분석·절약 계산에는 실제 기록만 사용합니다. 가상 자료와의 습관 변화 비교는 하지 않습니다.','report-disclaimer'));
  if(!p.count){section.append(node('p','분석할 소비 기록이 없습니다. 소비를 입력한 뒤 다시 열어 주세요.','report-disclaimer'));host.append(section);return;}
  if(p.sparse)section.append(node('p','아직 기록이 적어 참고용 요약만 보여드려요. 5건 이상·3일 이상의 기록이 쌓여도, 이 분석은 입력한 범위에만 해당합니다.','report-disclaimer'));
  const facts=node('ul',undefined,'habit-facts');
  const add=(title,text)=>{const li=node('li');li.append(node('strong',title),node('p',text));facts.append(li);};
  add('많이 쓴 분야',p.top.name+'에 '+money(p.top.total)+' · 전체 기록 금액의 '+(p.top.total/p.total*100).toFixed(1)+'%를 썼어요.');
  add('자주 기록한 분야',p.frequent.name+' '+p.frequent.count+'건 · 합계 '+money(p.frequent.total)+' · 1건당 평균 약 '+money(p.frequent.average)+'이에요.');
  if(p.smallCount)add('소액 소비도 모아 보기','5,000원 이하 기록이 '+p.smallCount+'건, 합계 '+money(p.smallTotal)+'이에요. 소액이라는 이유만으로 불필요한 지출은 아닙니다.');
  add('평일과 주말','평일 기록 합계 '+money(p.weekdayTotal)+' / 주말 기록 합계 '+money(p.weekendTotal)+'. 날짜 수가 다른 단순 합계이며, 어느 쪽에서 더 자주 쓰는지 단정하지 않아요.');
  for(const r of p.repeated)add('반복된 기록 · '+r.category,r.title+' — 같은 제목으로 '+r.count+'건, '+money(r.total)+'. 동일 매장 여부는 확인하지 않은 기록 제목 기준입니다.');
  if(data.canCompare){
   const c=data.changes[0];
   add('비교 기준 달과의 변화',c?c.name+'의 기록 금액이 '+money(Math.abs(c.delta))+(c.delta>0?' 늘었어요.':' 줄었어요.')+' 기록 수는 '+c.priorCount+'건 → '+c.count+'건입니다.'+(c.percent===null?' 기준 기간에 해당 분야 기록이 없어 증가율은 계산하지 않아요.':' 금액 변화율 '+(c.percent>0?'+':'')+c.percent.toFixed(1)+'%.'):'비교 기간의 카테고리별 기록 금액이 같아요.');
   add('비교 범위',options.prior+' 1~'+options.priorDays+'일과 '+options.target+' 1~'+options.days+'일을 비교합니다. 기록 누락·분류 변경에도 차이가 생길 수 있으며 습관 개선이나 악화를 뜻하지 않습니다.');
  }else if(!options.demo)add('변화 분석은 기록이 쌓이면','비교 기준 달에 실제 소비 기록이 부족해 증감 판단은 하지 않아요.');
  section.append(facts,node('h3','내가 선택하는 절약 시뮬레이션'),node('p','줄여도 괜찮다고 생각하는 분야를 직접 골라 보세요. 필요 지출은 줄일 필요가 없습니다. 실제 금액을 변경하거나 목표를 저장하지 않습니다.','report-note'));
  const choices=p.groups.filter(g=>g.count>=2);
  if(!choices.length){section.append(node('p','같은 분야의 기록이 2건 이상이면 평균 금액으로 계산할 수 있어요.','report-disclaimer'));host.append(section);return;}
  const fields=node('div',undefined,'habit-fields');
  const categoryLabel=node('label','살펴볼 소비 분야'),select=node('select');select.id='habit-category';categoryLabel.htmlFor=select.id;
  const empty=node('option','분야를 직접 선택해 주세요');empty.value='';select.append(empty);
  choices.forEach(g=>{const option=node('option',g.name+' · '+g.count+'건');option.value=g.name;select.append(option);});categoryLabel.append(select);
  const countLabel=node('label','이 기간에서 줄여볼 횟수'),input=node('input');input.id='habit-reductions';input.type='number';input.min='1';input.step='1';input.value='1';input.disabled=true;countLabel.htmlFor=input.id;countLabel.append(input);
  const output=node('p','분야를 선택하면 계산 결과가 나타납니다.','habit-result');output.setAttribute('role','status');output.setAttribute('aria-live','polite');output.id='habit-result';
  input.setAttribute('aria-describedby','habit-result');select.setAttribute('aria-describedby','habit-result');
  function update(reset){
   const g=choices.find(g=>g.name===select.value);input.disabled=!g;
   if(reset){input.value='1';input.removeAttribute('aria-invalid');}
   if(!g){output.textContent='분야를 선택하면 계산 결과가 나타납니다.';return;}
   input.max=String(g.count);
   const result=core.simulate(p,select.value,input.value===''?NaN:Number(input.value));
   input.setAttribute('aria-invalid',String(!!result.error));
   output.textContent=result.error||'같은 평균 금액의 결제를 '+result.reductions+'회 줄인다고 가정하면 약 '+money(result.saving)+' 차이예요. (이 기간 1건 평균 약 '+money(result.average)+' × '+result.reductions+'회)';
  }
  select.addEventListener('change',()=>update(true));input.addEventListener('input',()=>update(false));
  fields.append(categoryLabel,countLabel);section.append(fields,output,node('p','선택한 기간의 평균값으로 만든 가정입니다. 다음 달 절약액을 보장하거나 월 전체 금액으로 환산한 예측이 아닙니다.','report-note'));
  const method=node('details',undefined,'report-records');method.append(node('summary','계산 기준 보기'),node('p','기존 리포트와 동일한 실제 소비 기록 중 유효한 날짜·양의 정수 금액만 사용합니다. 미래 기록과 잘못된 금액은 제외합니다. 분야별 건수와 합계를 계산하고, 절약 가정은 반올림 전 평균 × 횟수를 원 단위로 반올림합니다. 외부 AI 전송 없이 이 기기에서 계산합니다.'));
  section.append(method);host.append(section);
 }
 window.UnharuHabits={render};
})();
