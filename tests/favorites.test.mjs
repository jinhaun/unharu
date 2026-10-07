import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function harness(initial='[]',deny=false){
  let stored=initial,writes=0,points={};const nodes=new Map();
  const q=s=>{if(!nodes.has(s))nodes.set(s,{value:'',checked:true,dataset:{},focus(){}});return nodes.get(s);};
  q('#transit-origin').value='A';q('#transit-destination').value='B';
  const ctx=vm.createContext({$:q,Date,Math,JSON,window:{DAYFLOW_TRANSIT:{prepareFavorite:()=>true,selection:()=>points,waypointData:()=>({}),favoriteData:()=>({name:'출근길'})}},
    selectedTransitPreference:()=> 'fastest',showToast(){},localStorage:{getItem:()=>stored,setItem:(key,value)=>{if(deny)throw Error('blocked');stored=value;writes++;}}});
  vm.runInContext(`const ROUTE_STORAGE_KEY='test';let savedRoutesReadFailed=false;`+html.slice(html.indexOf('    function loadSavedTransitRoutes()'),html.indexOf('    function persist(message=')),ctx);
  vm.runInContext(`let savedTransitRoutes=loadSavedTransitRoutes();function renderSavedTransitRoutes(){}`,ctx);
  const fn=html.slice(html.indexOf('    function routeSignature('),html.indexOf('    function renderSavedTransitRoutes()'))+
    html.slice(html.indexOf('    function saveCurrentTransitRoute('),html.indexOf('    function renderTransitSteps('));
  vm.runInContext(fn,ctx);
  return {ctx,q,save:()=>vm.runInContext('saveCurrentTransitRoute()',ctx),get:()=>JSON.parse(vm.runInContext('JSON.stringify(savedTransitRoutes)',ctx)),stored:()=>stored,writes:()=>writes,points:p=>{points=p;}};
}
test('favorite conditions persist without API or response; repeat save updates existing route',()=>{
  const h=harness();h.save();h.save();assert.equal(h.get().length,1);assert.equal(h.get()[0].name,'출근길');
  h.points({origin:{stationClass:1,stationID:10,x:127,y:37}});h.save();assert.equal(h.get().length,1);
  assert.equal(h.get()[0].stations.origin.stationID,10);assert.equal(h.get()[0].fare,undefined);assert.equal(h.get()[0].result,undefined);
  assert.deepEqual(JSON.parse(h.stored()),h.get());
});
test('different same-named bus stop is not merged',()=>{
  const h=harness();h.points({origin:{stationClass:1,stationID:10,x:127,y:37}});h.save();
  h.points({origin:{stationClass:1,stationID:11,x:127.01,y:37}});h.save();assert.equal(h.get().length,2);
});
test('20 favorites block new save, never evict old entries',()=>{
  const initial=JSON.stringify(Array.from({length:20},(_,i)=>({id:i,origin:'A'+i,destination:'B'})));
  const h=harness(initial);assert.equal(h.save(),null);assert.equal(h.stored(),initial);assert.equal(h.get().length,20);assert.equal(h.writes(),0);
});
test('write denied rolls back memory; corrupt storage blocks overwrite',()=>{
  const h=harness('[]',true);assert.equal(h.save(),null);assert.equal(h.get().length,0);assert.equal(h.stored(),'[]');
  for(const value of ['broken','{}']){const bad=harness(value);assert.equal(bad.save(),null);assert.equal(bad.stored(),value);assert.equal(bad.writes(),0);}
});
