import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/transit-core.js';
const core=globalThis.UNHARU_TRANSIT_CORE;
const subway={stationName:'신중동',stationClass:2,x:126.77,y:37.50,stationID:1,laneName:'수도권 7호선'};
const bus={stationName:'신중동역1번출구',stationClass:1,x:126.77,y:37.50,stationID:2};
test('suffix normalization does not damage bus stop names or internal 역',()=>{
  for(const name of ['신중동','신중동역',' 신중동역 '])assert.deepEqual(core.stationQuery(name,'2'),{stationName:'신중동',stationClass:'2'});
  assert.equal(core.stationQuery('서울역','1').stationName,'서울역');
  assert.equal(core.stationQuery('역곡').stationName,'역곡');
  assert.equal(core.stationQuery('역삼역').stationName,'역삼');
  assert.equal(core.stationQuery('중 역').stationName,'중 역');
});
test('exact subway appears ahead of similarly named stops, even after first 50 upstream entries',()=>{
  const stops=Array.from({length:60},(_,i)=>({...bus,stationID:i+2}));
  const found=core.stationResults({station:[...stops,subway]},'신중동역');
  assert.equal(found.values[0].stationClass,2);assert.equal(found.values.length,50);assert.equal(found.total,61);
});
test('filters keep bus-only and subway-only distinct',()=>{
  const response={station:[bus,subway]};
  assert.deepEqual(core.stationResults(response,'신중동','1').values.map(s=>s.stationClass),[1]);
  assert.deepEqual(core.stationResults(response,'신중동','2').values.map(s=>s.stationClass),[2]);
});
test('single-object result and numeric strings supported without weakening coordinate validation',()=>{
  assert.equal(core.stationResults({station:{...subway,x:'126.77',stationClass:'2'}},'신중동').values.length,1);
  assert.throws(()=>core.stationResults({station:{...subway,x:0}},'신중동'),/검색 응답은 있지만/);
  assert.throws(()=>core.stationResults(undefined,'신중동'),/응답을 확인하지 못/);
  assert.throws(()=>core.stationResults({totalCount:1,station:[]},'신중동'),/검색 응답은 있지만/);
});
