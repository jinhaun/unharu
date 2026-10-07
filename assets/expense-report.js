/* Report calculations only read records. Demonstration data never enters the store. */
(function () {
  'use strict';
  const categories = ['식비','카페','교통','쇼핑','구독','의료','기타'];
  const pad = n => String(n).padStart(2,'0');
  const localDate = (d = new Date()) => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  function shiftMonth(month, delta) {
    const [y,m] = month.split('-').map(Number);
    const date = new Date(y,m-1+delta,1);
    return date.getFullYear()+'-'+pad(date.getMonth()+1);
  }
  function daysIn(month) { const [y,m] = month.split('-').map(Number); return new Date(y,m,0).getDate(); }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number);
    return y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(value.slice(0,7));
  }
  function summarize(records, month, endDay, asOf, categoryOf = r => r.category) {
    const end = month+'-'+pad(Math.min(endDay,daysIn(month)));
    const result = {rows:[],total:0,count:0,invalid:0,future:0,byCategory:Object.fromEntries(categories.map(c=>[c,0]))};
    for (const r of records) {
      if (r.type !== 'expense' || typeof r.date !== 'string' || !r.date.startsWith(month+'-')) continue;
      if (!validDate(r.date) || typeof r.amount !== 'number' || !Number.isSafeInteger(r.amount) || r.amount <= 0) { result.invalid++; continue; }
      if (r.date > asOf) { result.future++; continue; }
      if (r.date > end) continue;
      const category = categoryOf(r);
      const normalized = categories.includes(category) ? category : '기타';
      result.rows.push({...r,category:normalized});
      result.total += r.amount;
      result.byCategory[normalized] += r.amount;
    }
    result.rows.sort((a,b)=>a.date.localeCompare(b.date));
    result.count = result.rows.length;
    return result;
  }
  function comparison(current, prior) {
    return {delta:current-prior,percent:prior > 0 ? (current-prior)/prior*100 : null};
  }
  function comparisonRange(target, prior, today) {
    const validMonth = m=>typeof m==='string' && /^\d{4}-\d{2}$/.test(m) && validDate(m+'-01');
    if(!validMonth(target)||!validMonth(prior)) return {error:'살펴볼 달과 비교 기준 달을 모두 선택해 주세요.'};
    if(target===prior) return {error:'서로 다른 두 달을 선택해 주세요.'};
    const current=today.slice(0,7);
    if(target>current||prior>current) return {error:'미래의 달은 아직 비교할 수 없어요. 이번 달 또는 이전 달을 선택해 주세요.'};
    const partial=target===current||prior===current;
    const common=Math.min(Number(today.slice(8)),daysIn(target),daysIn(prior));
    return {partial,targetEnd:partial?common:daysIn(target),priorEnd:partial?common:daysIn(prior)};
  }
  function compareRecords(records,target,prior,today,categoryOf) {
    const range=comparisonRange(target,prior,today);
    if(range.error) return range;
    const current=summarize(records,target,range.targetEnd,today,categoryOf);
    const baseline=summarize(records,prior,range.priorEnd,today,categoryOf);
    return {range,current,baseline,canCompare:current.count>0&&baseline.count>0,difference:comparison(current.total,baseline.total)};
  }
  function fictionalRecords(month) {
    const pattern = [
      [1,'점심','식비',9500],[1,'카페','카페',4800],[2,'대중교통','교통',3100],
      [2,'생필품','쇼핑',24800],[3,'저녁','식비',16000],[3,'커피','카페',4500],
      [4,'구독','구독',14900],[4,'점심','식비',11000],[5,'약국','의료',6500],
      [5,'장보기','쇼핑',38500],[6,'저녁','식비',18000],[6,'대중교통','교통',3100],
      [8,'커피','카페',4800],[10,'점심','식비',12000],[12,'생활용품','쇼핑',29900],
      [15,'식사','식비',21000],[18,'대중교통','교통',3100],[21,'문화생활','기타',16000],
      [24,'카페','카페',5500],[27,'장보기','쇼핑',32000],[28,'식사','식비',17000]
    ];
    return pattern.map(([d,title,category,amount],i)=>({id:'report-demo-'+i,type:'expense',date:month+'-'+pad(d),title,category,amount}));
  }
  const api = {categories,localDate,shiftMonth,daysIn,validDate,summarize,comparison,comparisonRange,compareRecords,fictionalRecords};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const $r = s=>document.querySelector(s);
  const dialog = $r('#expense-report-dialog');
  const body = $r('#expense-report-body');
  const money = n=>n.toLocaleString('ko-KR')+'원';
  const monthLabel = m=>Number(m.slice(0,4))+'년 '+Number(m.slice(5))+'월';
  let mode = 'real';
  let selectedTarget=localDate().slice(0,7),selectedPrior=shiftMonth(selectedTarget,-1);
  let renderedDate = '';
  const seen = new Set();
  const menu = document.createElement('button');
  menu.type = 'button'; menu.id = 'expense-report-menu'; menu.setAttribute('aria-haspopup','dialog');
  menu.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg>소비 리포트<span class="report-badge" hidden>지난달</span>';
  $r('#expense-menu').after(menu);
  const node = (tag,text,cls) => { const el=document.createElement(tag); if(text!==undefined) el.textContent=text; if(cls) el.className=cls; return el; };
  function stat(label,value,detail,sample) {
    const el=node('div',undefined,'report-stat'+(sample?' sample':''));
    el.append(node('span',label),node('strong',value),node('small',detail)); return el;
  }
  function render() {
    const today = localDate(), currentMonth=today.slice(0,7);
    renderedDate = today;
    const target=mode==='demo'?currentMonth:selectedTarget, prior=mode==='demo'?shiftMonth(target,-1):selectedPrior;
    const range=comparisonRange(target,prior,today);
    body.replaceChildren();
    $r('#report-demo-mode').setAttribute('aria-pressed',String(mode==='demo'));
    $r('#report-real-mode').setAttribute('aria-pressed',String(mode==='real'));
    $r('#report-month-controls').hidden=mode==='demo';
    $r('#report-target-month').max=currentMonth;
    $r('#report-baseline-month').max=currentMonth;
    $r('#report-target-month').value=selectedTarget;
    $r('#report-baseline-month').value=selectedPrior;
    $r('#report-month-error').hidden=!range.error;
    $r('#report-month-error').textContent=range.error||'';
    for(const id of ['#report-target-month','#report-baseline-month']) $r(id).setAttribute('aria-invalid',String(!!range.error));
    if(range.error) return;
    const day=range.targetEnd;
    const actual=mode==='real'?compareRecords(items,target,prior,today,itemExpenseCategory):null;
    const real=actual?actual.current:summarize(items,target,day,today,itemExpenseCategory);
    const baseline=actual?actual.baseline:summarize(fictionalRecords(prior),prior,range.priorEnd,today,itemExpenseCategory);
    body.append(node('div',mode==='demo'
      ? '미리보기 · 비교 대상은 가상 데이터입니다. 실제 소비습관의 개선·악화를 판단하는 자료가 아니며, 가상 기록은 캘린더나 계정에 저장되지 않습니다.'
      : '실제 입력한 소비 기록만 집계합니다. 입력하지 않은 결제는 포함되지 않으므로 카드 명세서의 전체 지출과 다를 수 있습니다.','report-disclaimer'));
    body.append(node('p',mode==='demo'
      ? monthLabel(target)+' 1–'+day+'일 실제 기록 ↔ '+monthLabel(prior)+' 1–'+day+'일 가상 기록 · 같은 기간 비교'
      : monthLabel(target)+' 1–'+range.targetEnd+'일 ↔ '+monthLabel(prior)+' 1–'+range.priorEnd+'일 · '+(range.partial?'같은 일수의 실제 기록':'월 전체 실제 기록'),'report-period'));
    const diff=comparison(real.total,baseline.total);
    const canCompare=real.count>0&&baseline.count>0;
    const difference=canCompare?(diff.delta===0?'차이 없음':money(Math.abs(diff.delta))+(diff.delta>0?' 더 많음':' 더 적음')):'비교 자료 부족';
    const stats=node('div',undefined,'report-stats');
    stats.append(stat(monthLabel(target)+' · 실제',real.count?money(real.total):'기록 없음',real.count+'건 · '+(range.partial?'월중 집계':'월간 집계')),
      stat(monthLabel(prior)+(mode==='demo'?' · 가상':' · 실제'),baseline.count?money(baseline.total):'기록 없음',baseline.count+'건'+(mode==='demo'?' · 예시일 뿐이에요':''),mode==='demo'),
      stat(mode==='demo'?'가상 기준과의 차이':'기준 달 대비 차이',difference,canCompare?Math.abs(diff.percent).toFixed(1)+'% '+(diff.delta===0?'동일':diff.delta>0?'높음':'낮음'):'기록 없음은 무소비를 뜻하지 않아요'));
    body.append(stats);
    if (!real.count) body.append(node('p','이 기간에 집계할 수 있는 실제 소비 기록이 없어요. 가상 비교 미리보기에서 이번 달 기록으로 화면을 확인할 수 있습니다.','report-disclaimer'));
    else if(!baseline.count) body.append(node('p','비교 기준 달에 소비 기록이 없어요. 기록이 쌓이면 실제 증감액과 증감률을 확인할 수 있습니다. 지금은 가상 비교 미리보기로 살펴보세요.','report-disclaimer'));
    body.append(node('h3','카테고리별 소비'));
    const list=node('ul',undefined,'report-categories');
    const maximum=Math.max(1,...Object.values(real.byCategory),...Object.values(baseline.byCategory));
    for (const c of categories) {
      const li=node('li',undefined,'report-category'),head=node('div',undefined,'report-category-head');
      head.append(node('strong',c),node('span',real.total?((real.byCategory[c]/real.total)*100).toFixed(1)+'% · 실제 비중':'실제 기록 없음'));
      li.append(head);
      for (const [label,value,sample] of [['실제 '+target.replace('-','.'),real.byCategory[c],false],[(mode==='demo'?'가상 ':'실제 ')+prior.replace('-','.'),baseline.byCategory[c],true]]) {
        const row=node('div',undefined,'report-bar-row'),track=node('div',undefined,'report-track'),bar=node('div',undefined,'report-bar'+(sample?' sample':''));
        track.setAttribute('aria-hidden','true'); bar.style.width=(value/maximum*100)+'%'; track.append(bar);
        row.append(node('span',label),track,node('span',money(value))); li.append(row);
      }
      const categoryDelta=real.byCategory[c]-baseline.byCategory[c];
      li.append(node('p',!canCompare?'비교 자료 부족':categoryDelta===0?'기준 달과 동일':'기준 달보다 '+money(Math.abs(categoryDelta))+(categoryDelta>0?' 더 많음':' 더 적음'),'report-change'));
      list.append(li);
    }
    body.append(list,node('h3','기록에서 발견한 점'));
    const observations=node('ul',undefined,'report-observations');
    if(real.count) {
      const top=categories.reduce((a,b)=>real.byCategory[a]>=real.byCategory[b]?a:b);
      observations.append(node('li','가장 많이 쓴 분야는 '+top+'이며 '+money(real.byCategory[top])+'입니다.'));
      observations.append(node('li','소비 기록 1건당 평균은 '+money(Math.round(real.total/real.count))+'입니다.'));
      const cafe=real.rows.filter(r=>r.category==='카페').length;
      if(cafe) observations.append(node('li','카페 지출은 '+cafe+'건, '+money(real.byCategory['카페'])+'입니다. 자주 쓰는 항목부터 돌아보세요.'));
    } else observations.append(node('li','소비가 입력되면 주요 지출 분야와 건당 평균을 보여드려요.'));
    observations.append(node('li','외부 AI에 보내지 않고 저장된 금액과 카테고리로 계산한 요약입니다.'));
    body.append(observations);
    const details=node('details',undefined,'report-records'); details.append(node('summary','집계에 사용한 실제 기록 '+real.count+'건 보기'));
    const records=node('ul');
    real.rows.forEach(r=>records.append(node('li',r.date+' · '+r.title+' · '+r.category+' · '+money(r.amount))));
    details.append(records);body.append(details);
    const samples=node('details',undefined,'report-records');samples.append(node('summary',mode==='demo'?'가상 비교 데이터 '+baseline.count+'건 보기':'비교 대상 실제 기록 '+baseline.count+'건 보기'));
    const sampleList=node('ul'); baseline.rows.forEach(r=>sampleList.append(node('li',r.date+' · '+r.title+' · '+r.category+' · '+money(r.amount)))); samples.append(sampleList);body.append(samples);
    body.append(node('p','집계 제외 — 살펴볼 달: 미래 예정 '+real.future+'건 · 날짜/금액 확인 필요 '+real.invalid+'건. 비교 기준 달: 미래 예정 '+baseline.future+'건 · 날짜/금액 확인 필요 '+baseline.invalid+'건. '+(range.partial?'같은 일수까지만 비교하며 남은 기간은 포함하지 않습니다.':'각 달의 전체 기간을 집계하므로 달마다 일수가 다를 수 있습니다.')+' 수정·추가한 기록은 다시 열 때 반영됩니다.','report-note'));
  }
  function refresh(force = true) {
    const today=localDate(),last=shiftMonth(today.slice(0,7),-1);
    const ready=summarize(items,last,daysIn(last),today,itemExpenseCategory).count>0;
    menu.querySelector('.report-badge').hidden=!ready||seen.has(last);
    if(dialog.open && (force || renderedDate !== today)) render();
  }
  menu.addEventListener('click',()=>{
    const today=localDate(),last=shiftMonth(today.slice(0,7),-1);
    mode='real';
    if(selectedTarget===last)seen.add(last);
    refresh();render();dialog.showModal();
  });
  $r('#close-expense-report').addEventListener('click',()=>dialog.close());
  $r('#report-demo-mode').addEventListener('click',()=>{mode='demo';render();});
  $r('#report-real-mode').addEventListener('click',()=>{mode='real';render();});
  $r('#report-last-month').addEventListener('click',()=>{
    selectedTarget=shiftMonth(localDate().slice(0,7),-1);selectedPrior=shiftMonth(selectedTarget,-1);
    seen.add(selectedTarget);refresh();
  });
  for(const id of ['#report-target-month','#report-baseline-month']) $r(id).addEventListener('change',()=>{
    selectedTarget=$r('#report-target-month').value;selectedPrior=$r('#report-baseline-month').value;render();
  });
  window.UnharuReports={refresh};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(()=>{if(!document.hidden)refresh(false);},60000);
  refresh();
})();
