(function() {
  'use strict';
  const core=window.UNHARU_TRANSIT_CORE, q=id=>document.getElementById(id);
  const status=q('transit-status'), button=q('calculate-transit');
  let generation=0,controller=null,candidates=[],quoteGeneration=-1;
  const selected={origin:null,via:null,destination:null},fields={};
  let viaEnabled=false;
  const reuse=window.UNHARU_TRANSIT_REUSE.createReuse();
  let pendingAction=false,restrictedUntil=0,usage={fresh:0,reused:0};
  const quotaMessage='ODsay 호출 제한(429)입니다. 하루 한도 또는 짧은 시간의 호출 제한일 수 있습니다. 내 애플리케이션에서 사용량을 확인해 주세요. 자동 재시도는 하지 않습니다.';
  function usageMessage(){q('transit-reuse-status').textContent=`이번 작업: 새 조회 ${usage.fresh}회 · 화면 결과 재사용 ${usage.reused}회. 결과는 이 탭에서 5분간만 재사용하며, 새로고침·로그아웃하면 사라집니다.`;}
  function acquire(){if(pendingAction){say('이미 조회 중입니다. 완료 후 다시 눌러 주세요.');return false;}pendingAction=true;usage={fresh:0,reused:0};q('transit-planner').setAttribute('aria-busy','true');return true;}
  function release(){pendingAction=false;q('transit-planner').setAttribute('aria-busy','false');usageMessage();}
  const sideNames={origin:'출발',via:'경유지',destination:'도착'};
  const viaChoices=document.createElement('div');viaChoices.id='waypoint-choices';viaChoices.hidden=true;q('transit-result').before(viaChoices);
  function setViaEnabled(enabled) {
    viaEnabled=enabled;q('waypoint-field').hidden=!enabled;q('waypoint-settings').hidden=!enabled;
    q('transit-direct-preference').hidden=enabled;
    q('toggle-waypoint').textContent=enabled?'경유지 삭제':'+ 경유지 추가';q('toggle-waypoint').setAttribute('aria-expanded',String(enabled));
  }
  function waypointData() {
    return viaEnabled?{via:q('transit-via').value.trim(),viaSettings:[0,1].map(i=>({mode:q('waypoint-mode-'+i).value||'0',line:q('waypoint-line-'+i).value.trim()}))}:{};
  }
  const stationHint='이름을 검색한 뒤 목록에서 선택하세요. 예: 신중동 또는 신중동역. 지하철만 찾으려면 검색 종류를 선택하세요.';
  const say=(message,error=false)=>{status.textContent=message;status.dataset.state=error?'error':'';};
  const fail=message=>{throw new Error(message);};
  const options=document.createElement('div');options.id='transit-choices';options.hidden=true;
  const routeLabel=document.createElement('label');routeLabel.htmlFor='transit-route-choice';routeLabel.textContent='실제로 탄 경로 선택';
  const routeSelect=document.createElement('select');routeSelect.id='transit-route-choice';
  options.append(routeLabel,routeSelect);q('transit-result').before(options);

  function invalidate() {
    generation++;controller?.abort();controller=null;candidates=[];quoteGeneration=-1;
    options.hidden=true;routeSelect.replaceChildren();
    viaChoices.hidden=true;viaChoices.replaceChildren();q('transit-amount-basis').disabled=false;
    q('transit-ride-confirm').checked=false;q('transit-lane-choices').replaceChildren();
    q('transit-save-preview').textContent='';
    button.disabled=false;button.textContent='경로·요금 확인';
    for(const field of Object.values(fields)) {field.button.disabled=false;field.button.textContent='정류장 찾기';}
  }
  function clearQuote(){resetTransitResult();}
  function selection() {
    const out={};
    for(const side of viaEnabled?['origin','via','destination']:['origin','destination']) {
      const value=selected[side];
      if(value && q('transit-'+side).value.trim()===value.stationName) out[side]={...value};
    }
    return out;
  }
  function setStation(side,station) {
    selected[side]=station;
    if(station) q('transit-'+side).value=station.stationName;
    fields[side].help.textContent=station?`선택됨: ${station.label}`:stationHint;
    q('transit-'+side).removeAttribute('aria-invalid');
  }
  function restore(route) {
    q('transit-route-label').value=route.name||'';
    q('transit-origin').value=route.origin||'';q('transit-destination').value=route.destination||'';
    setViaEnabled(Boolean(route.via));q('transit-via').value=route.via||'';
    for(const i of [0,1]){q('waypoint-mode-'+i).value=['0','1','2'].includes(route.viaSettings?.[i]?.mode)?route.viaSettings[i].mode:'0';q('waypoint-line-'+i).value=route.viaSettings?.[i]?.line||'';}
    for(const side of ['origin','via','destination']) {
      fields[side].kind.value=['1','2','1:2'].includes(route.searchKinds?.[side])?route.searchKinds[side]:'1:2';
      const value=core.station(route.stations?.[side]);
      setStation(side,value && value.stationName===route[side]?value:null);
      fields[side].select.hidden=true;fields[side].select.replaceChildren();
    }
    q('transit-return-help').textContent=route.reversePending?'귀가용 초안입니다. 출발·도착과 구간 순서만 뒤집었습니다. 버스는 반대편 정류장·운행 방향을 다시 선택하고 경로·요금을 확인하세요.':'';
  }
  async function requestRaw(endpoint,params,signal) {
    const client=window.DAYFLOW_SUPABASE_CLIENT;
    if(!client) fail('Google 로그인 후 교통 조회를 이용해 주세요.');
    const {data,error}=await client.auth.getSession();
    if(error || !data.session?.access_token) fail('로그인이 필요합니다. 다시 로그인해 주세요.');
    if(signal.aborted) throw new DOMException('Aborted','AbortError');
    let keyReply;
    try {keyReply=await fetch('/api/transit-key',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store',signal});}
    catch(e){if(e.name==='AbortError')throw e;fail('운하루 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');}
    if(!keyReply.ok) fail(keyReply.status===403?'이 교통 조회 기능은 등록된 본인 계정만 사용할 수 있습니다.':keyReply.status===401?'로그인이 만료되었습니다. 다시 로그인해 주세요.':'교통 서비스 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    const credential=await keyReply.json();
    if(typeof credential.apiKey!=='string'||!credential.apiKey) fail('교통 서비스 키 설정을 확인해 주세요.');
    let response;
    try {
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      usage.fresh++;
      response=await fetch('https://api.odsay.com/v1/api/'+endpoint,{method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({...params,apiKey:credential.apiKey,output:'json'}),signal,
        credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});
    }catch(e){if(e.name==='AbortError')throw e;fail('ODsay에 연결하지 못했습니다. 인터넷 연결 또는 URI 등록 주소를 확인해 주세요.');}
    if(response.status===429){restrictedUntil=Date.now()+60000;fail(quotaMessage);}
    if(!response.ok) fail('ODsay 조회 실패: 등록 주소·키·무료 이용 한도를 확인해 주세요.');
    let result;try{result=await response.json();}catch{fail('교통 정보 응답 형식이 올바르지 않습니다.');}
    if(result.error){const error=core.list(result.error)[0];if(String(error.code??error.errorCode)==='429'){restrictedUntil=Date.now()+60000;fail(quotaMessage);}fail(core.errorMessage(error));}
    return result;
  }
  async function request(endpoint,params,signal){
    const hit=await reuse.run(endpoint,params,()=>{
      if(Date.now()<restrictedUntil)fail('호출 제한 후 1분 동안 추가 조회를 막고 있습니다. 하루 한도를 소진했다면 이용 가능 상태가 회복된 뒤 검색해 주세요.');
      return requestRaw(endpoint,params,signal);
    },signal);
    if(hit.reused)usage.reused++;
    hit.value.screenReceivedAt=new Date(hit.at).toISOString();return hit.value;
  }
  function begin(){clearQuote();controller=new AbortController();const active=controller;return {version:generation,signal:active.signal,abort:()=>active.abort()};}
  // A single active request avoids accidental quota consumption from duplicate taps.
  async function search(side) {
    if(!acquire())return;
    const input=q('transit-'+side),name=input.value.trim(),field=fields[side];
    const {version,signal,abort}=begin();setStation(side,null);field.select.hidden=true;
    if(name.length<2){field.help.textContent='두 글자 이상의 역·정류장 이름을 입력해 주세요.';input.setAttribute('aria-invalid','true');input.focus();release();return;}
    field.button.disabled=true;field.button.textContent='검색 중…';say('정류장을 찾고 있습니다.');
    const timer=setTimeout(abort,20000);
    try {
      const kind=field.kind.value || '1:2';
      const response=await request('searchStation',core.stationQuery(name,kind),signal);
      if(version!==generation)return;
      const {values,total,invalid}=core.stationResults(response.result,name,kind);
      field.select.replaceChildren(new Option('정확한 정류장을 선택하세요',''));
      values.forEach((station,index)=>field.select.add(new Option(station.label,String(index))));
      field.values=values;field.select.hidden=values.length===0;
      if(!values.length){field.help.textContent='검색 결과가 없습니다. 검색 종류를 확인하거나 다른 역·정류장 이름으로 검색해 주세요.';say(field.help.textContent,true);return;}
      field.help.textContent=`${values.length}개 표시 · 지역·노선·방면을 확인하세요. ${total>50?`전체 ${total}개 중 이름이 일치하는 역·정류장부터 최대 50개를 표시합니다. 검색 종류를 좁혀보세요.`:'이름이 일치하는 지하철역을 먼저 표시합니다.'}${invalid?' 일부 결과는 좌표·종류 정보가 불완전하여 제외했습니다.':''}`;
      say('검색 결과에서 사용할 정류장을 선택해 주세요.');field.select.focus();
    }catch(e){if(version===generation){field.help.textContent=e.name==='AbortError'?'응답 시간이 초과되었습니다. 다시 조회해 주세요.':e.message;say(field.help.textContent,true);}}
    finally{clearTimeout(timer);release();if(version===generation){field.button.disabled=false;field.button.textContent='정류장 찾기';}}
  }
  for(const side of ['origin','via','destination']) {
    const input=q('transit-'+side),box=document.createElement('div');box.className='station-tools';
    const kindLabel=document.createElement('label');kindLabel.htmlFor='station-kind-'+side;kindLabel.textContent='검색 종류';
    const kind=document.createElement('select');kind.id='station-kind-'+side;kind.setAttribute('aria-label',sideNames[side]+' 검색 종류');
    kind.add(new Option('버스 + 지하철','1:2'));kind.add(new Option('버스정류장만','1'));kind.add(new Option('지하철역만','2'));kind.value='1:2';
    const searchButton=document.createElement('button');searchButton.type='button';searchButton.textContent='정류장 찾기';searchButton.setAttribute('aria-label',sideNames[side]+' 정류장 찾기');
    const select=document.createElement('select');select.hidden=true;select.id='station-'+side;select.setAttribute('aria-label',sideNames[side]+' 정류장 검색 결과');
    const help=document.createElement('small');help.id='station-help-'+side;help.setAttribute('aria-live','polite');help.textContent=stationHint;
    input.setAttribute('aria-describedby',help.id);box.append(kindLabel,kind,searchButton,select,help);input.after(box);
    fields[side]={button:searchButton,select,kind,help,values:[]};
    kind.addEventListener('change',()=>{clearQuote();setStation(side,null);select.hidden=true;select.replaceChildren();});
    searchButton.addEventListener('click',()=>search(side));
    input.addEventListener('input',()=>{clearQuote();setStation(side,null);select.hidden=true;select.replaceChildren();});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search(side);}});
    select.addEventListener('change',()=>{clearQuote();setStation(side,select.value===''?null:fields[side].values[Number(select.value)]);});
  }
  setViaEnabled(false);
  q('toggle-waypoint').addEventListener('click',()=>{
    clearQuote();setViaEnabled(!viaEnabled);setStation('via',null);q('transit-via').value='';fields.via.select.hidden=true;fields.via.select.replaceChildren();
    if(viaEnabled)q('transit-via').focus();
  });
  for(const i of [0,1])for(const kind of ['mode','line'])q(`waypoint-${kind}-${i}`).addEventListener(kind==='mode'?'change':'input',clearQuote);
  function prepareFavorite(){return true;}
  function favoriteData(){return {name:q('transit-route-label').value.trim().slice(0,40),searchKinds:Object.fromEntries(Object.entries(fields).map(([side,field])=>[side,field.kind.value])),reversePending:Boolean(q('transit-return-help').textContent)};}
  function reverse(){
    const draft={origin:q('transit-origin').value.trim(),destination:q('transit-destination').value.trim(),stations:selection(),...waypointData(),...favoriteData()};
    if(!draft.origin||!draft.destination){say('출발지와 도착지를 먼저 입력해 주세요.',true);return;}
    clearQuote();const reversed=window.UNHARU_TRANSIT_REUSE.reverseDraft(draft);restore(reversed);
    const fastest=document.querySelector('input[name="transit-preference"][value="fastest"]');if(fastest)fastest.checked=true;
    say('귀가 경로 초안을 설정했습니다. 검색 횟수는 사용하지 않았습니다. 버스 정류장의 반대 방향을 확인한 뒤 조회해 주세요.');
    q('transit-origin').focus();
  }
  q('reverse-transit').addEventListener('click',reverse);
  function estimateDescription(estimate) {
    if(estimate.amount===null)return estimate.reason+' 확인한 실제 전체 결제액은 직접 입력할 수 있습니다.';
    return `탑승거리 약 ${(estimate.distanceM/1000).toFixed(2)}km · 기본 ${formatMoney(estimate.base)} + 거리 추가 ${formatMoney(estimate.surcharge)}`+
      (estimate.base+estimate.surcharge>estimate.separateCap?` · 개별 이용요금 상한 ${formatMoney(estimate.separateCap)} 적용`:'')+
      `. ${estimate.assumption} 예상 금액도 소비 합계에 포함됩니다. 실제 금액 수정은 ‘금액 구분 → 실제 결제액’을 선택하세요.`;
  }
  function refreshViaEstimate() {
    if(!transitQuote?.viaTrip)return;
    const estimate=core.estimateViaFare(transitQuote.steps),available=estimate.amount!==null;
    transitQuote.fareEstimate=estimate;transitQuote.fare=estimate.amount;transitQuote.referenceFare=estimate.amount;
    q('transit-fare').textContent=available?formatMoney(estimate.amount)+' (환승 예상)':'자동 계산 불가';
    q('transit-amount-help').textContent=estimateDescription(estimate);
    q('transit-amount-basis').value=available?'estimated':'confirmed';q('transit-amount-basis').disabled=!available;
    q('transit-save-amount').readOnly=available;q('transit-save-amount').value=estimate.amount??'';
    q('transit-ride-confirm').checked=false;
    say(available?'환승할인 조건을 충족한다고 가정한 예상 요금을 입력했습니다. 실제 이용 경로를 확인한 뒤 저장해 주세요.':estimate.reason);
  }
  function choose(index) {
    const route=candidates[index];
    if(!route)return;
    transitQuote=null;quoteGeneration=generation;q('transit-ride-confirm').checked=false;
    q('transit-amount-basis').value=route.viaTrip?'confirmed':'estimated';q('transit-amount-basis').disabled=Boolean(route.viaTrip);q('transit-save-amount').readOnly=!route.viaTrip;
    const names={origin:q('transit-origin').value.trim(),destination:q('transit-destination').value.trim()};
    q('transit-route-name').textContent=[names.origin,route.via,names.destination].filter(Boolean).join(' → ');
    q('transit-fare').textContent=route.viaTrip?'전체 요금 직접 확인':route.fare===null?'요금 미제공':formatMoney(route.fare)+' (참고)';
    q('transit-summary').textContent=route.summary+` · 약 ${route.duration}분`+(route.viaTrip?' (구간 합계, 경유지 대기시간 제외)':'');
    q('transit-amount-help').textContent=route.viaTrip?'두 구간을 연결한 경로입니다. 환승할인 총액은 확인되지 않아 자동 합산하지 않습니다. 성인 교통카드로 실제 결제한 전체 금액을 직접 입력해 주세요.':'환승을 포함한 경로 전체 참고 요금입니다. 버스·지하철 요금을 따로 더하지 않습니다. 예상 금액도 소비 합계에 포함됩니다.';
    renderTransitSteps(route.steps);q('transit-result').hidden=false;
    q('transit-save-amount').value=route.fare??'';
    if(route.fare!==null||route.viaTrip) transitQuote={...route,...names,steps:route.steps.map(step=>({...step})),referenceFare:route.fare,preference:selectedTransitPreference(),includeVillageBus:q('include-village-bus').checked};
    renderLaneChoices();refreshViaEstimate();updateSaveState();
    if(!route.viaTrip)say(route.fare===null?'이 경로는 요금이 제공되지 않아 자동 저장할 수 없습니다. 결제 직후 입력에서 실제 금액을 기록해 주세요.':(selectedTransitPreference()==='bus-subway'&&!route.busFirst?'버스 → 지하철 경로가 아닌 대안입니다. ':'')+'실제로 탄 노선과 승하차·환승 구간인지 확인해 주세요.');
  }
  const basisLabel=value=>value==='confirmed'?'실제 결제액':'예상 요금';
  function renderLaneChoices() {
    const root=q('transit-lane-choices');root.replaceChildren();
    transitQuote?.steps.forEach((step,index)=>{
      if(step.alternatives.length<2)return;
      step.chosenLane=null;
      const label=document.createElement('label');label.htmlFor='trip-lane-'+index;label.textContent=`${step.startName} → ${step.endName}에서 실제 탄 노선`;
      const select=document.createElement('select');select.id='trip-lane-'+index;
      select.add(new Option('노선을 선택하세요',''));step.alternatives.forEach((lane,i)=>select.add(new Option(lane.name,String(i))));
      select.addEventListener('change',()=>{
        const lane=select.value===''?null:step.alternatives[Number(select.value)];
        step.chosenLane=lane||null;step.name=lane?.name||step.alternatives.map(l=>l.name).join(' / ');
        if(lane)step.mode=lane.mode;
        step.label=`${step.name} · ${step.startName} → ${step.endName}`;
        q('transit-summary').textContent=transitQuote.steps.filter(s=>s.mode!=='walk').map(s=>s.name).join(' → ')+` · 조회 기준 약 ${transitQuote.duration}분`;
        q('transit-ride-confirm').checked=false;renderTransitSteps(transitQuote.steps);refreshViaEstimate();updateSaveState();
      });
      root.append(label,select);
    });
  }
  function validAmount() {
    const raw=String(q('transit-save-amount').value).trim(),value=Number(raw);
    return raw!=='' && Number.isSafeInteger(value) && value>=0 && value%10===0;
  }
  function updateSaveState() {
    const missingLane=transitQuote?.steps.some(step=>step.alternatives.length>1&&!step.chosenLane);
    q('save-transit').disabled=!transitQuote||missingLane||!q('transit-ride-confirm').checked||!validAmount();
    const date=q('quick-date').value||TODAY,basis=q('transit-amount-basis').value;
    q('transit-save-preview').textContent=transitQuote?`${date} · ${basisLabel(basis)} ${validAmount()?formatMoney(Number(q('transit-save-amount').value)):'금액 확인 필요'} · 교통 1건으로 저장됩니다. 이용일은 아래 날짜 선택에서 바꿀 수 있습니다.`:'';
  }
  q('transit-ride-confirm').addEventListener('change',updateSaveState);
  q('transit-save-amount').addEventListener('input',updateSaveState);
  q('quick-date').addEventListener('change',updateSaveState);
  q('transit-amount-basis').addEventListener('change',()=>{
    if(transitQuote?.viaTrip&&transitQuote.referenceFare===null)q('transit-amount-basis').value='confirmed';
    const estimated=q('transit-amount-basis').value!=='confirmed';q('transit-save-amount').readOnly=estimated;
    if(estimated && transitQuote)q('transit-save-amount').value=transitQuote.referenceFare;
    updateSaveState();
  });
  async function calculate() {
    if(!acquire())return;
    const {version,signal,abort}=begin(),points=selection();
    const sides=viaEnabled?['origin','via','destination']:['origin','destination'];
    for(const side of sides)if(!points[side]){say(sideNames[side]+' 정류장을 검색 결과에서 선택해 주세요.',true);q('transit-'+side).focus();release();return;}
    if(viaEnabled&&sides.slice(1).some((side,i)=>points[side].x===points[sides[i]].x&&points[side].y===points[sides[i]].y)){say('경유지는 출발·도착과 다른 지점으로 선택해 주세요.',true);release();return;}
    button.disabled=true;button.textContent='조회 중…';say('ODsay에서 경로와 참고 요금을 조회하고 있습니다.');
    const timer=setTimeout(abort,viaEnabled?40000:20000);
    try {
      if(viaEnabled){
        const settings=waypointData().viaSettings,legs=[];
        for(let i=0;i<2;i++){
          say(`${i+1}/2 구간 경로를 조회하고 있습니다.`);
          const start=points[sides[i]],end=points[sides[i+1]];
          let response;
          try{response=await request('searchPubTransPathT',{SX:start.x,SY:start.y,EX:end.x,EY:end.y,OPT:'0',SearchType:'0',SearchPathType:settings[i].mode},signal);}
          catch(e){if(e.name==='AbortError')throw e;throw new Error(`${i+1}구간: ${e.message}`);}
          if(version!==generation)return;
          let routes;
          try{routes=core.routesWithLine(core.routes(response,{preference:'fastest',includeVillageBus:q('include-village-bus').checked}),settings[i].line);}
          catch(e){throw new Error(`${i+1}구간: ${e.message}`);}
          if(!routes.length)fail(`${i+1}구간 검색 결과에 입력한 노선이 없습니다. 승하차 지점·방면 또는 노선 조건을 확인해 주세요.`);
          legs.push(routes);
        }
        const selects=[];
        const combine=()=>{candidates=[core.joinVia(legs[0][Number(selects[0].value)],legs[1][Number(selects[1].value)],points.via)];choose(0);};
        legs.forEach((routes,i)=>{
          const label=document.createElement('label');label.htmlFor='waypoint-route-'+i;label.textContent=`${i+1}구간: ${points[sides[i]].stationName} → ${points[sides[i+1]].stationName}`;
          const select=document.createElement('select');select.id='waypoint-route-'+i;
          routes.forEach((route,index)=>select.add(new Option(`${index+1}. ${route.duration}분 · ${route.summary}`,String(index))));select.value='0';select.addEventListener('change',combine);
          viaChoices.append(label,select);selects.push(select);
        });
        viaChoices.hidden=false;combine();selects[0].focus();return;
      }
      const response=await request('searchPubTransPathT',{SX:points.origin.x,SY:points.origin.y,EX:points.destination.x,EY:points.destination.y,OPT:'0',SearchType:'0',SearchPathType:'0'},signal);
      if(version!==generation)return;
      candidates=core.routes(response,{preference:selectedTransitPreference(),includeVillageBus:q('include-village-bus').checked});
      routeSelect.replaceChildren();candidates.forEach((route,index)=>routeSelect.add(new Option(`${index+1}. ${route.busFirst?'버스→지하철 · ':''}${route.duration}분 · ${route.fare===null?'요금 미제공':formatMoney(route.fare)} · ${route.summary}`,String(index))));
      options.hidden=false;choose(0);routeSelect.focus();
    }catch(e){if(version===generation){transitQuote=null;q('save-transit').disabled=true;say(e.name==='AbortError'?'응답 시간이 초과되었습니다. 다시 조회해 주세요.':e.message,true);}}
    finally{clearTimeout(timer);release();if(version===generation){button.disabled=false;button.textContent='경로·요금 확인';}}
  }
  routeSelect.addEventListener('change',()=>choose(Number(routeSelect.value)));
  function prepareSave() {
    if(quoteGeneration!==generation||!transitQuote||!selection().origin||!selection().destination||(viaEnabled&&!selection().via)){say('경로를 다시 조회한 후 저장해 주세요.',true);return false;}
    if(transitQuote.viaTrip&&transitQuote.referenceFare===null&&q('transit-amount-basis').value!=='confirmed'){say('자동 계산할 수 없는 경로는 확인한 실제 결제액을 입력해 주세요.',true);return false;}
    if(transitQuote.steps.some(step=>step.alternatives.length>1&&!step.chosenLane)){say('구간별로 실제 탄 노선을 선택해 주세요.',true);return false;}
    if(!q('transit-ride-confirm').checked){say('실제로 탄 경로와 같은지 확인하고 체크해 주세요.',true);q('transit-ride-confirm').focus();return false;}
    const input=q('transit-save-amount'),raw=String(input.value).trim(),amount=Number(raw);
    if(!raw||!Number.isSafeInteger(amount)||amount<0||amount%10!==0){say('금액은 0원 이상, 10원 단위로 입력해 주세요.',true);input.focus();return false;}
    if(q('transit-amount-basis').value!=='confirmed' && amount!==transitQuote.referenceFare){say('예상 요금은 조회값을 사용합니다. 확인한 결제액을 입력하려면 금액 구분을 변경해 주세요.',true);return false;}
    transitQuote.fare=amount;return true;
  }
  function record() {
    if(!transitQuote)return null;
    return {version:transitQuote.viaTrip?3:1,source:'ODsay',origin:transitQuote.origin,destination:transitQuote.destination,stations:selection(),...waypointData(),
      fareEstimate:transitQuote.fareEstimate,
      steps:transitQuote.steps.map(({mode,name,label,startName,endName,duration,leg,distanceM})=>({mode,name,label,startName,endName,duration,leg,distanceM})),
      referenceFare:transitQuote.referenceFare,amountBasis:q('transit-amount-basis').value==='confirmed'?'confirmed':'estimated',
      quotedAt:transitQuote.quotedAt,estimatedDuration:transitQuote.duration,routeConfirmedAt:new Date().toISOString()};
  }
  function appendDetails(root,item) {
    const trip=item.type==='expense'&&item.transit;if(!trip||!Array.isArray(trip.steps))return;
    const section=document.createElement('section');section.className='trip-record-detail';
    const heading=document.createElement('h4');heading.textContent='실제로 탄 경로';
    const description=document.createElement('p');description.textContent=[trip.origin,trip.via,trip.destination].filter(Boolean).join(' → ')+` · 조회 기준 약 ${trip.estimatedDuration}분`+(trip.via?' (경유지 대기시간 제외)':'');
    const reference=document.createElement('p');reference.textContent=trip.via?'경유 구간을 연결한 경로 · 환승할인 총액은 자동 계산하지 않았습니다. 저장 금액은 직접 확인한 실제 전체 결제액입니다.':`경로 전체 예상 요금 ${formatMoney(trip.referenceFare)} · 저장 금액은 ${basisLabel(trip.amountBasis)}입니다. 구간별 요금은 따로 합산하지 않습니다.`;
    if(trip.via&&trip.fareEstimate?.amount!=null)reference.textContent=`환승 예상 요금 ${formatMoney(trip.referenceFare)} · 저장 금액은 ${basisLabel(trip.amountBasis)}입니다. `+estimateDescription(trip.fareEstimate);
    const list=document.createElement('ol');
    const modes={bus:'버스',villageBus:'마을버스',subway:'지하철'};
    trip.steps.forEach(step=>{const li=document.createElement('li');li.textContent=(Number.isInteger(step.leg)?`${step.leg+1}구간 · `:'')+(modes[step.mode]?modes[step.mode]+' · ':'')+step.label;list.append(li);});
    section.append(heading,description,list,reference);root.append(section);
  }
  function prepareEdit(item) {
    if(!item.transit || q('edit-type').value!=='expense')return true;
    const input=q('edit-amount'),raw=input.value.trim(),amount=Number(raw);
    input.setCustomValidity('');
    if(!raw||!Number.isSafeInteger(amount)||amount<0||amount%10!==0){input.setCustomValidity('교통비를 0원 이상, 10원 단위로 입력해 주세요.');input.reportValidity();return false;}
    const basis=q('edit-trip-basis').value==='confirmed'?'confirmed':'estimated';
    if(basis==='estimated'&&amount!==item.transit.referenceFare){input.setCustomValidity('확인한 금액으로 바꿨다면 ‘실제 결제액’을 선택해 주세요. 예상 요금은 원래 조회 금액과 같아야 합니다.');input.reportValidity();return false;}
    item.transit.amountBasis=basis;return true;
  }
  q('edit-amount').addEventListener('input',()=>q('edit-amount').setCustomValidity(''));
  q('edit-trip-basis').addEventListener('change',()=>q('edit-amount').setCustomValidity(''));
  window.DAYFLOW_TRANSIT={calculate,invalidate,restore,selection,prepareSave,record,basisLabel,appendDetails,prepareEdit,waypointData,prepareFavorite,favoriteData,reverse};
  window.DAYFLOW_SUPABASE_CLIENT?.auth.onAuthStateChange((event)=>{
    if(['SIGNED_OUT','SIGNED_IN','USER_UPDATED'].includes(event)) {
      reuse.clear();restrictedUntil=0;
      clearQuote();restore({});
    }
  });
})();
