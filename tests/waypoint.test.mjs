import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/transit-core.js';
const core=globalThis.UNHARU_TRANSIT_CORE;
const route={fare:1200,duration:20,steps:[{mode:'villageBus',name:'강동01 / 강동02',label:'버스',startName:'A',endName:'B',alternatives:[{name:'강동01',mode:'villageBus'},{name:'강동02',mode:'villageBus'}]}]};
test('required bus line narrows alternatives without mutating original',()=>{
  const filtered=core.routesWithLine([route],'강동 01번');
  assert.equal(filtered.length,1);assert.equal(filtered[0].steps[0].alternatives.length,1);assert.equal(filtered[0].steps[0].name,'강동01');
  assert.equal(route.steps[0].alternatives.length,2);assert.equal(core.routesWithLine([route],'강동03').length,0);
});
test('joining segments preserves order and no inferred discount, summed fare or zero fare',()=>{
  const joined=core.joinVia(route,{...route,fare:1550,duration:30},{stationName:'강변',stationClass:2,x:127.09,y:37.53});
  assert.equal(joined.fare,null);assert.equal(joined.duration,50);assert.equal(joined.viaTrip,true);
  assert.deepEqual(joined.steps.map(s=>s.leg),[0,1]);assert.equal(joined.via,'강변');
});
