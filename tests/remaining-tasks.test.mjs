import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/function renderMetrics\(\) \{[\s\S]*?\n    \}/)[0];
function harness(records,now='2026-10-07T08:30:00Z',viewDate=new Date(2026,9,1)){
 let instant=now;class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}}
 const nodes=Object.fromEntries(['task-count','meeting-count','expense-total','expense-average'].map(x=>['#'+x,{textContent:''}]));
 const context={items:records,Date:Clock,viewDate,pad:n=>String(n).padStart(2,'0'),formatMoney:n=>n.toLocaleString('ko-KR')+'원',$:x=>nodes[x]};vm.createContext(context);vm.runInContext(source,context);
 const run=()=>{context.renderMetrics();return nodes['#task-count'].textContent;};return{context,nodes,run,setNow:value=>{instant=value;}};
}
const task=(date,extra={})=>({id:date,type:'task',date,...extra});
test('past dates and completed tasks excluded; today and future unfinished included; records preserved',()=>{
 const records=[task('2026-10-06'),task('2026-10-07',{time:'01:00',endTime:'02:00'}),task('2026-10-08'),task('2026-10-09',{completed:true}),task('2026-09-30'),task('2026-11-01'),task(''),task(null)];const before=JSON.stringify(records),h=harness(records);assert.equal(h.run(),'2개');assert.equal(JSON.stringify(records),before);
});
test('selected month scope remains, with zero for past month and upcoming counts for future month',()=>{const h=harness([task('2026-09-30'),task('2026-10-08'),task('2026-11-01'),task('2026-11-02',{completed:true})]);h.context.viewDate=new Date(2026,8,1);assert.equal(h.run(),'0개');h.context.viewDate=new Date(2026,10,1);assert.equal(h.run(),'1개');});
test('Korean midnight updates without reload; year boundary and local timezone do not shift dates',()=>{const h=harness([task('2026-10-06'),task('2026-10-07')],'2026-10-06T14:59:59Z');assert.equal(h.run(),'2개');h.setNow('2026-10-06T15:00:00Z');assert.equal(h.run(),'1개');const year=harness([task('2026-12-31')],'2026-12-31T15:00:00Z',new Date(2026,11,1));assert.equal(year.run(),'0개');});
test('completion and undo refresh count; meetings and expenses unchanged; average independent of tasks',()=>{const record=task('2026-10-07'),h=harness([record,{type:'meeting',date:'2026-10-01'},{type:'expense',date:'2026-10-01',amount:16790,review:true}]);assert.equal(h.run(),'1개');record.completed=true;assert.equal(h.run(),'0개');record.completed=false;assert.equal(h.run(),'1개');assert.equal(h.nodes['#meeting-count'].textContent,'1건');assert.equal(h.nodes['#expense-total'].textContent,'16,790원');assert.equal(h.nodes['#expense-average'].textContent,'2,399원');});
test('timer and visibility refresh only derived metric, no mutation/save or invented completion',()=>{assert.match(html,/setInterval\(\(\) => \{ if \(!document.hidden\) renderMetrics\(\); \}, 60000\)/);assert.match(html,/addEventListener\('visibilitychange', \(\) => \{ if \(!document.hidden\) renderMetrics\(\); \}\)/);assert.doesNotMatch(source,/persist\(|localStorage|item\.completed\s*=|splice\(/);const h=harness([]);assert.equal(h.run(),'0개');});
