(function(root) {
  'use strict';
  const list = value => Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  const number = value => typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  const text = value => String(value ?? '').slice(0,160);
  const fare = value => Number.isSafeInteger(number(value)) && number(value) > 0 ? number(value) : null;
  function station(value) {
    if (!value || ![1,2].includes(Number(value.stationClass))) return null;
    const x=number(value.x),y=number(value.y);
    if (!Number.isFinite(x)||!Number.isFinite(y)||x<124||x>132||y<32||y>40||!value.stationName) return null;
    return {stationID:text(value.stationID),stationClass:Number(value.stationClass),stationName:text(value.stationName),
      x,y,label:value.label ? text(value.label) : [value.stationName, Number(value.stationClass)===2?'지하철':'버스',value.laneName,
        value.stationCityName||value.laneCity,value.stationDirectionName,value.arsID||value.localStationID].filter(Boolean).map(text).join(' · ')};
  }
  function errorMessage(error) {
    const code=String(error?.code ?? error?.errorCode ?? '');
    const messages={'-98':'출발·도착지가 너무 가깝습니다. 가까운 구간은 요금이 제공되지 않을 수 있습니다.',
      '-99':'검색 결과가 없습니다. 역 이름 끝의 “역”을 빼거나 정류장 이름을 바꿔보세요.',
      '3':'출발지 주변 정류장을 찾지 못했습니다.','4':'도착지 주변 정류장을 찾지 못했습니다.',
      '5':'출발·도착지 주변 정류장을 찾지 못했습니다.','6':'ODsay에서 지원하지 않는 구간입니다.',
      '500':'교통 정보 서비스가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'};
    // Never reflect arbitrary provider strings, which could contain credentials.
    return messages[code] || `교통 조회를 완료하지 못했습니다${/^-?\d{1,5}$/.test(code)?' (코드 '+code+')':''}. 키·등록 주소·이용 한도를 확인해 주세요.`;
  }
  function stationQuery(name, kind='1:2') {
    const trimmed=String(name).trim();
    // ODsay subway names omit the terminal 역. Do not alter bus-only searches
    // or short names such as 역곡; keep a minimum two-character search term.
    const withoutSuffix=trimmed.endsWith('역')?trimmed.slice(0,-1).trim():trimmed;
    const stationName=kind!=='1' && withoutSuffix.length>=2 ? withoutSuffix : trimmed;
    // ODsay documents that omitting pagination returns the complete result set.
    // Rank locally before limiting, so a subway match is not lost behind stops.
    return {stationName,stationClass:kind};
  }
  function stationResults(result, name, kind='1:2') {
    if (!result || typeof result!=='object') throw new Error('정류장 검색 응답을 확인하지 못했습니다. 잠시 후 다시 검색해 주세요.');
    const raw=list(result.station), normalized=raw.map(station).filter(Boolean);
    const query=stationQuery(name,'2').stationName;
    const rank=value=>(stationQuery(value.stationName,'2').stationName===query?0:2)+(value.stationClass===2?0:1);
    const matches=normalized.filter(value=>kind==='1:2'||String(value.stationClass)===kind).sort((a,b)=>rank(a)-rank(b));
    const values=matches.slice(0,50);
    const invalid=raw.length-normalized.length;
    if (!values.length && (invalid || Number(result.totalCount)>raw.length)) {
      throw new Error('검색 응답은 있지만 사용할 수 있는 역·정류장 정보가 없습니다. 잠시 후 다시 검색해 주세요. 계속되면 검색 종류와 검색어를 알려주세요.');
    }
    return {values,total:matches.length,invalid};
  }
  function routes(data, options={}) {
    if (data?.error) throw new Error(errorMessage(list(data.error)[0]));
    const result=data?.result;
    if (!result || Number(result.searchType)!==0) throw new Error('도시간 열차·고속·시외버스의 전체 연결 요금은 아직 지원하지 않습니다. 실제 결제 금액으로 입력해 주세요.');
    const found=list(result.path).map((path,index)=>{
      const parts=list(path.subPath);
      if (!parts.length || parts.some(s=>![1,2,3].includes(Number(s.trafficType)))) return null;
      if (options.includeVillageBus===false && parts.some(s=>Number(s.trafficType)===2 && list(s.lane).some(l=>Number(l.type)===3))) return null;
      const rides=parts.filter(s=>Number(s.trafficType)!==3);
      if (!rides.length) return null;
      const steps=parts.map(s=>{
        const type=Number(s.trafficType),lanes=list(s.lane);
        const mode=type===3?'walk':type===1?'subway':lanes.some(l=>Number(l.type)===3)?'villageBus':'bus';
        const names=lanes.map(l=>text(type===1?l.name:l.busNo)).filter(Boolean).join(' / ');
        return {mode,label:type===3?`도보 ${Number(s.sectionTime)||0}분`:`${names} · ${text(s.startName)} → ${text(s.endName)}`,name:names,
          startName:text(s.startName),endName:text(s.endName),duration:Number(s.sectionTime)||0,
          distanceM:Number.isFinite(number(s.distance))?number(s.distance):null,
          alternatives:lanes.map(l=>({name:text(type===1?l.name:l.busNo),mode:type===1?'subway':Number(l.type)===3?'villageBus':'bus',
            busType:number(l.type),busCityCode:number(l.busCityCode),busID:text(l.busID),subwayCode:number(l.subwayCode)})).filter(l=>l.name)};
      });
      const duration=number(path.info?.totalTime);
      if (!Number.isFinite(duration)||duration<0) return null;
      return {id:index,fare:fare(path.info?.payment),duration,steps,
        busFirst:Number(rides[0].trafficType)===2 && rides.slice(1).some(s=>Number(s.trafficType)===1),
        summary:steps.filter(s=>s.mode!=='walk').map(s=>s.name||s.mode).join(' → '),
        source:'ODsay',quotedAt:data.screenReceivedAt||new Date().toISOString()};
    }).filter(Boolean);
    found.sort((a,b)=>(options.preference==='bus-subway'?Number(b.busFirst)-Number(a.busFirst):0)||a.duration-b.duration);
    if (!found.length) throw new Error(options.includeVillageBus===false?'마을버스를 제외한 경로가 없습니다. 포함 옵션을 켜거나 다른 정류장을 선택해 주세요.':'이 구간의 경로를 찾지 못했습니다. 다른 정류장을 선택해 주세요.');
    return found;
  }
  function routesWithLine(routes, line) {
    const normalize=value=>String(value).replace(/\s+/g,'').replace(/번$/,'').toLowerCase();
    const wanted=normalize(line);if(!wanted)return routes;
    return routes.filter(route=>route.steps.some(step=>step.alternatives.some(lane=>normalize(lane.name)===wanted))).map(route=>({...route,steps:route.steps.map(step=>{
      const matching=step.alternatives.filter(lane=>normalize(lane.name)===wanted);
      return matching.length?{...step,alternatives:matching,name:matching[0].name,mode:matching[0].mode,label:`${matching[0].name} · ${step.startName} → ${step.endName}`}:{...step};
    })})).map(route=>({...route,summary:route.steps.filter(step=>step.mode!=='walk').map(step=>step.name).join(' → ')}));
  }
  function joinVia(first,second,via) {
    if(!first||!second||!station(via))throw new Error('두 구간의 경로와 경유지를 모두 선택해 주세요.');
    const steps=[...first.steps.map(step=>({...step,leg:0})),...second.steps.map(step=>({...step,leg:1}))];
    return {id:0,fare:null,via:via.stationName,viaTrip:true,source:'ODsay',quotedAt:[first.quotedAt,second.quotedAt].filter(Boolean).sort()[0]||new Date().toISOString(),duration:first.duration+second.duration,
      steps,summary:steps.filter(s=>s.mode!=='walk').map(s=>s.name).join(' → '),busFirst:first.steps.find(s=>s.mode!=='walk')?.mode!=='subway'};
  }
  // Adult card estimate, current tariff checked 2026-10-07. Never add leg payments.
  // https://news.seoul.go.kr/traffic/traffic_price
  // https://sftc.seoul.go.kr/seoul/mulga/main/contents.do?menuNo=200021 (cap)
  // ODsay distance excludes walking here; it is not guaranteed to equal fare distance.
  function estimateViaFare(steps) {
    const unavailable=reason=>({amount:null,reason});
    const rides=steps.filter(s=>s.mode!=='walk');
    if(rides.length<2)return unavailable('환승 구간 정보가 충분하지 않습니다.');
    if(rides.some(s=>!Number.isFinite(s.distanceM)||s.distanceM<=0||s.distanceM>300000))return unavailable('일부 탑승 구간의 이동거리 정보가 없습니다.');
    const lanes=rides.map(s=>s.chosenLane || (s.alternatives?.length===1?s.alternatives[0]:null));
    if(lanes.some(l=>!l))return unavailable('구간별로 실제 탄 노선을 선택하면 예상 요금을 계산합니다.');
    const bases=[];const busKeys=new Set();let subwayBlocks=0,boardings=0,subwayDistance=0;
    for(let i=0;i<rides.length;i++){
      const lane=lanes[i],isSubway=lane.mode==='subway';
      if(isSubway){
        if(![2,3,4,5,6,7,8,9].includes(lane.subwayCode))return unavailable('이 지하철 노선의 별도·구간 요금은 아직 자동 계산하지 않습니다.');
        if(i===0||lanes[i-1].mode!=='subway'){subwayBlocks++;boardings++;}
        // A waypoint between two subway legs may mean exiting and re-entering.
        if(i>0&&lanes[i-1].mode==='subway'&&rides[i].leg!==rides[i-1].leg)return unavailable('지하철 경유지의 개찰구 재진입 여부를 확인할 수 없어 자동 계산하지 않습니다.');
        subwayDistance+=rides[i].distanceM;bases.push(1550);
      }else{
        const base={3:1200,11:1500,12:1500,13:1400}[lane.busType];
        if(lane.busCityCode!==1000||!base||/^N/i.test(lane.name))return unavailable('현재 경유 자동 계산은 서울 마을·간선·지선·순환버스와 수도권 지하철 2~9호선만 지원합니다.');
        const key=lane.busID||lane.name.replace(/\s/g,'');
        if(busKeys.has(key))return unavailable('같은 버스 노선 재탑승에는 환승할인을 가정할 수 없습니다.');
        busKeys.add(key);boardings++;bases.push(base);
      }
    }
    if(subwayBlocks>1||boardings>5)return unavailable('지하철 재진입 또는 5회 초과 탑승은 자동 계산하지 않습니다.');
    if(!busKeys.size)return unavailable('지하철만 이용하는 경유 경로는 개찰구 조건을 확인해 주세요.');
    const distanceM=Math.ceil(rides.reduce((sum,s)=>sum+s.distanceM,0)-1e-6);
    const base=Math.max(...bases),surcharge=Math.ceil(Math.max(0,distanceM-10000)/5000)*100;
    const subwayFare=subwayBlocks?1550+Math.ceil(Math.max(0,Math.min(subwayDistance,50000)-10000)/5000)*100+Math.ceil(Math.max(0,subwayDistance-50000)/8000)*100:0;
    const separateCap=bases.reduce((sum,b,i)=>sum+(lanes[i].mode==='subway'?0:b),0)+subwayFare;
    return {amount:Math.min(base+surcharge,separateCap),base,surcharge,separateCap,distanceM,
      method:'seoul-adult-transfer-distance-v1',tariffCheckedAt:'2026-10-07',
      assumption:'성인 교통카드 1인·승하차 태그·30분 이내 환승(21~07시 60분)·최대 5회 탑승 가정. 조조·카드사 할인 미반영. 조회 이동거리와 실제 운임거리는 다를 수 있습니다.'};
  }
  root.UNHARU_TRANSIT_CORE={list,station,stationQuery,stationResults,routes,routesWithLine,joinVia,estimateViaFare,fare,errorMessage};
})(typeof window!=='undefined'?window:globalThis);
