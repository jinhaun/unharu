import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
function core(){const window={};vm.runInNewContext(read('assets/trip-core.js'),{window});return window.DAYFLOW_TRIP;}
const trip=(id,date,endDate)=>({id,type:'trip',title:id,date,endDate});
test('trip covers every day from start to end and only overlapping months',()=>{
 const T=core(),jeju=trip('jeju','2026-10-30','2026-11-02');
 assert.deepEqual(['2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03'].map(d=>T.covers(jeju,d)),[false,true,true,true,true,false]);
 assert.equal(T.overlapsMonth(jeju,'2026-10'),true);assert.equal(T.overlapsMonth(jeju,'2026-11'),true);assert.equal(T.overlapsMonth(jeju,'2026-12'),false);
 assert.equal(T.label(jeju),'3박 4일');assert.equal(T.range(jeju),'10.30~11.2');
 assert.equal(T.label(trip('day','2026-10-05','2026-10-05')),'당일');
});
test('ordinary records and broken end dates keep single-day behaviour',()=>{
 const T=core();
 assert.equal(T.covers({type:'task',date:'2026-10-05'},'2026-10-05'),true);
 assert.equal(T.covers({type:'task',date:'2026-10-05',endDate:'2026-10-09'},'2026-10-06'),false);
 assert.equal(T.covers(trip('bad','2026-10-05','2026-10-01'),'2026-10-04'),false);
 assert.equal(T.endOf(trip('bad','2026-10-05','2026-10-01')),'2026-10-05');
});
test('overlapping trips get separate rows and free rows are reused',()=>{
 const T=core(),rows=T.slots([trip('b','2026-10-19','2026-10-21'),trip('a','2026-10-15','2026-10-20'),trip('c','2026-10-22','2026-10-23'),{id:'x',type:'task',date:'2026-10-19'}]);
 assert.equal(rows.get('a'),0);assert.equal(rows.get('b'),1);assert.equal(rows.get('c'),0);assert.equal(rows.has('x'),false);
});
test('bar pieces join across days, break at week edges and show the name at the start of each week',()=>{
 const T=core(),t=trip('t','2026-10-15','2026-10-20');
 const thu=T.segment(t,'2026-10-15',4),sat=T.segment(t,'2026-10-17',6),sun=T.segment(t,'2026-10-18',0),tue=T.segment(t,'2026-10-20',2);
 assert.deepEqual([thu.first,thu.extendLeft,thu.extendRight,thu.showTitle,thu.span],[true,false,true,true,3]);
 assert.deepEqual([sat.extendLeft,sat.extendRight,sat.showTitle],[true,false,false]);
 assert.deepEqual([sun.extendLeft,sun.extendRight,sun.showTitle,sun.span],[false,true,true,3]);
 assert.deepEqual([tue.last,tue.extendRight],[true,false]);
});
test('trip mode, end date field, edit option and styles are wired into the page',()=>{
 const html=read('index.html');
 assert.match(html,/data-mode="trip"[^>]*>여행<\/button>/);
 assert.match(html,/id="trip-end-date" type="date"/);
 assert.match(html,/<option value="trip">여행<\/option>/);
 assert.match(html,/id="edit-end-date" type="date"/);
 assert.match(html,/if \(inputMode === 'trip'\) \{ saveTripInput\(text, selectedDate\); return; \}/);
 assert.match(html,/if \(end < start\) return fail\(/);
 assert.ok(html.indexOf('assets/trip-core.js')<html.indexOf('const TRIP = window.DAYFLOW_TRIP'));
 assert.match(html,/href="assets\/trip.css"/);
 assert.match(read('assets/trip.css'),/\.capture\[data-input-mode="trip"\] \.quick-sharing \{ display:none; \}/);
});
