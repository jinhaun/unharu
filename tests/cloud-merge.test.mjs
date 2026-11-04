import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
function core(){const window={};vm.runInNewContext(read('assets/cloud-merge.js'),{window});const api=window.DAYFLOW_MERGE;
 return {merge3:(...a)=>JSON.parse(JSON.stringify(api.merge3(...a))),same:api.same,sameEntries:api.sameEntries};}
const it=(id,title=id)=>({id,title});
const ids=list=>list.map(x=>x.id);

test('phone entry survives when the long-open computer tab saves its own new entry',()=>{
 const {merge3}=core();
 const base=[it('a'),it('b')];              // 컴퓨터가 아침에 불러온 기록
 const remote=[it('a'),it('b'),it('phone')]; // 퇴근길에 휴대폰에서 추가
 const local=[it('a'),it('b'),it('pc')];     // 그걸 모르는 컴퓨터에서 추가
 assert.deepEqual(ids(merge3(base,local,remote)),['a','b','pc','phone']);
});
test('deleting, editing and adding on different devices are all kept',()=>{
 const {merge3}=core();
 const base=[it('a'),it('b'),it('c')];
 const remote=[it('a','A-phone'),it('c'),it('phone')]; // 휴대폰: a 수정, b 삭제, 추가
 const local=[it('a'),it('b'),it('c','C-pc')];         // 컴퓨터: c 수정
 const merged=merge3(base,local,remote);
 assert.deepEqual(merged.map(x=>[x.id,x.title]),[['a','A-phone'],['c','C-pc'],['phone','phone']]);
});
test('a record deleted on this device stays deleted even if the other device still has it',()=>{
 const {merge3}=core();
 assert.deepEqual(ids(merge3([it('a'),it('b')],[it('a')],[it('a'),it('b'),it('x')])),['a','x']);
});
test('when both devices edit the same record, this device wins; nothing changed means remote as is',()=>{
 const {merge3}=core();
 assert.equal(merge3([it('a','old')],[it('a','pc')],[it('a','phone')])[0].title,'pc');
 assert.deepEqual(merge3([it('a')],[it('a')],[it('a','phone'),it('b')]).map(x=>x.title),['phone','b']);
});
test('first save to an empty account keeps everything; key order differences are not edits',()=>{
 const {merge3,same,sameEntries}=core();
 assert.deepEqual(ids(merge3([],[it('a'),it('b')],[])),['a','b']);
 assert.equal(same({id:'a',title:'t',n:{x:1,y:2}},{n:{y:2,x:1},title:'t',id:'a'}),true);
 assert.equal(same({id:'a',x:undefined},{id:'a'}),true);
 assert.equal(sameEntries([it('a'),it('b')],[it('b'),it('a')]),true);
 assert.equal(sameEntries([it('a')],[it('a','changed')]),false);
 // 계정 저장 공간이 항목 순서만 바꿔 돌려줘도 이 기기 수정으로 착각하지 않습니다.
 const base=[{id:'a',title:'t',date:'2026-11-04'}];
 const local=[{title:'t',date:'2026-11-04',id:'a'}];
 assert.equal(merge3(base,local,[{id:'a',title:'phone',date:'2026-11-04'}])[0].title,'phone');
});
test('saving reads the latest account state first and merges; the screen refreshes on return',()=>{
 const auth=read('assets/dayflow-auth.js'),html=read('index.html');
 const save=auth.slice(auth.indexOf('async function writeCloudSnapshot('),auth.indexOf('function showMergedState('));
 assert.ok(save.indexOf(".select('items, saved_routes')")<save.indexOf('.upsert(snapshot'));
 assert.match(save,/items: mergedItems,/);
 assert.match(save,/merge\.merge3\(cloudBase\.items, localItems, latest\.items, canDelete\('items'\)\)/);
 assert.match(auth,/document\.addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) pullLatest\(\); \}\);/);
 assert.match(auth,/cloudBase = \{ items: clone\(safe\.items\), routes: clone\(safe\.savedRoutes\) \};/);
 assert.ok(html.indexOf('assets/cloud-merge.js')<html.indexOf('assets/dayflow-auth.js'));
});
test('only records marked as deleted are removed; other missing records keep the account copy',()=>{
 const {merge3}=core();
 const base=[it('a'),it('b'),it('c')],local=[it('a')],remote=[it('a'),it('b'),it('c')];
 const onlyB=e=>e.id==='b';
 assert.deepEqual(ids(merge3(base,local,remote,onlyB)),['a','c']);
 assert.deepEqual(ids(merge3(base,local,remote,()=>false)),['a','b','c']);
});
test('the delete button, commute merges and saved-route deletion report what they removed',()=>{
 const html=read('index.html');
 const mark=String.raw`if \(typeof markRemovedItems === 'function'\) markRemovedItems`;
 assert.match(html,new RegExp(String.raw`const before=items;\s*items=items\.filter\(\(entry\)=>entry\.id!==id\);\s*`+mark+String.raw`\(before\);`));
 assert.equal((html.match(new RegExp(String.raw`items=result\.items;\s*`+mark+String.raw`\(previousItems\);`,'g'))||[]).length,2);
 assert.match(html,/window\.DAYFLOW_CLOUD\?\.markDeleted\?\.\('routes', \[route\.id\]\);/);
 const auth=read('assets/dayflow-auth.js');
 assert.match(auth,/merge\.merge3\(cloudBase\.items, localItems, latest\.items, canDelete\('items'\)\)/);
});
