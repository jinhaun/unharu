import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element{
 constructor(){this.children=[];this.events={};this.value='';this.dataset={};}
 append(...nodes){this.children.push(...nodes);}after(){}replaceChildren(...nodes){this.children=nodes;}setAttribute(){}focus(){this.focused=true;}dispatchEvent(event){this.fire(event.type);}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}fire(type){for(const fn of this.events[type]||[])fn();}
}
// Track generated nodes without depending on browser internals or real accounts.
function setup(storage=new Map()){
 let owner='a',deny=false;const nodes=[],ids=new Map(),events={},calls=[];
 const make=()=>{const el=new Element();nodes.push(el);return el;};
 const q=id=>nodes.find(el=>el.id===id)||ids.get(id)||(()=>{const el=make();el.id=id;ids.set(id,el);return el;})();
 const window={addEventListener:(name,fn)=>events[name]=fn,DAYFLOW_SHARING:{account:()=>owner,lookup:email=>{calls.push(email);q('lookup-email').value=email;}}};
 const ctx=vm.createContext({window,Event:class{constructor(type){this.type=type;}},document:{createElement:make,getElementById:q},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(deny)throw Error('quota');storage.set(key,value);}}});
 for(const file of ['sharing-core.js','sharing-favorites.js'])vm.runInContext(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),ctx);
 return {q,storage,calls,enter(email){q('lookup-email').value=email;q('lookup-email').fire('input');},add(){q('favorite-add').fire('click');},login(next){owner=next;events['dayflow-sharing-account-change']();},fail(){deny=true;}};
}
test('favorites normalize, deduplicate, persist and explicitly re-query without granting access',()=>{
 const h=setup();h.enter(' FRIEND@EXAMPLE.INVALID ');h.add();h.add();
 assert.deepEqual(JSON.parse(h.storage.get('unharu-shared-favorites-v2:a')),[{email:'friend@example.invalid',name:''}]);
 assert.equal(h.q('favorite-list').children.length,1);assert.deepEqual(h.calls,[]);
 const restored=setup(h.storage);assert.equal(restored.q('favorite-list').children[0].children[0].textContent,'friend@example.invalid');
 restored.q('favorite-list').children[0].children[0].fire('click');assert.deepEqual(restored.calls,['friend@example.invalid']);
});
test('account switch and logout isolate lists and cannot write previous account',()=>{
 const h=setup();h.enter('one@example.invalid');h.add();const old=h.q('favorite-list').children[0].children[0];
 h.login('b');old.fire('click');assert.deepEqual(h.calls,[]);
 h.enter('two@example.invalid');h.add();assert.equal(JSON.parse(h.storage.get('unharu-shared-favorites-v2:a'))[0].email,'one@example.invalid');
 h.login('');assert.equal(h.q('favorite-add').disabled,true);h.enter('three@example.invalid');h.add();assert.equal(h.storage.size,2);
});
test('storage failure retains prior list; corrupt data blocks overwrite',()=>{
 const h=setup();h.enter('one@example.invalid');h.add();h.fail();h.enter('two@example.invalid');h.add();
 assert.equal(h.q('favorite-list').children.length,1);assert.match(h.q('favorite-status').textContent,/저장하지 못/);
 const storage=new Map([['unharu-shared-favorites-v1:a','broken']]),bad=setup(storage);bad.enter('new@example.invalid');bad.add();
 assert.equal(storage.get('unharu-shared-favorites-v1:a'),'broken');assert.equal(bad.q('favorite-add').disabled,true);
});
test('delete changes favorites only and 20-item limit never evicts saved emails',()=>{
 const emails=Array.from({length:20},(_,i)=>'person'+i+'@example.invalid');
 const h=setup(new Map([['unharu-shared-favorites-v1:a',JSON.stringify(emails)]]));
 h.enter('overflow@example.invalid');h.add();assert.equal(JSON.parse(h.storage.get('unharu-shared-favorites-v1:a')).length,20);
 assert.match(h.q('favorite-status').textContent,/최대 20개/);
 h.q('favorite-list').children[0].children[2].fire('click');
 assert.equal(JSON.parse(h.storage.get('unharu-shared-favorites-v2:a')).length,19);assert.deepEqual(h.calls,[]);
});
test('legacy emails remain untouched until save; names persist and click always queries the real email',()=>{
 const key='unharu-shared-favorites-v1:a',raw=JSON.stringify(['SISTER@EXAMPLE.INVALID']);
 const storage=new Map([[key,raw]]),h=setup(storage);
 assert.equal(storage.size,1);assert.equal(storage.get(key),raw);
 h.enter('sister@example.invalid');h.q('favorite-name').value='누나';h.add();
 assert.equal(storage.get(key),raw);assert.deepEqual(JSON.parse(storage.get('unharu-shared-favorites-v2:a')),[{email:'sister@example.invalid',name:'누나'}]);
 const reloaded=setup(storage),button=reloaded.q('favorite-list').children[0].children[0];
 assert.equal(button.textContent,'누나');button.fire('click');assert.deepEqual(reloaded.calls,['sister@example.invalid']);
 assert.equal(reloaded.q('favorite-name').value,'누나');
});
test('rename and blank-name fallback do not duplicate; identical names still use distinct emails',()=>{
 const h=setup();h.enter('one@example.invalid');h.q('favorite-name').value='친구';h.add();
 h.enter('two@example.invalid');h.q('favorite-name').value='친구';h.add();
 h.q('favorite-list').children[1].children[0].fire('click');assert.deepEqual(h.calls,['two@example.invalid']);
 h.q('favorite-list').children[0].children[1].fire('click');assert.equal(h.q('lookup-email').value,'one@example.invalid');
 assert.equal(h.q('favorite-name').focused,true);h.q('favorite-name').value='';h.add();
 assert.equal(h.q('favorite-list').children.length,2);assert.equal(h.q('favorite-list').children[0].children[0].textContent,'one@example.invalid');
});
test('failed rename protects saved name, obsolete rename blocked on account switch; long name rejected',()=>{
 const h=setup();h.enter('one@example.invalid');h.q('favorite-name').value='누나';h.add();
 const staleRename=h.q('favorite-list').children[0].children[1],before=h.storage.get('unharu-shared-favorites-v2:a');
 h.q('favorite-name').value='가'.repeat(41);h.add();assert.equal(h.storage.get('unharu-shared-favorites-v2:a'),before);
 h.fail();h.q('favorite-name').value='다른 이름';h.add();assert.equal(h.storage.get('unharu-shared-favorites-v2:a'),before);
 assert.equal(h.q('favorite-list').children[0].children[0].textContent,'누나');
 h.login('b');staleRename.fire('click');assert.equal(h.q('favorite-name').value,'');
});
test('deleting migrated last entry stays empty after reload rather than resurrecting legacy data',()=>{
 const storage=new Map([['unharu-shared-favorites-v1:a',JSON.stringify(['one@example.invalid'])]]),h=setup(storage);
 h.q('favorite-list').children[0].children[2].fire('click');
 assert.deepEqual(JSON.parse(storage.get('unharu-shared-favorites-v2:a')),[]);
 const again=setup(storage);assert.equal(again.q('favorite-list').children[0].textContent,'아직 저장한 즐겨찾기가 없습니다.');
});
