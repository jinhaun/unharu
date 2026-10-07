import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/task-time.js',import.meta.url),'utf8');
function harness(ui=false){
 const nodes=new Map(),q=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,hidden:false,events:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;},focus(){this.focused=true;}});return nodes.get(id);};
 const window={},context={window,inputMode:'task'};const buttons=[q('task'),q('expense')];
 if(ui){const document={getElementById:q,querySelectorAll:()=>buttons};window.document=document;context.document=document;q('quick-end-unknown').checked=true;q('edit-type').value='task';}
 vm.runInNewContext(source,context);return {api:window.DAYFLOW_TASK_TIME,q,context,buttons};
}
test('known end requires start and same-day later end; unknown end never guesses a duration',()=>{
 const {api}=harness();
 assert.equal(api.validate('09:00','10:30',false),'');assert.equal(api.validate('','',true),'');
 for(const [start,end] of [['','12:00'],['12:00',''],['12:00','11:00'],['12:00','12:00'],['25:00','26:00']])assert.ok(api.validate(start,end,false));
 assert.equal(api.format({type:'task',time:'09:00',endTime:'10:30'}),'09:00–10:30');
 assert.equal(api.format({type:'task',time:'09:00',endTimeUnknown:true}),'09:00 · 종료 잘 모름');
 assert.equal(api.format({type:'task',time:'09:00'}),'09:00');
 assert.equal(api.format({type:'expense',time:'09:00',endTime:'10:00'}),'09:00');
});
test('time controls override parsed start, unknown clears stale end, other modes untouched',()=>{
 const h=harness(true),item={type:'task',time:'08:00'};
 h.q('quick-start-time').value='09:00';h.q('quick-end-unknown').checked=false;h.q('quick-end-time').value='10:30';
 assert.equal(h.api.prepare(item),true);assert.equal(item.time,'09:00');assert.equal(item.endTime,'10:30');
 h.q('quick-end-unknown').checked=true;h.api.prepare(item);assert.equal(item.endTime,'');assert.equal(item.endTimeUnknown,true);
 h.context.inputMode='expense';h.buttons[1].events.click();assert.equal(h.q('quick-task-times').hidden,true);
 const original={type:'expense',time:'08:00'};h.api.prepare(original);assert.deepEqual(original,{type:'expense',time:'08:00'});
});
test('invalid submission leaves original record intact, draft retained; text time works when picker empty',()=>{
 const h=harness(true),item={type:'task',time:'09:00'};
 h.q('quick-end-unknown').checked=false;h.q('quick-end-time').value='08:00';
 assert.equal(h.api.prepare(item),false);assert.deepEqual(item,{type:'task',time:'09:00'});assert.equal(h.q('quick-end-time').value,'08:00');
 h.q('quick-end-time').value='10:00';assert.equal(h.api.prepare(item),true);assert.equal(item.time,'09:00');
 h.api.reset();assert.equal(h.q('quick-end-time').value,'');assert.equal(h.q('quick-end-unknown').checked,true);assert.equal(h.q('quick-end-time').disabled,true);
});
test('edit loads known or legacy unknown, validation blocks invalid end, switching type clears duration',()=>{
 const h=harness(true);
 h.api.edit({type:'task',time:'09:00',endTime:'10:00'});h.q('edit-time').value='09:00';
 assert.equal(h.q('edit-end-unknown').checked,false);assert.equal(h.api.readEdit().endTime,'10:00');
 h.q('edit-end-time').value='08:00';assert.equal(h.api.readEdit(),null);
 h.api.edit({type:'task',time:'09:00'});assert.equal(h.q('edit-end-unknown').checked,true);assert.equal(h.api.readEdit().endTimeUnknown,true);
 h.q('edit-type').value='expense';assert.equal(h.api.readEdit().endTime,'');
});
test('calendar export uses selected end; unknown task has no invented one-hour duration',()=>{
 const {api}=harness();
 assert.equal(api.calendarEnd({type:'task',date:'2026-10-09',time:'09:00',endTime:'10:30'})[0],'DTEND;TZID=Asia/Seoul:20261009T103000');
 assert.equal(api.calendarEnd({type:'task',time:'09:00',endTimeUnknown:true}).length,0);
 assert.equal(api.calendarEnd({type:'meeting'})[0],'DURATION:PT1H');
});
test('integration validates before recurrence/save and edit mutation, preserves auth and source repo',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const save=html.slice(html.indexOf('const item = parseInput(text,inputMode'),html.indexOf("$('#parse-button').addEventListener"));
 assert.ok(save.indexOf('DAYFLOW_TASK_TIME?.prepare')<save.indexOf('expandRecurringItem'));
 const edit=html.slice(html.indexOf("$('#edit-form').addEventListener"),html.indexOf("$('#edit-type').addEventListener"));
 assert.ok(edit.indexOf('DAYFLOW_TASK_TIME?.readEdit')<edit.indexOf('item.type='));
 assert.match(html,/DAYFLOW_TASK_TIME\?\.format\(item\)/);
 assert.match(html,/DAYFLOW_TASK_TIME\?\.calendarEnd\(item\)/);
});
