import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element{
 constructor(){this.children=[];this.events={};this.value='';this.dataset={};}
 append(...nodes){this.children.push(...nodes);}after(){}replaceChildren(...nodes){this.children=nodes;}setAttribute(){}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}fire(type){for(const fn of this.events[type]||[])fn();}
}
// Track generated nodes without depending on browser internals or real accounts.
function setup(storage=new Map()){
 let owner='a',deny=false;const nodes=[],ids=new Map(),events={},calls=[];
 const make=()=>{const el=new Element();nodes.push(el);return el;};
 const q=id=>nodes.find(el=>el.id===id)||ids.get(id)||(()=>{const el=make();el.id=id;ids.set(id,el);return el;})();
 const window={addEventListener:(name,fn)=>events[name]=fn,DAYFLOW_SHARING:{account:()=>owner,lookup:email=>{calls.push(email);q('lookup-email').value=email;}}};
 const ctx=vm.createContext({window,document:{createElement:make,getElementById:q},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(deny)throw Error('quota');storage.set(key,value);}}});
 for(const file of ['sharing-core.js','sharing-favorites.js'])vm.runInContext(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),ctx);
 return {q,storage,calls,enter(email){q('lookup-email').value=email;q('lookup-email').fire('input');},add(){q('favorite-add').fire('click');},login(next){owner=next;events['dayflow-sharing-account-change']();},fail(){deny=true;}};
}
test('favorites normalize, deduplicate, persist and explicitly re-query without granting access',()=>{
 const h=setup();h.enter(' FRIEND@EXAMPLE.INVALID ');h.add();h.add();
 assert.deepEqual(JSON.parse(h.storage.get('unharu-shared-favorites-v1:a')),['friend@example.invalid']);
 assert.equal(h.q('favorite-list').children.length,1);assert.deepEqual(h.calls,[]);
 const restored=setup(h.storage);assert.equal(restored.q('favorite-list').children[0].children[0].textContent,'friend@example.invalid');
 restored.q('favorite-list').children[0].children[0].fire('click');assert.deepEqual(restored.calls,['friend@example.invalid']);
});
test('account switch and logout isolate lists and cannot write previous account',()=>{
 const h=setup();h.enter('one@example.invalid');h.add();const old=h.q('favorite-list').children[0].children[0];
 h.login('b');old.fire('click');assert.deepEqual(h.calls,[]);
 h.enter('two@example.invalid');h.add();assert.equal(JSON.parse(h.storage.get('unharu-shared-favorites-v1:a'))[0],'one@example.invalid');
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
 h.q('favorite-list').children[0].children[1].fire('click');
 assert.equal(JSON.parse(h.storage.get('unharu-shared-favorites-v1:a')).length,19);assert.deepEqual(h.calls,[]);
});
