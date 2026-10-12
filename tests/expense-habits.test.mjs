import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const coreCode=read('assets/expense-habits-core.js'),uiCode=read('assets/expense-habits.js');
const scope={};vm.runInNewContext(coreCode,scope);const core=scope.UnharuHabitCore;
const row=(date,amount,category='간식',title='과자')=>({type:'expense',date,amount,category,title});
const records=[row('2026-10-01',1550),row('2026-10-02',2310),row('2026-10-03',1140),row('2026-10-04',9000,'식비','식사'),row('2026-10-05',4500,'카페','커피')];
class El {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.textContent='';this.value='';}
 append(...children){this.children.push(...children);}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,fn){this.events[k]=fn;}
}
const flatten=e=>[e,...e.children.flatMap(flatten)];
const text=e=>flatten(e).map(n=>n.textContent).join(' ');
function render(rows=records,prior=[],demo=false){
 const context={window:{UnharuHabitCore:core},document:{createElement:tag=>new El(tag)}};
 vm.runInNewContext(uiCode,context);const host=new El('div');
 context.window.UnharuHabits.render(host,{rows},{rows:prior},{target:'2026-10',prior:'2026-09',days:8,priorDays:8,demo});
 return host;
}
test('habits count categories dates small purchases weekdays without mutation',()=>{
 const before=JSON.stringify(records),p=core.profile(records);
 assert.equal(p.count,5);assert.equal(p.total,18500);assert.equal(p.recordedDays,5);assert.equal(p.sparse,false);
 assert.equal(p.smallCount,4);assert.equal(p.smallTotal,9500);
 assert.equal(p.weekendTotal,10140);assert.equal(p.weekdayTotal,8360);
 assert.equal(p.top.name,'식비');assert.equal(p.frequent.name,'간식');assert.equal(p.repeated[0].count,3);
 assert.equal(JSON.stringify(records),before);
});
test('empty sparse invalid and non-expense input handled without false zero-spending claim',()=>{
 const p=core.profile([null,row('2026-02-30',100),row('2026-10-01',-100),row('2026-10-01',0),row('2026-10-01','100'),{...records[0],type:'task'}]);
 assert.equal(p.count,0);assert.equal(p.top,null);assert.equal(p.sparse,true);
 assert.match(text(render([])),/분석할 소비 기록이 없습니다/);
 assert.match(text(render([records[0]])),/아직 기록이 적어/);
 assert.match(text(render()),/미입력일은 무소비일이 아니며/);
});
test('identical titles only grouped within the same category; no merchant inference',()=>{
 const p=core.profile([row('2026-10-01',100,'간식',' 물 '),row('2026-10-02',200,'간식','물'),row('2026-10-03',300,'식비','물')]);
 assert.equal(p.repeated.length,1);assert.equal(p.repeated[0].count,2);assert.equal(p.repeated[0].total,300);
 assert.match(text(render()),/동일 매장 여부는 확인하지 않은/);
});
test('category changes track counts and prevent percentages with no prior records',()=>{
 const a=core.analyze(records,[row('2026-09-01',1000)]);
 assert.equal(a.canCompare,true);assert.equal(a.changes.find(g=>g.name==='간식').delta,4000);
 assert.equal(a.changes.find(g=>g.name==='식비').percent,null);
 assert.equal(core.analyze(records,[]).canCompare,false);
 assert.equal(core.analyze(records,null).prior,null);
});
test('real summaries alone bound habits; future invalid and mismatched periods excluded',()=>{
 const context={module:{exports:{}}};vm.runInNewContext(read('assets/expense-report.js'),context);
 const report=context.module.exports;
 const comparison=report.compareRecords([...records,row('2026-10-09',99999),row('2026-09-15',99999),row('2026-09-01',1000)],'2026-10','2026-09','2026-10-08');
 const a=core.analyze(comparison.current.rows,comparison.baseline.rows);
 assert.equal(a.current.total,18500);assert.equal(a.prior.total,1000);
 assert.equal(a.current.groups.length,report.categories.length);
 assert.deepEqual(Array.from(a.current.groups,g=>g.name),Array.from(report.categories));
});
test('simulation uses unrounded average, preserves totals, and validates count',()=>{
 const p=core.profile([row('2026-10-01',101),row('2026-10-02',102),row('2026-10-03',102)]),before=JSON.stringify(p);
 assert.equal(core.simulate(p,'간식',3).saving,305);
 for(const n of [0,-1,1.5,4,NaN,Infinity,'1'])assert.ok(core.simulate(p,'간식',n).error);
 assert.ok(core.simulate(p,'의료',1).error);
 assert.equal(JSON.stringify(p),before);
});
test('UI requires explicit category and updates simulation result and inline error',()=>{
 const host=render(),nodes=flatten(host),select=nodes.find(n=>n.id==='habit-category'),input=nodes.find(n=>n.id==='habit-reductions'),out=nodes.find(n=>n.id==='habit-result');
 assert.equal(select.value,'');assert.equal(input.disabled,true);
 select.value='간식';select.events.change();assert.equal(input.disabled,false);assert.equal(input.max,'3');
 input.value='2';input.events.input();assert.match(out.textContent,/3,333원/);
 input.value='4';input.events.input();assert.equal(input.attrs['aria-invalid'],'true');assert.match(out.textContent,/1~3회/);
 select.value='';select.events.change();assert.equal(input.disabled,true);assert.match(out.textContent,/분야를 선택/);
 assert.equal(nodes.find(n=>n.tag==='label').htmlFor,'habit-category');assert.equal(out.attrs['aria-live'],'polite');
});
test('demo does not draw habit changes or simulation from fictitious comparison',()=>{
 const t=text(render(records,[row('2026-09-01',999999,'간식','fiction')],true));
 assert.match(t,/실제 기록만 사용/);assert.doesNotMatch(t,/기록 금액이.*늘었어요|fiction|999,999/);
 assert.doesNotMatch(text(render([],[...records],true)),/habit-category/);
});
test('safe text rendering and no network storage writes or monthly savings promises',()=>{
 const malicious='<img src=x onerror=alert(1)>';
 assert.ok(text(render([row('2026-10-01',100,'간식',malicious),row('2026-10-02',100,'간식',malicious)])).includes(malicious));
 assert.doesNotMatch(uiCode+coreCode,/innerHTML|fetch\(|localStorage|supabase|XMLHttpRequest/);
 assert.match(text(render()),/다음 달 절약액을 보장하거나/);
 const html=read('index.html');assert.ok(html.indexOf('src="assets/expense-habits.js"')<html.indexOf('src="assets/expense-report.js"'));
 assert.match(read('assets/expense-habits.css'),/@media\(max-width:600px\)/);
});
