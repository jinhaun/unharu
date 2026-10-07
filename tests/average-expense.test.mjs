import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');const source=html.match(/function renderMetrics\(\) \{[\s\S]*?\n    \}/)[0];
function run(items,month=9,year=2026,now='2026-10-07T08:30:00Z'){
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}}
 const nodes=Object.fromEntries(['task-count','meeting-count','expense-total','expense-average'].map(id=>['#'+id,{textContent:''}]));
 const context={Date:Clock,items,viewDate:new Date(year,month,1),pad:n=>String(n).padStart(2,'0'),formatMoney:n=>n.toLocaleString('ko-KR')+'원',$:s=>nodes[s]};vm.runInNewContext(source+';renderMetrics();',context);return nodes['#expense-average'];
}
const spend=(date,amount)=>({type:'expense',date,amount});
test('current month divides valid through-today spend by elapsed days including empty days; full won rounding',()=>{const records=[spend('2026-10-01',10000),spend('2026-10-07',6790),spend('2026-10-08',99999),spend('2026-09-30',99999),{type:'task',date:'2026-10-07',amount:99999}];const before=JSON.stringify(records),value=run(records);assert.equal(value.textContent,'2,399원');assert.match(value.title,/16,790원 ÷ 7일/);assert.equal(JSON.stringify(records),before);});
test('past full months and leap years use actual day count; future month shows dash',()=>{assert.equal(run([spend('2026-09-02',30000)],8).textContent,'1,000원');assert.equal(run([spend('2024-02-10',29000)],1,2024).textContent,'1,000원');assert.equal(run([spend('2026-11-01',10000)],10).textContent,'—');});
test('empty data gives zero, invalid/missing amounts excluded with disclosure, ten-won precision preserved',()=>{assert.equal(run([]).textContent,'0원');const n=run([spend('2026-10-01',null),spend('2026-10-01',''),spend('2026-10-01',false),spend('2026-10-01',NaN),spend('2026-10-01',-1),spend('2026-10-01',1550)]);assert.equal(n.textContent,'221원');assert.match(n.title,/금액 미정 5건 제외/);});
test('Korean midnight switches elapsed-day divisor without including future scheduled expenses early',()=>{const rows=[spend('2026-10-06',6000),spend('2026-10-07',1000)];assert.equal(run(rows,9,2026,'2026-10-06T14:59:59Z').title.includes('6일'),true);assert.match(run(rows,9,2026,'2026-10-06T15:00:00Z').title,/7,000원 ÷ 7일/);});
test('review metric removed, other existing review data/filter preserved',()=>{assert.doesNotMatch(html,/id="review-count"|\$\('#review-count'\)/);assert.match(html,/<span>하루 평균 소비<\/span>/);assert.match(html,/data-filter="review"/);});
