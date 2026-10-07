import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/transit-reuse.js';
const {createReuse,reverseDraft}=globalThis.UNHARU_TRANSIT_REUSE;
test('same parameters reuse, distinct kind/mode/direction do not; values are isolated',async()=>{
  const cache=createReuse();let calls=0;
  const load=async()=>{calls++;return {result:{value:calls}};};
  const params={a:'one',b:'two'};
  const first=await cache.run('station',params,load);first.value.result.value=99;
  assert.equal((await cache.run('station',{b:'two',a:'one'},load)).value.result.value,1);
  assert.equal(calls,1);
  await cache.run('route',params,load);await cache.run('station',{a:'two',b:'one'},load);
  await cache.run('station',{...params,mode:'2'},load);assert.equal(calls,4);
});
test('TTL and bounded memory expiry, account clear, pending coalescing',async()=>{
  let time=0,calls=0,complete;const cache=createReuse({now:()=>time,ttl:100,max:1});
  const load=async()=>{calls++;return {result:{value:1}};};
  await cache.run('s',{},load);time=100;await cache.run('s',{},load);assert.equal(calls,2);
  await cache.run('other',{},load);await cache.run('s',{},load);assert.equal(calls,4);
  cache.clear();await cache.run('s',{},load);assert.equal(calls,5);
  const a=cache.run('pending',{},()=>new Promise(resolve=>{complete=resolve;}));
  const b=cache.run('pending',{},()=>{throw Error('duplicate');});
  complete({result:{value:2}});assert.equal((await a).reused,false);assert.equal((await b).reused,true);
});
test('errors and aborted/old account responses never retained',async()=>{
  const cache=createReuse();let calls=0;
  const error=async()=>{calls++;throw Error('429');};
  await assert.rejects(cache.run('s',{},error));await assert.rejects(cache.run('s',{},error));assert.equal(calls,2);
  let complete;const pending=cache.run('s',{},()=>new Promise(resolve=>{complete=resolve;}));
  cache.clear();complete({result:{}});await assert.rejects(pending,{name:'AbortError'});
  const ctrl=new AbortController();ctrl.abort();await assert.rejects(cache.run('s',{},error,ctrl.signal),{name:'AbortError'});assert.equal(calls,2);
});
test('reverse keeps via, reverses modes/lines, clears bus IDs and never fabricates fare',()=>{
  const original={name:'출근',origin:'A',via:'B',destination:'C',stations:{origin:{stationClass:1,stationID:1},via:{stationClass:2,stationID:2},destination:{stationClass:2,stationID:3}},viaSettings:[{mode:'2',line:'강동01'},{mode:'1',line:'2호선'}]};
  const copy=JSON.stringify(original),reverse=reverseDraft(original);
  assert.equal(reverse.origin,'C');assert.equal(reverse.destination,'A');assert.equal(reverse.via,'B');
  assert.equal(reverse.stations.origin.stationID,3);assert.equal(reverse.stations.destination,undefined);assert.equal(reverse.searchKinds.destination,'1');
  assert.deepEqual(reverse.viaSettings,[{mode:'1',line:'2호선'},{mode:'2',line:'강동01'}]);
  assert.equal(reverse.fare,undefined);assert.equal(JSON.stringify(original),copy);assert.equal(reverse.reversePending,true);
});
