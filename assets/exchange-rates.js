(function(){
  'use strict';
  const core=window.UNHARU_EXCHANGE_CORE, weather=document.getElementById('seoul-weather');
  if (!core || !weather) return;
  const testMode=typeof IS_TEST_MODE!=='undefined' && IS_TEST_MODE;
  const storageKey='unharu-exchange-currencies-v1'+(testMode?'-test':'');
  let chosen;
  try { chosen=core.selection(JSON.parse(localStorage.getItem(storageKey))); } catch { chosen=core.selection(null); }
  let data=null, busy=false, lastAttempt=0, failed=false;
  const card=document.createElement('section'); card.className='exchange-card'; card.id='exchange-rates'; card.setAttribute('aria-labelledby','exchange-title');
  card.innerHTML=`<div class="exchange-heading"><h2 id="exchange-title">자주 보는 환율</h2><button type="button" id="exchange-refresh">환율 새로고침</button></div>
    <p class="exchange-note">원화 기준 · 기준 환율이며 실제 환전 금액은 은행 수수료 등에 따라 달라집니다.</p>
    <p class="exchange-note" id="exchange-status" role="status" aria-live="polite">환율을 확인하고 있습니다.</p>
    <div class="exchange-list" id="exchange-list"></div>
    <details id="exchange-settings"><summary>표시할 통화 선택 · <span id="exchange-count"></span></summary>
    <p class="exchange-note">선택한 통화는 이 브라우저에 자동으로 기억합니다.</p>
    <div class="exchange-actions"><button type="button" id="exchange-default">기본 통화</button><button type="button" id="exchange-none">전체 해제</button></div>
    <div class="exchange-options" id="exchange-options"></div><button type="button" id="exchange-close">선택 닫기</button></details>
    <p class="exchange-note">자료: <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a> · 통화별 기준일 표시 · 휴일에는 이전 영업일 자료가 표시될 수 있습니다.</p>`;
  weather.after(card);
  const q=id=>card.querySelector('#'+id), money=new Intl.NumberFormat('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
  function render(){
    q('exchange-count').textContent=chosen.length+'개 선택됨';
    for(const input of q('exchange-options').querySelectorAll('input'))input.checked=chosen.includes(input.value);
    q('exchange-list').replaceChildren();
    if(!chosen.length){const empty=document.createElement('p');empty.className='exchange-note';empty.textContent='표시할 통화를 선택해 주세요.';q('exchange-list').append(empty);return;}
    for(const currency of core.currencies.filter(c=>chosen.includes(c.code))){
      const row=data?.rates?.find(r=>core.validRate(r,currency));
      const item=document.createElement('article');item.className='exchange-item';
      const title=document.createElement('h3');title.textContent=currency.name;
      const unit=document.createElement('p');unit.textContent=currency.unit.toLocaleString('ko-KR')+currency.label+' 기준';
      const value=document.createElement('strong');value.textContent=row?money.format(row.krw)+'원':'—';
      const date=document.createElement('small');date.textContent=row?row.date.replaceAll('-','.')+' 기준':busy?'불러오는 중':'자료를 확인하지 못했습니다';
      item.append(title,unit,value,date);q('exchange-list').append(item);
    }
  }
  function choose(value){
    chosen=core.selection(value);
    let stored=true;try{localStorage.setItem(storageKey,JSON.stringify(chosen));}catch{stored=false;}
    render();
    q('exchange-status').textContent=(testMode?'시험용 예시 금액입니다. 실제 환율이 아닙니다. ':'')+(stored?'통화 선택을 이 브라우저에 기억했습니다.':'통화는 적용했지만 이 브라우저에 기억하지 못했습니다.');
    if(failed)q('exchange-status').textContent+=' 환율 조회에 실패했습니다. 새로고침해 주세요.';
  }
  for(const currency of core.currencies){
    const label=document.createElement('label'), input=document.createElement('input');input.type='checkbox';input.value=currency.code;
    input.addEventListener('change',()=>choose([...q('exchange-options').querySelectorAll('input:checked')].map(i=>i.value)));
    label.append(input,document.createTextNode(currency.name));q('exchange-options').append(label);
  }
  async function load(){
    if(busy)return;busy=true;failed=false;lastAttempt=Date.now();card.dataset.state='loading';q('exchange-refresh').disabled=true;
    q('exchange-status').textContent='환율을 확인하고 있습니다.';render();
    try{
      let next;
      if(testMode){
        next={ok:true,fetchedAt:new Date().toISOString(),rates:core.currencies.map((c,i)=>({code:c.code,unit:c.unit,krw:[1350,900,1500,190,1750,1600,1000,900,175,1050,40,43,55][i],date:'2026-11-12'}))};
      }else{
        const response=await fetch('/api/exchange-rates',{signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error();next=await response.json();
      }
      if(!next?.ok || !Array.isArray(next.rates) || !core.currencies.some(c=>next.rates.some(r=>core.validRate(r,c))))throw new Error();
      data=next;card.dataset.state='ready';
      q('exchange-status').textContent=testMode?'시험용 예시 금액입니다. 실제 환율이 아닙니다.':`최근 조회: ${new Date().toLocaleString('ko-KR')} · 통화별 기준일을 확인해 주세요.`;
    }catch{
      failed=true;card.dataset.state='error';
      q('exchange-status').textContent=data?'새 환율을 가져오지 못해 이전 조회 자료를 표시합니다. 기준일을 확인하고 다시 시도해 주세요.':'환율을 불러오지 못했습니다. 환율 새로고침을 눌러 다시 시도해 주세요.';
    }finally{busy=false;q('exchange-refresh').disabled=false;render();}
  }
  q('exchange-refresh').addEventListener('click',load);
  q('exchange-default').addEventListener('click',()=>choose(null));
  q('exchange-none').addEventListener('click',()=>choose([]));
  q('exchange-close').addEventListener('click',()=>{q('exchange-settings').open=false;q('exchange-settings').querySelector('summary').focus();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden && Date.now()-lastAttempt>1800000)load();});
  load();
})();
