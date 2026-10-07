(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  // Transient screen state only: never persist provider responses or credentials.
  function createReuse({now=()=>Date.now(),ttl=5*60*1000,max=30}={}){
    const entries=new Map(),pending=new Map();let epoch=0;
    const keyOf=(endpoint,params)=>JSON.stringify([endpoint,Object.keys(params).sort().map(k=>[k,String(params[k])])]);
    return {
      clear(){epoch++;entries.clear();pending.clear();},
      async run(endpoint,params,load,signal){
        if(signal?.aborted)throw new DOMException('Aborted','AbortError');
        const key=keyOf(endpoint,params),entry=entries.get(key);
        if(entry&&now()-entry.at<ttl)return {value:clone(entry.value),reused:true,at:entry.at};
        entries.delete(key);
        if(pending.has(key))return {...await pending.get(key),reused:true};
        const version=epoch;
        const work=(async()=>{
          const value=await load();
          if(signal?.aborted||version!==epoch)throw new DOMException('Aborted','AbortError');
          const at=now();
          if(value?.result&&!value.error){
            entries.set(key,{value:clone(value),at});
            while(entries.size>max)entries.delete(entries.keys().next().value);
          }
          return {value,at,reused:false};
        })();
        pending.set(key,work);
        try{return await work;}finally{if(pending.get(key)===work)pending.delete(key);}
      }
    };
  }
  function reverseDraft(route){
    const out={...clone(route),origin:route.destination,destination:route.origin,preference:'fastest',stations:{},name:'',reversePending:true};
    if(route.viaSettings)out.viaSettings=clone(route.viaSettings).reverse();
    const sides={origin:'destination',via:'via',destination:'origin'};
    for(const [to,from] of Object.entries(sides)){
      const station=route.stations?.[from];
      // Same bus-stop ID is NOT the opposite-direction stop.
      if(station&&Number(station.stationClass)===2)out.stations[to]=clone(station);
    }
    out.searchKinds=Object.fromEntries(Object.entries(sides).map(([to,from])=>[to,route.stations?.[from]?.stationClass===1?'1':route.searchKinds?.[from]||'1:2']));
    return out;
  }
  root.UNHARU_TRANSIT_REUSE={createReuse,reverseDraft};
})(typeof window!=='undefined'?window:globalThis);
