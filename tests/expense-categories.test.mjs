import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
function core(){const window={};vm.runInNewContext(read('assets/expense-categories.js'),{window,document:{getElementById:()=>null}});const api=window.DAYFLOW_EXPENSE_CATEGORIES;
 // Results built inside the sandbox are copied out so deepEqual compares plain values.
 return {summarize:(...args)=>JSON.parse(JSON.stringify(api.summarize(...args))),daily:(...args)=>JSON.parse(JSON.stringify(api.daily(...args)))};}
const e=(category,amount,date='2026-10-05')=>({type:'expense',category,amount,date});
test('sums only this month expenses per category, largest first, with shares',()=>{
 const {summarize}=core();
 const records=[e('식비',9000),e('식비',21000),e('카페',5500),e('쇼핑',32000),e('식비',1000,'2026-11-01'),{type:'task',date:'2026-10-05',amount:999}];
 const s=summarize(records,'2026-10',r=>r.category);
 assert.equal(s.total,67500);
 assert.deepEqual(s.rows.map(r=>[r.name,r.total,r.count,r.percent]),[['쇼핑',32000,1,47],['식비',30000,2,44],['카페',5500,1,8]]);
});
test('unknown categories count as 기타 and missing amounts are counted, not summed',()=>{
 const {summarize}=core();
 const s=summarize([e('여가',3000),e('기타',null),e('기타','2000')],'2026-10',r=>r.category);
 assert.deepEqual(s.rows.map(r=>[r.name,r.total,r.count,r.missing]),[['기타',5000,3,1]]);
 assert.equal(s.total,5000);
});
test('daily totals list spending days in order and follow the selected category',()=>{
 const {daily}=core();
 const records=[e('식비',9000,'2026-10-12'),e('카페',5500,'2026-10-03'),e('식비',21000,'2026-10-03'),e('식비',null,'2026-10-12'),e('식비',700,'2026-09-30'),{type:'task',date:'2026-10-03',amount:1}];
 const all=daily(records,'2026-10',r=>r.category);
 assert.deepEqual(all.rows.map(r=>[r.date,r.total,r.count,r.missing]),[['2026-10-03',26500,2,0],['2026-10-12',9000,2,1]]);
 assert.equal(all.total,35500);assert.equal(all.max,26500);
 const cafe=daily(records,'2026-10',r=>r.category,'카페');
 assert.deepEqual(cafe.rows.map(r=>[r.date,r.total]),[['2026-10-03',5500]]);
 assert.equal(daily([],'2026-10',r=>r.category).max,0);
});
test('each day is split by category, largest first, and the pieces add up to the day total',()=>{
 const {daily}=core();
 const records=[e('카페',5500,'2026-10-03'),e('식비',9000,'2026-10-03'),e('식비',12000,'2026-10-03'),e('여가',800,'2026-10-03'),e('식비',null,'2026-10-03')];
 const [day]=daily(records,'2026-10',r=>r.category).rows;
 assert.deepEqual(day.byCategory.map(p=>[p.name,p.total,p.count]),[['식비',21000,3],['카페',5500,1],['기타',800,1]]);
 assert.equal(day.byCategory.reduce((sum,p)=>sum+p.total,0),day.total);
 const [cafeOnly]=daily(records,'2026-10',r=>r.category,'카페').rows;
 assert.deepEqual(cafeOnly.byCategory.map(p=>p.name),['카페']);
});
test('summary is wired into the expense screen and refreshes with the view',()=>{
 const html=read('index.html');
 assert.match(html,/<section class="category-summary" id="expense-category-summary"[^>]*hidden><\/section>/);
 assert.match(html,/window\.DAYFLOW_EXPENSE_CATEGORIES\?\.refresh\(\);/);
 assert.ok(html.indexOf('assets/expense-categories.js')>html.indexOf('function renderView('));
 const js=read('assets/expense-categories.js');
 assert.match(js,/#expense-category-filter \[data-expense-category=/);
 assert.match(js,/\(\) => openDayDetails\(item\.date\)/);
 assert.match(js,/let tab = 'day';/);
 assert.match(js,/\[\['day', '날짜별'\], \['category', '카테고리별'\]\]/);
});
