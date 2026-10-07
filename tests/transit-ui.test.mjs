import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
class Element {
  constructor(){this.value='';this.hidden=false;this.disabled=false;this.dataset={};this.children=[];this.events={};this.attributes={};this.checked=true;}
  append(...children){this.children.push(...children);}
  before(){} after(){} focus(){this.focused=true;}
  add(option){this.children.push(option);}
  replaceChildren(...children){this.children=children;this.value='';}
  setAttribute(name,value){this.attributes[name]=value;}
  setCustomValidity(value){this.validationMessage=value;}
  reportValidity(){return !this.validationMessage;}
  removeAttribute(name){delete this.attributes[name];}
  addEventListener(event,handler){(this.events[event]??=[]).push(handler);}
  async fire(event){for(const fn of this.events[event]||[])await fn({key:'Enter',preventDefault(){}});}
}
const station=(name,x)=>({stationName:name,stationClass:2,x,y:37.5,stationID:x});
const result={result:{searchType:0,path:[{info:{payment:1670,totalTime:35},subPath:[{trafficType:2,lane:[{type:3,busNo:'마을01'}],startName:'A',endName:'B'},{trafficType:1,lane:[{name:'2호선'}],startName:'B',endName:'C'}]}]}};
function harness(routeResponse=result,stationReply=null){
  const elements=new Map(),q=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  let authCallback,calls=[],stationKinds=[],stationParams=[],routeParams=[],saved=[],favorites=[],nextResponse=null;
  q('transit-remember').checked=false;
  const window={DAYFLOW_SUPABASE_CLIENT:{auth:{getSession:async()=>({data:{session:{access_token:'fake'}}}),onAuthStateChange:fn=>{authCallback=fn;}}}};
  const ctx=vm.createContext({window,document:{querySelector:()=>q('preference-fastest'),getElementById:q,createElement:tag=>{
    const el=new Element();Object.defineProperty(el,'id',{set:id=>elements.set(id,el)});return el;
  }},Option:class{constructor(text,value){this.text=text;this.value=value;}},fetch:async(url,options)=>{
    calls.push(url);
    if(url==='/api/transit-key')return Response.json({apiKey:'fake-key'});
    if(url.endsWith('searchStation')){stationKinds.push(options.body.get('stationClass'));stationParams.push(Object.fromEntries(options.body));return Response.json(stationReply || {result:{station:[station(options.body.get('stationName').replace('역',''),127)]}});}
    routeParams.push(Object.fromEntries(options.body));
    if(nextResponse)return nextResponse();
    return Response.json(typeof routeResponse==='function'?routeResponse(routeParams.length):routeResponse);
  },Response,AbortController,DOMException,URLSearchParams,setTimeout,clearTimeout,
  formatMoney:n=>n.toLocaleString()+'원',renderTransitSteps:()=>{},selectedTransitPreference:()=> 'bus-subway',
  transitConditionLabel:()=>'',currentTime:()=> '12:00',TODAY:'2026-10-06',saveCurrentTransitRoute:()=>favorites.push(true),
  renderView:()=>{},persist:()=>saved.push(true),$:selector=>q(selector.slice(1))});
  vm.runInContext(`let transitQuote=null,items=[],viewDate=null; function resetTransitResult(){window.DAYFLOW_TRANSIT?.invalidate();transitQuote=null;document.getElementById('save-transit').disabled=true;document.getElementById('transit-result').hidden=true;}`,ctx);
  for(const side of ['origin','destination'])q('transit-'+side).addEventListener('input',()=>vm.runInContext('resetTransitResult()',ctx));
  vm.runInContext(readFileSync(new URL('../assets/transit-core.js',import.meta.url),'utf8'),ctx);
  vm.runInContext(readFileSync(new URL('../assets/transit-reuse.js',import.meta.url),'utf8'),ctx);
  vm.runInContext(readFileSync(new URL('../assets/transit.js',import.meta.url),'utf8'),ctx);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  vm.runInContext(html.slice(html.indexOf('    function saveTransitExpense()'),html.indexOf("    $('#calculate-transit').addEventListener")),ctx);
  function restore(){q('transit-origin').value='출발';q('transit-destination').value='도착';window.DAYFLOW_TRANSIT.restore({origin:'출발',destination:'도착',stations:{origin:station('출발',127),destination:station('도착',127.1)}});}
  return {q,window,ctx,calls,stationKinds,stationParams,routeParams,saved,favorites,restore,auth:event=>authCallback(event),delay:fn=>{nextResponse=fn;}};
}
test('search requires explicit action and selection adopts exact stop name',async()=>{
  const h=harness();h.q('transit-origin').value='서울역';await h.q('transit-origin').fire('input');assert.equal(h.calls.length,0);
  await h.q('transit-origin').fire('keydown');
  for(let i=0;i<30 && h.q('station-origin').children.length<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(h.q('station-origin').children.length,2);
  h.q('station-origin').value='0';await h.q('station-origin').fire('change');
  assert.equal(h.q('transit-origin').value,'서울');assert.equal(h.window.DAYFLOW_TRANSIT.selection().origin.stationName,'서울');
});
test('route query never writes, user-confirmed 10-won amount saves once via existing storage',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  assert.equal(h.saved.length,0);assert.equal(h.q('save-transit').disabled,true);
  h.q('transit-ride-confirm').checked=true;await h.q('transit-ride-confirm').fire('change');
  h.q('transit-amount-basis').value='confirmed';await h.q('transit-amount-basis').fire('change');
  h.q('transit-save-amount').value='1680';h.q('quick-date').value='2026-10-01';h.q('quick-input').value='memo';
  h.q('transit-trip-time').value='08:30';
  vm.runInContext('saveTransitExpense();saveTransitExpense();',h.ctx);
  assert.equal(h.saved.length,1);assert.equal(vm.runInContext('items.length',h.ctx),1);
  assert.equal(vm.runInContext('items[0].amount',h.ctx),1680);assert.equal(vm.runInContext('items[0].date',h.ctx),'2026-10-01');
  assert.equal(vm.runInContext('items[0].category',h.ctx),'교통');
  assert.equal(vm.runInContext('items[0].transit.amountBasis',h.ctx),'confirmed');
  assert.equal(vm.runInContext('items[0].transit.referenceFare',h.ctx),1670);
  assert.equal(vm.runInContext('items[0].transit.steps[0].startName',h.ctx),'A');
  assert.equal(vm.runInContext('items[0].transit.steps[1].endName',h.ctx),'C');
  assert.equal(vm.runInContext('items[0].notes',h.ctx),'memo');
  assert.equal(vm.runInContext('items[0].time',h.ctx),'08:30');
  assert.equal(h.favorites.length,0);
});
test('invalid editable amount blocks save',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  h.q('transit-ride-confirm').checked=true;h.q('transit-amount-basis').value='confirmed';
  for(const value of ['', '1681','-10','NaN']){h.q('transit-save-amount').value=value;assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);}
  assert.equal(h.saved.length,0);
});
test('editing input invalidates previously quoted fare',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  h.q('transit-origin').value='다른곳';await h.q('transit-origin').fire('input');
  assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);assert.equal(h.q('save-transit').disabled,true);
});
test('late route response after signout cannot restore a quote',async()=>{
  const h=harness();h.restore();let complete;
  h.delay(()=>new Promise(resolve=>{complete=()=>resolve(Response.json(result));}));
  const pending=h.window.DAYFLOW_TRANSIT.calculate();
  while(!complete)await new Promise(resolve=>setTimeout(resolve,1));
  h.auth('SIGNED_OUT');complete();await pending;
  assert.equal(h.q('save-transit').disabled,true);assert.equal(vm.runInContext('transitQuote',h.ctx),null);
  assert.equal(h.saved.length,0);
});
test('legacy saved routes remain usable but need exact station selection once',async()=>{
  const h=harness();h.window.DAYFLOW_TRANSIT.restore({origin:'old',destination:'old2'});
  await h.window.DAYFLOW_TRANSIT.calculate();assert.equal(h.calls.length,0);assert.match(h.q('transit-status').textContent,/선택/);
});
test('subway filter reaches API and switching it invalidates an old quote',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  h.q('station-kind-origin').value='2';await h.q('station-kind-origin').fire('change');
  assert.equal(h.q('save-transit').disabled,true);assert.equal(h.window.DAYFLOW_TRANSIT.selection().origin,undefined);
  await h.q('transit-origin').fire('keydown');
  for(let i=0;i<30&&!h.stationKinds.length;i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.deepEqual(h.stationKinds,['2']);
});
test('estimated fare is explicit, route confirmation required and persisted detail survives JSON roundtrip',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  vm.runInContext('saveTransitExpense()',h.ctx);assert.equal(h.saved.length,0);
  h.q('transit-ride-confirm').checked=true;
  vm.runInContext('saveTransitExpense()',h.ctx);
  const item=JSON.parse(vm.runInContext('JSON.stringify(items[0])',h.ctx));
  assert.equal(item.amount,1670);assert.equal(item.transit.amountBasis,'estimated');
  assert.equal(item.time,'');
  assert.equal(item.transit.steps[0].mode,'villageBus');assert.equal(item.transit.steps[1].name,'2호선');
  const root=new Element();h.window.DAYFLOW_TRANSIT.appendDetails(root,item);
  assert.equal(root.children.length,1);assert.equal(root.children[0].children[2].children.length,2);
  assert.match(root.children[0].children[3].textContent,/예상 요금/);
  const legacy=new Element();h.window.DAYFLOW_TRANSIT.appendDetails(legacy,{type:'expense',amount:3000});assert.equal(legacy.children.length,0);
});
test('alternative bus lines require actual selection, changing selection resets confirmation',async()=>{
  const response=structuredClone(result);response.result.path[0].subPath[0].lane.push({type:11,busNo:'321'});
  const h=harness(response);h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  h.q('transit-ride-confirm').checked=true;assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);
  h.q('trip-lane-0').value='1';await h.q('trip-lane-0').fire('change');
  assert.equal(h.q('transit-ride-confirm').checked,false);
  h.q('transit-ride-confirm').checked=true;
  assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),true);
  const saved=h.window.DAYFLOW_TRANSIT.record();assert.equal(saved.steps[0].name,'321');assert.equal(saved.steps[0].mode,'bus');
  assert.equal(saved.referenceFare,1670);
});
test('route switching resets actual confirmation and restores estimated fare',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();
  h.q('transit-ride-confirm').checked=true;h.q('transit-amount-basis').value='confirmed';h.q('transit-save-amount').value='2000';
  h.q('transit-route-choice').value='0';await h.q('transit-route-choice').fire('change');
  assert.equal(h.q('transit-ride-confirm').checked,false);assert.equal(h.q('transit-amount-basis').value,'estimated');assert.equal(h.q('save-transit').disabled,true);
});
test('favorite save is optional; edited amount must be labeled as confirmed',async()=>{
  const h=harness();h.restore();await h.window.DAYFLOW_TRANSIT.calculate();h.q('transit-ride-confirm').checked=true;
  h.q('transit-save-amount').value='1800';assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);
  h.q('transit-amount-basis').value='confirmed';await h.q('transit-amount-basis').fire('change');
  h.q('transit-remember').checked=true;vm.runInContext('saveTransitExpense()',h.ctx);
  assert.equal(h.favorites.length,1);assert.equal(h.saved.length,1);
});
test('editing saved trip preserves route and reference fare; actual amount status requires explicit choice',async()=>{
  const h=harness(),item={transit:{referenceFare:1670,amountBasis:'estimated',steps:[{name:'321'}]}};
  h.q('edit-type').value='expense';h.q('edit-amount').value='1680';h.q('edit-trip-basis').value='estimated';
  assert.equal(h.window.DAYFLOW_TRANSIT.prepareEdit(item),false);
  h.q('edit-trip-basis').value='confirmed';assert.equal(h.window.DAYFLOW_TRANSIT.prepareEdit(item),true);
  assert.equal(item.transit.referenceFare,1670);assert.equal(item.transit.steps[0].name,'321');assert.equal(item.transit.amountBasis,'confirmed');
});

async function searchDestination(h,name,kind='1:2') {
  h.q('station-kind-destination').value=kind;
  h.q('transit-destination').value=name;
  await h.q('transit-destination').fire('keydown');
  for(let i=0;i<100 && (!h.stationParams.length || h.q('transit-status').textContent==='정류장을 찾고 있습니다.');i++)await new Promise(resolve=>setTimeout(resolve,1));
}
test('single subway result survives; suffix normalized and no provider pagination',async()=>{
  const h=harness(result,{result:{totalCount:1,station:station('신중동',126.77)}});
  await searchDestination(h,'신중동역','2');
  const params=h.stationParams[0];
  assert.equal(params.stationName,'신중동');assert.equal(params.stationClass,'2');
  assert.equal('startNO' in params,false);assert.equal('displayCnt' in params,false);
  assert.equal(h.q('station-destination').hidden,false);
  h.q('station-destination').value='0';await h.q('station-destination').fire('change');
  assert.equal(h.window.DAYFLOW_TRANSIT.selection().destination.stationName,'신중동');
  assert.equal(h.saved.length,0);assert.equal(h.favorites.length,0);
  assert.equal(h.stationParams.length,1);
});
test('invalid provider coordinates are explained, not falsely reported as no results',async()=>{
  const h=harness(result,{result:{totalCount:1,station:[{...station('신중동',126.77),y:''}]}});
  await searchDestination(h,'신중동');
  assert.equal(h.q('station-destination').hidden,true);
  assert.match(h.q('station-help-destination').textContent,/검색 응답은 있지만/);
  assert.equal(h.saved.length,0);
});
test('empty response explains recovery near destination field',async()=>{
  const h=harness(result,{result:{totalCount:0,station:[]}});
  await searchDestination(h,'없는역');
  assert.equal(h.q('station-destination').hidden,true);
  assert.match(h.q('station-help-destination').textContent,/검색 종류를 확인/);
});

function viaRestore(h){h.restore();h.window.DAYFLOW_TRANSIT.restore({origin:'출발',via:'강변',destination:'도착',stations:{origin:station('출발',127),via:station('강변',127.05),destination:station('도착',127.1)},viaSettings:[{mode:'2',line:'마을01'},{mode:'1',line:''}]});}
const pricedLeg=n=>({result:{searchType:0,path:[{info:{payment:n===1?1200:1950,totalTime:30},subPath:[{trafficType:n===1?2:1,distance:n===1?4000:26000,sectionTime:30,startName:n===1?'출발':'강변',endName:n===1?'강변':'도착',lane:n===1?[{type:3,busNo:'마을01',busCityCode:1000,busID:1}]:[{name:'수도권 2호선',subwayCode:2}]}]}]}});
test('supported waypoint automatically fills transfer estimate, persists provenance, allows actual correction',async()=>{
  const h=harness(pricedLeg);viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  assert.equal(h.q('transit-save-amount').value,1950);assert.equal(h.q('transit-amount-basis').value,'estimated');assert.equal(h.q('transit-amount-basis').disabled,false);
  assert.equal(h.q('save-transit').disabled,true);assert.equal(h.routeParams.length,2);
  h.q('transit-ride-confirm').checked=true;h.q('transit-save-amount').value='1800';assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);
  h.q('transit-amount-basis').value='confirmed';await h.q('transit-amount-basis').fire('change');assert.equal(h.q('transit-save-amount').readOnly,false);
  vm.runInContext('saveTransitExpense()',h.ctx);
  const item=JSON.parse(vm.runInContext('JSON.stringify(items[0])',h.ctx));assert.equal(item.amount,1800);assert.equal(item.transit.referenceFare,1950);assert.equal(item.transit.amountBasis,'confirmed');assert.equal(item.transit.fareEstimate.distanceM,30000);
  const root=new Element();h.window.DAYFLOW_TRANSIT.appendDetails(root,item);assert.match(root.children[0].children[3].textContent,/환승 예상 요금/);
});
test('supported waypoint saves estimated amount only after route confirmation and recalculates on change',async()=>{
  const h=harness(pricedLeg);viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  h.q('transit-amount-basis').value='confirmed';h.q('transit-save-amount').value='9990';h.q('transit-ride-confirm').checked=true;
  await h.q('waypoint-route-1').fire('change');assert.equal(h.q('transit-save-amount').value,1950);assert.equal(h.q('transit-ride-confirm').checked,false);
  assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);h.q('transit-ride-confirm').checked=true;vm.runInContext('saveTransitExpense()',h.ctx);
  assert.equal(vm.runInContext('items[0].amount',h.ctx),1950);assert.equal(vm.runInContext('items[0].transit.amountBasis',h.ctx),'estimated');
});
test('waypoint sends two ordered route calls with independent modes, never sums fares',async()=>{
  const h=harness();viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  assert.equal(h.routeParams.length,2);
  assert.deepEqual(h.routeParams.map(p=>[p.SX,p.EX,p.SearchPathType]),[['127','127.05','2'],['127.05','127.1','1']]);
  assert.equal(h.q('transit-save-amount').value,'');assert.equal(h.q('transit-save-amount').readOnly,false);
  assert.equal(h.q('transit-amount-basis').value,'confirmed');assert.equal(h.q('transit-amount-basis').disabled,true);
  assert.equal(h.q('save-transit').disabled,true);assert.equal(h.window.DAYFLOW_TRANSIT.record().referenceFare,null);
  assert.match(h.q('transit-route-name').textContent,/출발 → 강변 → 도착/);
  assert.equal(h.saved.length,0);
});
test('waypoint trip requires actual amount and persists via, legs and user memo once',async()=>{
  const h=harness();viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();h.q('transit-ride-confirm').checked=true;
  assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);
  h.q('transit-save-amount').value='2370';h.q('quick-input').value='퇴근';
  vm.runInContext('saveTransitExpense();saveTransitExpense()',h.ctx);
  assert.equal(h.saved.length,1);
  const item=JSON.parse(vm.runInContext('JSON.stringify(items[0])',h.ctx));
  assert.equal(item.amount,2370);assert.equal(item.transit.via,'강변');assert.equal(item.transit.stations.via.x,127.05);
  assert.equal(item.transit.referenceFare,null);assert.equal(item.transit.amountBasis,'confirmed');assert.equal(item.transit.steps.length,4);
  assert.equal(item.title,'출발 → 강변 → 도착');assert.equal(item.notes,'퇴근');
  assert.equal(h.q('waypoint-field').hidden,true);
});
test('unselected waypoint blocks lookup but input conditions can be saved without quota',async()=>{
  const h=harness();h.restore();await h.q('toggle-waypoint').fire('click');h.q('transit-via').value='강변';
  await h.window.DAYFLOW_TRANSIT.calculate();assert.equal(h.routeParams.length,0);assert.equal(h.window.DAYFLOW_TRANSIT.prepareFavorite(),true);
  viaRestore(h);h.window.DAYFLOW_TRANSIT.restore({origin:'출발',via:'출발',destination:'도착',stations:{origin:station('출발',127),via:station('출발',127),destination:station('도착',127.1)}});
  await h.window.DAYFLOW_TRANSIT.calculate();assert.equal(h.routeParams.length,0);assert.match(h.q('transit-status').textContent,/다른 지점/);
});
test('waypoint editing, removal, or settings change invalidates quote',async()=>{
  for(const action of ['via','mode','remove']){
    const h=harness();viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
    if(action==='via'){h.q('transit-via').value='다른역';await h.q('transit-via').fire('input');}
    if(action==='mode')await h.q('waypoint-mode-0').fire('change');
    if(action==='remove')await h.q('toggle-waypoint').fire('click');
    assert.equal(h.window.DAYFLOW_TRANSIT.prepareSave(),false);assert.equal(h.q('waypoint-choices').hidden,true);
  }
});
test('failed second segment cannot save partial route or stale quote',async()=>{
  const h=harness(n=>n===2?{error:{code:500}}:result);viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  assert.equal(h.window.DAYFLOW_TRANSIT.record(),null);assert.equal(h.q('save-transit').disabled,true);
  assert.match(h.q('transit-status').textContent,/2구간/);assert.equal(h.saved.length,0);
});
test('no matching line fails visibly and avoids requesting second segment',async()=>{
  const h=harness();viaRestore(h);h.q('waypoint-line-0').value='강동99';await h.window.DAYFLOW_TRANSIT.calculate();
  assert.equal(h.routeParams.length,1);assert.match(h.q('transit-status').textContent,/1구간.*노선이 없습니다/);assert.equal(h.window.DAYFLOW_TRANSIT.record(),null);
});
test('restoring waypoint favorite retains settings; legacy route removes waypoint',()=>{
  const h=harness();viaRestore(h);
  const copy=JSON.parse(JSON.stringify({...h.window.DAYFLOW_TRANSIT.waypointData(),stations:h.window.DAYFLOW_TRANSIT.selection(),origin:'출발',destination:'도착'}));
  h.window.DAYFLOW_TRANSIT.restore(copy);assert.equal(h.window.DAYFLOW_TRANSIT.selection().via.stationName,'강변');assert.equal(h.q('waypoint-mode-0').value,'2');assert.equal(h.q('waypoint-line-0').value,'마을01');
  h.restore();assert.equal(h.q('waypoint-field').hidden,true);assert.equal(h.window.DAYFLOW_TRANSIT.selection().via,undefined);
});
test('selecting another segment resets confirmation and previously typed total',async()=>{
  const h=harness();viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();h.q('transit-save-amount').value='9990';h.q('transit-ride-confirm').checked=true;
  await h.q('waypoint-route-0').fire('change');
  assert.equal(h.q('transit-save-amount').value,'');assert.equal(h.q('transit-ride-confirm').checked,false);
});

test('repeat route and waypoint queries reuse screen responses, never write expenses',async()=>{
  const h=harness(pricedLeg);viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  const quoted=h.window.DAYFLOW_TRANSIT.record().quotedAt;
  await h.window.DAYFLOW_TRANSIT.calculate();
  assert.equal(h.routeParams.length,2);assert.match(h.q('transit-reuse-status').textContent,/새 조회 0회.*재사용 2회/);
  assert.equal(h.window.DAYFLOW_TRANSIT.record().quotedAt,quoted);assert.equal(h.saved.length,0);
});
test('pending double calculate does not abort and resend; changes invalidate response',async()=>{
  const h=harness();h.restore();let complete;
  h.delay(()=>new Promise(resolve=>{complete=()=>resolve(Response.json(result));}));
  const pending=h.window.DAYFLOW_TRANSIT.calculate();
  while(!complete)await new Promise(resolve=>setTimeout(resolve,1));
  await h.window.DAYFLOW_TRANSIT.calculate();assert.equal(h.routeParams.length,1);
  h.q('transit-origin').value='다른곳';await h.q('transit-origin').fire('input');complete();await pending;
  assert.equal(h.window.DAYFLOW_TRANSIT.record(),null);assert.equal(h.saved.length,0);
});
test('429 stops immediate retry, is explicit, and partial success reused',async()=>{
  const h=harness(n=>n===2?{error:{code:429}}:result);viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  assert.match(h.q('transit-status').textContent,/429/);assert.equal(h.routeParams.length,2);
  await h.window.DAYFLOW_TRANSIT.calculate();assert.equal(h.routeParams.length,2);
  assert.match(h.q('transit-status').textContent,/1분/);assert.match(h.q('transit-reuse-status').textContent,/새 조회 0회.*재사용 1회/);
});
test('reverse button is local, swaps names/settings, clears bus stop and fare',async()=>{
  const h=harness(pricedLeg);viaRestore(h);await h.window.DAYFLOW_TRANSIT.calculate();
  const route={origin:'출발',via:'강변',destination:'도착',stations:{origin:{...station('출발',127),stationClass:1},via:station('강변',127.05),destination:station('도착',127.1)},viaSettings:[{mode:'2',line:'강동01'},{mode:'1',line:'2호선'}]};
  h.window.DAYFLOW_TRANSIT.restore(route);const calls=h.calls.length;
  await h.q('reverse-transit').fire('click');assert.equal(h.calls.length,calls);
  assert.equal(h.q('transit-origin').value,'도착');assert.equal(h.q('transit-destination').value,'출발');
  assert.equal(h.q('waypoint-mode-0').value,'1');assert.equal(h.q('waypoint-line-1').value,'강동01');
  assert.equal(h.window.DAYFLOW_TRANSIT.selection().destination,undefined);assert.equal(h.window.DAYFLOW_TRANSIT.record(),null);
  assert.equal(h.q('save-transit').disabled,true);assert.match(h.q('transit-return-help').textContent,/반대편/);
});
