import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('score markup, updates and unused styles are removed',()=>{
  assert.doesNotMatch(html,/score-value|rail-score|rail-summary|const score\s*=|정리 점수|\.score\b/);
  assert.doesNotMatch(fs.readFileSync(new URL('../assets/canal-glass.css',import.meta.url),'utf8'),/\.score\b/);
});
test('remaining metrics render correctly without any score DOM nodes',()=>{
  const source=html.match(/function renderMetrics\(\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(source);
  const nodes=Object.fromEntries(['task-count','meeting-count','expense-total','review-count'].map(id=>['#'+id,{textContent:''}]));
  const ctx={items:[{type:'task',date:'2026-10-07'},{type:'meeting',date:'2026-10-07'},{type:'expense',date:'2026-10-07',amount:1230,review:true},{type:'expense',date:'2026-09-07',amount:9000}],viewDate:new Date(2026,9,7),pad:n=>String(n).padStart(2,'0'),formatMoney:n=>n.toLocaleString('ko-KR')+'원',$:selector=>{assert.ok(nodes[selector]);return nodes[selector];}};
  vm.runInNewContext(source+';renderMetrics();',ctx);
  assert.deepEqual(Object.values(nodes).map(n=>n.textContent),['1개','1건','1,230원','1건']);
  ctx.items=[];vm.runInNewContext(source+';renderMetrics();',ctx);
  assert.deepEqual(Object.values(nodes).map(n=>n.textContent),['0개','0건','0원','0건']);
});
