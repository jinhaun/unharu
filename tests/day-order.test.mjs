import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=html.match(/function compareDayItems\(a, b\) \{[\s\S]*?\n    \}/)?.[0];
assert.ok(fn);
const compare=vm.runInNewContext(fn+';compareDayItems');
const row=(id,type,time,date='2026-10-07')=>({id,type,time,date});
test('tasks precede earlier other types and each category is chronological',()=>{
 const rows=[row('expense-late','expense','18:00'),row('task-late','task','20:00'),row('meeting','meeting','08:00'),row('expense-early','expense','07:00'),row('task-early','task','9:05'),row('certificate','certificate','06:00'),row('shared','shared','05:00')];
 assert.deepEqual([...rows].sort(compare).map(x=>x.id),['task-early','task-late','meeting','expense-early','expense-late','certificate','shared']);
 assert.equal(rows[0].id,'expense-late');
});
test('untimed and malformed times follow timed items within their own type; ties are stable',()=>{
 const rows=[row('none','task',''),row('end','task','23:59'),row('invalid','task','24:00'),row('morning-a','task','09:05'),row('morning-b','task','9:05'),row('midnight','task','00:00'),row('missing','task',null),row('bad-minute','task','12:60'),row('expense','expense','00:00')];
 assert.deepEqual([...rows].sort(compare).map(x=>x.id),['midnight','morning-a','morning-b','end','none','invalid','missing','bad-minute','expense']);
 assert.equal(compare(row('a','task',''),row('b','task',undefined)),0);
});
test('calendar sorts before its 3-item limit and details use the same ordering',()=>{
 const calendar=html.slice(html.indexOf('function renderCalendar()'),html.indexOf('function openDayDetails('));
 assert.match(calendar,/const dayItems = visible\.filter\(.*\)\.sort\(compareDayItems\)/);
 assert.match(calendar,/dayItems\.slice\(0,3\)/);assert.match(calendar,/const dayCount = dayItems\.length/);
 const details=html.slice(html.indexOf('function openDayDetails('),html.indexOf('function renderList('));
 assert.match(details,/\.sort\(compareDayItems\)/);
 assert.ok(details.includes("if(item.type==='shared'){root.append(row);return;}"));
});
test('list prioritizes dates first, then category/time, leaving source records untouched',()=>{
 const body=html.slice(html.indexOf('function renderList('),html.indexOf('function renderMetrics('));
 const expression=body.match(/list\.sort\(([\s\S]*?)\);/)?.[1];assert.ok(expression);
 const listCompare=vm.runInNewContext(fn+';('+expression+')');
 const rows=[row('late-task','task','09:00','2026-10-08'),row('expense','expense','07:00'),row('today-task','task','20:00'),row('no-date','task','','')];
 assert.deepEqual([...rows].sort(listCompare).map(x=>x.id),['today-task','expense','late-task','no-date']);
 assert.equal(rows[0].id,'late-task');
});
