import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/transit-core.js';
const core=globalThis.UNHARU_TRANSIT_CORE;
const bus=(distanceM=4000)=>({mode:'villageBus',distanceM,leg:0,alternatives:[{mode:'villageBus',name:'강동01',busID:'123',busType:3,busCityCode:1000}]});
const metro=(distanceM=26000)=>({mode:'subway',distanceM,leg:1,alternatives:[{mode:'subway',name:'수도권 2호선',subwayCode:2}]});
test('adult card integrated distance estimate excludes walking and keeps assumptions',()=>{
  const result=core.estimateViaFare([bus(),{mode:'walk',distanceM:2000},metro()]);
  assert.equal(result.amount,1950);assert.equal(result.distanceM,30000);assert.equal(result.base,1550);assert.equal(result.surcharge,400);
  assert.match(result.assumption,/30분/);assert.match(result.assumption,/미반영/);
});
test('10km and 5km boundaries are inclusive; subway changes are one boarding',()=>{
  for(const [distance,expected] of [[10000,1550],[10001,1650],[15000,1650],[15001,1750]])assert.equal(core.estimateViaFare([bus(1000),metro(distance-1000)]).amount,expected);
  const a=metro(3000),b=metro(4000);b.alternatives[0].subwayCode=7;
  assert.equal(core.estimateViaFare([bus(3000),a,b]).amount,1550);
});
test('bus transfer estimate is capped at separate bus fares',()=>{
  const b=bus(100000);b.leg=1;b.alternatives[0].busID='456';b.alternatives[0].name='강동02';
  const r=core.estimateViaFare([bus(100000),b]);assert.equal(r.amount,2400);assert.equal(r.separateCap,2400);
});
test('missing, zero, negative, malformed distances are never free or guessed',()=>{
  for(const value of [null,undefined,0,-1,NaN,Infinity,'4000'])assert.equal(core.estimateViaFare([{...bus(),distanceM:value},metro()]).amount,null);
});
test('unknown region, surcharge rail, nighttime bus, duplicate bus fail closed',()=>{
  const cases=[];
  let b=bus();b.alternatives[0].busCityCode=1050;cases.push([b,metro()]);
  b=bus();b.alternatives[0].name='N26';cases.push([b,metro()]);
  for(const code of [1,101,109,91,71,undefined]){const m=metro();m.alternatives[0].subwayCode=code;cases.push([bus(),m]);}
  cases.push([bus(),bus()]);
  const m=metro();m.leg=0;cases.push([bus(),m,metro()]);
  for(const steps of cases)assert.equal(core.estimateViaFare(steps).amount,null);
});
test('multiple lanes need selection; selected unsupported lane removes estimate',()=>{
  const b=bus();b.alternatives.push({...b.alternatives[0],name:'unknown',busCityCode:1050});
  assert.equal(core.estimateViaFare([b,metro()]).amount,null);
  b.chosenLane=b.alternatives[0];assert.equal(core.estimateViaFare([b,metro()]).amount,1950);
  b.chosenLane=b.alternatives[1];assert.equal(core.estimateViaFare([b,metro()]).amount,null);
});
test('ODsay normalization preserves fare inputs and does not substitute straight-line distance',()=>{
  const response={result:{searchType:0,path:[{info:{totalTime:10,payment:1200},subPath:[{trafficType:2,distance:4321,lane:[{type:3,busNo:'강동01',busID:1,busCityCode:1000}],startName:'A',endName:'B'}]}]}};
  const step=core.routes(response)[0].steps[0];assert.equal(step.distanceM,4321);assert.equal(step.alternatives[0].busCityCode,1000);
  delete response.result.path[0].subPath[0].distance;assert.equal(core.routes(response)[0].steps[0].distanceM,null);
});
