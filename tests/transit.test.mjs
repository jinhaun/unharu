import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {authorize} from '../api/transit-key.js';
import '../assets/transit-core.js';
const core=globalThis.UNHARU_TRANSIT_CORE;
const env={ODSAY_API_KEY:'fake-unit-test-key',ODSAY_ALLOWED_EMAIL:'owner@example.test'};
const request=(headers={},method='POST')=>new Request('https://unharu.vercel.app/api/transit-key',{method,headers:{Origin:'https://unharu.vercel.app',Authorization:'Bearer test-token',...headers}});
const owner={id:'owner',email:'owner@example.test',email_confirmed_at:'2026-01-01',is_anonymous:false};
const fetchUser=value=>async()=>Response.json(value);
test('endpoint rejects missing token, wrong origin, GET without calling auth',async()=>{
  const nope=()=>{throw new Error('Should not fetch');};
  for(const [req,status] of [[request({Authorization:''}),401],[request({Origin:'https://evil.test'}),403],[request({},'GET'),405]])assert.equal((await authorize(req,env,nope)).status,status);
});
test('owner-only, confirmed email; user_metadata cannot grant permission',async()=>{
  for(const user of [{...owner,email:'other@example.test'},{...owner,email_confirmed_at:null},{...owner,is_anonymous:true},{id:'attacker',user_metadata:owner}])assert.equal((await authorize(request(),env,fetchUser(user))).status,403);
});
test('valid owner receives only key with no shared caching',async()=>{
  const response=await authorize(request(),env,fetchUser(owner));assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(await response.json(),{apiKey:env.ODSAY_API_KEY});
});
test('missing config / upstream denial / outage fail closed without reflecting secrets',async()=>{
  assert.equal((await authorize(request(),{},fetchUser(owner))).status,503);
  for(const fetcher of [async()=>new Response('',{status:401}),async()=>{throw new Error(env.ODSAY_API_KEY);}]){
    const response=await authorize(request(),env,fetcher);assert.notEqual(response.status,200);assert.equal((await response.text()).includes(env.ODSAY_API_KEY),false);
  }
});
const bus=(type=11)=>({trafficType:2,lane:[{type,busNo:'701'}],startName:'A',endName:'B'});
const subway={trafficType:1,lane:[{name:'2호선'}],startName:'B',endName:'C'};
const path=(parts,payment=1550,totalTime=30)=>({info:{payment,totalTime},subPath:parts});
const response=paths=>({result:{searchType:0,path:paths}});
test('fares retain ten-won precision, reject missing, boolean, negative, malformed',()=>{
  assert.equal(core.fare('1670'),1670);
  for(const value of [null,undefined,'',false,NaN,Infinity,-1,0,'1,550','bad'])assert.equal(core.fare(value),null);
});
test('bus then subway preferred without claiming reversed order matches',()=>{
  const routes=core.routes(response([path([subway,bus()],1550,10),path([bus(),subway],1670,50)]),{preference:'bus-subway'});
  assert.equal(routes[0].busFirst,true);assert.equal(routes[0].fare,1670);
  const fastest=core.routes(response([path([bus(),subway],1670,50),path([subway,bus()],1550,10)]),{preference:'fastest'});
  assert.equal(fastest[0].duration,10);
});
test('village bus marked and excluded when requested; no result is explicit',()=>{
  assert.equal(core.routes(response([path([bus(3),subway])]))[0].steps[0].mode,'villageBus');
  assert.throws(()=>core.routes(response([path([bus(3),subway])]),{includeVillageBus:false}),/마을버스/);
});
test('missing fare is not zero and intercity or malformed routes cannot save',()=>{
  assert.equal(core.routes(response([path([subway],null)]))[0].fare,null);
  assert.throws(()=>core.routes({result:{searchType:1}}),/도시간/);
  assert.throws(()=>core.routes(response([path([{trafficType:4}])])),/찾지/);
});
test('station validation accepts nationwide coordinates, rejects missing',()=>{
  assert.ok(core.station({stationClass:1,stationName:'정류장',stationID:1,x:126.5,y:33.4}));
  assert.equal(core.station({stationClass:1,stationName:'정류장',x:null,y:null}),null);
  assert.equal(core.station({stationClass:6,stationName:'터미널',x:127,y:37}),null);
});
test('provider errors do not reflect arbitrary messages',()=>{
  assert.equal(core.errorMessage({code:'invalid',message:env.ODSAY_API_KEY}).includes(env.ODSAY_API_KEY),false);
  assert.match(core.errorMessage({code:-98}),/가깝/);
});
test('existing records, auth source, configuration and storage keys preserved',()=>{
  const current=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const previous=readFileSync(new URL('./baselines/v35/index.html',import.meta.url),'utf8');
  for(const name of ['STORAGE_KEY','ROUTE_STORAGE_KEY','LEGACY_STORAGE_KEYS']){
    const pattern=new RegExp(`const ${name}\\s*=([^;]+);`);assert.equal(current.match(pattern)?.[1],previous.match(pattern)?.[1]);
  }
  assert.equal(readFileSync(new URL('../assets/supabase-config.js',import.meta.url),'utf8'),readFileSync(new URL('./baselines/v35/supabase-config.js',import.meta.url),'utf8'));
  const auth=readFileSync(new URL('../assets/dayflow-auth.js',import.meta.url),'utf8');
  const previousAuth=readFileSync(new URL('./baselines/v43/dayflow-auth.js',import.meta.url),'utf8');
  // Only the explicit flush hook and removal of the old eight-favorite truncation may differ.
  const withoutHook=auth.replace(/  window.DAYFLOW_CLOUD = \{[\s\S]*?\n  \};\n/,'');
  assert.equal(withoutHook.replaceAll('\r\n','\n'),previousAuth.replace('.slice(0,8)','').replace('.slice(0, 8)','').replaceAll('\r\n','\n'));
  for(const match of current.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
});
