import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../assets/sharing-core.js';
const core=globalThis.UNHARU_SHARING_CORE;
test('only explicitly identified personal schedules can be shared',()=>{
 for(const type of ['expense','certificate','shared',undefined])assert.equal(core.canShare({id:'1',type}),false);
 for(const type of ['task','meeting'])assert.equal(core.canShare({id:'1',type}),true);
 for(const id of ['',null,1,'x'.repeat(201)])assert.equal(core.canShare({id,type:'task'}),false);
});
test('received projection drops private fields and never becomes an editable record',()=>{
 const received=core.normalize({owner_id:'owner',event_id:'id',title:'Meet',date:'2026-10-07',time:'13:10',notes:'Memo',raw:'secret',amount:999,transit:{secret:1},type:'task',recurrence:{}});
 assert.deepEqual(received,{id:'shared:owner:id',type:'shared',title:'Meet',date:'2026-10-07',time:'13:10',notes:'Memo',review:false});
 assert.equal(core.canShare(received),false);
 assert.notEqual(core.normalize({owner_id:'another',event_id:'id'}).id,received.id);
});
test('HTML-injectable date/time values rejected; user text kept as plain text',()=>{
 const row=core.normalize({owner_id:'owner',event_id:'id',title:'<img onerror=alert(1)>',date:'<img>',time:'<img>',notes:'<script>'});
 assert.equal(row.date,'');assert.equal(row.time,'');assert.equal(row.title,'<img onerror=alert(1)>');
 assert.equal(core.normalize(null),null);assert.equal(core.normalize({}),null);
 assert.equal(core.normalize({owner_id:'a',event_id:'b',time:'25:01'}).time,'');
});
test('email normalized, errors do not reveal server content',()=>{
 assert.equal(core.email('  PERSON@GMAIL.COM '),'person@gmail.com');
 for(const email of ['','person','a@b','a b@c.com','x'.repeat(321)+'@a.com'])assert.equal(core.email(email),null);
 assert.ok(!core.errorText({message:'SECRET'}).includes('SECRET'));
});
test('sharing scripts parse and received events are not persisted',()=>{
 for(const file of ['sharing-core.js','sharing.js','dayflow-auth.js'])assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8')));
 const source=fs.readFileSync(new URL('../assets/sharing.js',import.meta.url),'utf8');
 assert.ok(!source.includes('localStorage'));assert.ok(!source.includes('items.push'));
 assert.ok(source.includes('if(!confirm(copy))return'));
 assert.ok(source.includes('version!==epoch||sequence!==refreshSequence'));
 assert.ok(source.includes('refreshDisplay();'));
});
