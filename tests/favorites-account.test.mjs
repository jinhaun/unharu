// 공유 일정 즐겨찾기를 휴대폰과 컴퓨터가 같은 계정으로 쓰는 상황을 가짜 계정 정보로 재현합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const files=['sharing-core.js','sharing-favorites.js'].map(f=>fs.readFileSync(new URL('../assets/'+f,import.meta.url),'utf8'));
class Element{
 constructor(){this.children=[];this.events={};this.value='';this.dataset={};this.textContent='';}
 append(...nodes){this.children.push(...nodes);}after(){}replaceChildren(...nodes){this.children=nodes;}setAttribute(){}focus(){}dispatchEvent(event){this.fire(event.type);}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}fire(type){for(const fn of this.events[type]||[])fn();}
}
const wait=()=>new Promise(r=>setTimeout(r,10));
function account(meta={}){
 const state={meta:JSON.parse(JSON.stringify(meta)),writes:0};
 state.client={auth:{
  async getUser(){return{data:{user:{id:'me',user_metadata:JSON.parse(JSON.stringify(state.meta))}},error:null};},
  async updateUser({data}){state.writes++;state.meta={...state.meta,...JSON.parse(JSON.stringify(data))};return{data:{},error:null};}
 }};
 return state;
}
async function device(acct,local=new Map()){
 const nodes=[],ids=new Map(),events={};
 const make=()=>{const el=new Element();nodes.push(el);return el;};
 const q=id=>nodes.find(el=>el.id===id)||ids.get(id)||(()=>{const el=make();el.id=id;ids.set(id,el);return el;})();
 const window={addEventListener:(name,fn)=>{(events[name]??=[]).push(fn);},DAYFLOW_SUPABASE_CLIENT:acct.client,DAYFLOW_SHARING:{account:()=>'me',lookup:email=>{q('lookup-email').value=email;}}};
 const ctx=vm.createContext({window,Event:class{constructor(type){this.type=type;}},document:{createElement:make,getElementById:q},localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)}});
 for(const source of files)vm.runInContext(source,ctx);
 await wait();
 const fire=(name,detail)=>{for(const fn of events[name]||[])fn({detail});};
 return{
  // 목록의 n번째 줄에서 '삭제' 버튼(줄의 세 번째 버튼)을 누릅니다.
  async removeRow(n){q('favorite-list').children[n].children[2].fire('click');await wait();},
  emails:()=>JSON.parse(local.get('unharu-shared-favorites-v2:me')||'[]').map(v=>v.name||v.email),
  async save(email,name){q('lookup-email').value=email;q('lookup-email').fire('input');q('favorite-name').value=name;q('favorite-add').fire('click');await wait();},
  async viewed(email){fire('dayflow-shared-lookup-found',{email,count:2});await wait();},
  async comeBack(){fire('focus');await wait();},
  status:()=>q('favorite-status').textContent
 };
}
const names=meta=>(meta.unharu_shared_favorites||[]).map(v=>v.name||v.email);

test('a favorite saved on the phone shows up on the computer',async()=>{
 const acct=account();
 const phone=await device(acct),pc=await device(acct);
 await phone.save('sister@gmail.com','누나');
 assert.deepEqual(names(acct.meta),['누나']);
 await pc.comeBack();
 assert.deepEqual(pc.emails(),['누나']);
});
test('just viewing someone’s schedule remembers that email in the account',async()=>{
 const acct=account();
 const phone=await device(acct),pc=await device(acct);
 await phone.viewed('Sister@Gmail.com');
 assert.deepEqual(names(acct.meta),['sister@gmail.com']);
 await phone.viewed('sister@gmail.com'); // 같은 이메일을 다시 봐도 두 번 저장하지 않음
 assert.equal(acct.writes,1);
 const fresh=await device(acct);
 assert.deepEqual(fresh.emails(),['sister@gmail.com']);
});
test('saving on the computer does not wipe out what the phone saved meanwhile',async()=>{
 const acct=account();
 const phone=await device(acct),pc=await device(acct); // 둘 다 빈 목록으로 시작
 await phone.save('sister@gmail.com','누나');
 await pc.save('friend@gmail.com','친구');            // 컴퓨터는 휴대폰 저장을 모르는 상태
 assert.deepEqual(names(acct.meta),['누나','친구']);
 await phone.comeBack();
 assert.deepEqual(phone.emails(),['누나','친구']);
});
test('favorites that only existed in this browser move to the account once',async()=>{
 const acct=account();
 const local=new Map([['unharu-shared-favorites-v2:me',JSON.stringify([{email:'old@gmail.com',name:'예전'}])]]);
 await device(acct,local);
 assert.deepEqual(names(acct.meta),['예전']);
 const other=await device(acct);
 assert.deepEqual(other.emails(),['예전']);
});
test('deleting on one device removes it everywhere; the old browser copy does not bring it back',async()=>{
 const acct=account({unharu_shared_favorites:[{email:'a@gmail.com',name:'A'},{email:'b@gmail.com',name:'B'}]});
 const phoneStore=new Map(),pcStore=new Map();
 const phone=await device(acct,phoneStore),pc=await device(acct,pcStore);
 assert.deepEqual(pc.emails(),['A','B']);
 await phone.removeRow(0);                 // 휴대폰에서 A 삭제
 assert.deepEqual(names(acct.meta),['B']);
 await pc.comeBack();                      // 컴퓨터에 남아 있던 A 사본은 되살아나지 않음
 assert.deepEqual(pc.emails(),['B']);
 assert.deepEqual(names(acct.meta),['B']);
});
test('a lookup that shows schedules tells the favorites list which email was viewed',()=>{
 const sharing=fs.readFileSync(new URL('../assets/email-sharing.js',import.meta.url),'utf8');
 assert.match(sharing,/if\(count&&typeof CustomEvent==='function'\)window\.dispatchEvent\?\.\(new CustomEvent\('dayflow-shared-lookup-found',\{detail:\{email:clean,count\}\}\)\);/);
});
test('when the computer saved first, the phone-only 누나 favorite is merged in, not overwritten',async()=>{
 const acct=account();
 const pc=await device(acct);
 await pc.viewed('friend@gmail.com');                       // 컴퓨터가 먼저 계정 목록을 만듦
 assert.deepEqual(names(acct.meta),['friend@gmail.com']);
 const phoneStore=new Map([['unharu-shared-favorites-v2:me',JSON.stringify([{email:'sister@gmail.com',name:'누나'}])]]);
 const phone=await device(acct,phoneStore);                 // 휴대폰에만 있던 누나
 assert.deepEqual(names(acct.meta),['friend@gmail.com','누나']);
 assert.deepEqual(phone.emails(),['friend@gmail.com','누나']);
 await pc.comeBack();
 assert.deepEqual(pc.emails(),['friend@gmail.com','누나']);
});
test('an old-format favorite and a kept copy in this browser are also brought into the account',async()=>{
 const acct=account({unharu_shared_favorites:[{email:'a@gmail.com',name:'A'}]});
 const store=new Map([['unharu-shared-favorites-v1:me',JSON.stringify(['old@gmail.com'])],['unharu-shared-favorites-backup:me',JSON.stringify([{email:'kept@gmail.com',name:'보관'}])]]);
 await device(acct,store);
 assert.deepEqual(names(acct.meta),['A','old@gmail.com','보관']);
});
test('a lookup that auto-saves before the first merge still keeps this browser’s favorites',async()=>{
 const acct=account({unharu_shared_favorites:[{email:'friend@gmail.com',name:''}]});
 const store=new Map([['unharu-shared-favorites-v2:me',JSON.stringify([{email:'sister@gmail.com',name:'누나'}])],['unharu-shared-favorites-synced:me','']]);
 const phone=await device(acct,store);
 await phone.viewed('new@gmail.com');
 assert.deepEqual(names(acct.meta).sort(),['friend@gmail.com','new@gmail.com','누나'].sort());
});
