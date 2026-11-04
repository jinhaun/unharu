// 컴퓨터(오래 켜 둔 화면)와 휴대폰이 같은 계정 저장 공간을 쓰는 상황을 가짜 저장 공간으로 재현합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const mergeSource=read('assets/cloud-merge.js'),authSource=read('assets/dayflow-auth.js');
const clone=v=>JSON.parse(JSON.stringify(v));
// 실제 저장 공간처럼 기록 안 항목 순서를 바꿔(가나다순) 돌려줍니다.
const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,reorder(v[k])])):v;

function cloud(row){
 const db={row:row?clone(row):null,writes:0};
 db.client=userId=>({
  auth:{onAuthStateChange(){},async getSession(){return{data:{session:{user:{id:userId,email:'me@example.com'}}},error:null};}},
  from(){
   const q={select(){return q;},eq(){return q;},
    async maybeSingle(){return{data:db.row?reorder(clone(db.row)):null,error:null};},
    async upsert(snapshot){db.writes++;db.row={items:clone(snapshot.items),saved_routes:clone(snapshot.saved_routes),updated_at:snapshot.updated_at};return{error:null};}};
   return q;
  }
 });
 return db;
}

async function device(db,userId='user-1'){
 const nodes=new Map(),node=()=>({textContent:'',dataset:{},hidden:false,disabled:false,inert:false,open:false,title:'',setAttribute(){},removeAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}});
 const docListeners={};
 const store=new Map();
 const ctx={
  console:{error:(...a)=>process.env.DEBUG_SYNC&&console.log('ERR',...a),log(){}},
  localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
  document:{hidden:false,querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll:()=>[],addEventListener:(t,f)=>{(docListeners[t]??=[]).push(f);}},
  items:[],savedTransitRoutes:[],STORAGE_KEY:'items-key',ROUTE_STORAGE_KEY:'routes-key',
  renderSavedTransitRoutes(){},renderView(){},showToast(){},clearTimeout,
  persist(){ctx.localStorage.setItem('items-key',JSON.stringify(ctx.items));},
  persistSavedTransitRoutes(){return true;}
 };
 ctx.window={
  location:{hostname:'unharu.vercel.app',search:'',protocol:'https:',origin:'https://unharu.vercel.app',pathname:'/'},
  DAYFLOW_SUPABASE_CONFIG:{url:'https://example.supabase.co',publishableKey:'test'},
  supabase:{createClient:()=>db.client(userId)},
  addEventListener(){},setTimeout:(f,ms)=>setTimeout(f,ms),setInterval:()=>0,confirm:()=>true
 };
 vm.createContext(ctx);
 vm.runInContext(mergeSource,ctx);
 vm.runInContext(authSource,ctx);
 await new Promise(r=>setTimeout(r,20));
 return{
  ctx,
  titles:()=>JSON.parse(JSON.stringify(ctx.items.map(i=>i.title))).sort(),
  add(title){ctx.items=[...ctx.items,{id:`id-${title}`,type:'task',title,date:'2026-11-04'}];ctx.persist();return ctx.window.DAYFLOW_CLOUD.flush();},
  // 삭제 버튼: 화면 목록에서 빼고 '지운 기록'으로 알립니다.
  remove(title){const gone=ctx.items.filter(i=>i.title===title).map(i=>i.id);ctx.items=ctx.items.filter(i=>i.title!==title);ctx.window.DAYFLOW_CLOUD.markDeleted('items',gone);ctx.persist();return ctx.window.DAYFLOW_CLOUD.flush();},
  // 삭제 버튼 없이 화면 목록에서만 빠진 경우(예상치 못한 오류 등).
  lose(title){ctx.items=ctx.items.filter(i=>i.title!==title);ctx.persist();return ctx.window.DAYFLOW_CLOUD.flush();},
  edit(title,next){ctx.items=ctx.items.map(i=>i.title===title?{...i,title:next}:i);ctx.persist();return ctx.window.DAYFLOW_CLOUD.flush();},
  async comeBack(){for(const f of docListeners.visibilitychange||[])f();await new Promise(r=>setTimeout(r,20));await new Promise(r=>setTimeout(r,300));}
 };
}
const start=[{id:'id-아침 회의',type:'task',title:'아침 회의',date:'2026-11-04'}];

test('the computer left open does not wipe out what was entered on the phone',async()=>{
 const db=cloud({items:start,saved_routes:[]});
 const pc=await device(db);          // 아침에 켜 둔 컴퓨터
 const phone=await device(db);       // 집 가는 길 휴대폰
 assert.deepEqual(pc.titles(),['아침 회의']);
 assert.equal(await phone.add('휴대폰 저녁 약속'),true);
 assert.equal(await pc.add('컴퓨터 보고서'),true);   // 휴대폰 기록을 모르는 채로 저장
 assert.deepEqual(db.row.items.map(i=>i.title).sort(),['아침 회의','컴퓨터 보고서','휴대폰 저녁 약속']);
 assert.deepEqual(pc.titles(),['아침 회의','컴퓨터 보고서','휴대폰 저녁 약속']); // 컴퓨터 화면에도 바로 보임
 await phone.comeBack();
 assert.deepEqual(phone.titles(),['아침 회의','컴퓨터 보고서','휴대폰 저녁 약속']);
});

test('returning to the computer shows phone entries, deletions and edits without saving anything new',async()=>{
 const db=cloud({items:[...start,{id:'id-장보기',type:'task',title:'장보기',date:'2026-11-04'}],saved_routes:[]});
 const pc=await device(db),phone=await device(db);
 await phone.add('휴대폰 일정');await phone.remove('장보기');await phone.edit('아침 회의','아침 회의(10시)');
 const writes=db.writes;
 await pc.comeBack();
 assert.deepEqual(pc.titles(),['아침 회의(10시)','휴대폰 일정']);
 assert.equal(db.writes,writes); // 불러오기만 하고 다시 저장하지 않음
 await pc.comeBack();
 assert.equal(db.writes,writes); // 순서만 다른 기록 때문에 계속 저장하지 않음
});

test('a deletion on the computer is kept while the phone adds something at the same time',async()=>{
 const db=cloud({items:[...start,{id:'id-취소된 약속',type:'task',title:'취소된 약속',date:'2026-11-04'}],saved_routes:[]});
 const pc=await device(db),phone=await device(db);
 await phone.add('휴대폰 일정');
 await pc.remove('취소된 약속');
 assert.deepEqual(db.row.items.map(i=>i.title).sort(),['아침 회의','휴대폰 일정']);
});

test('a record that disappears from the screen without the delete button is never removed from the account',async()=>{
 const db=cloud({items:[...start,{id:'id-중요한 일정',type:'task',title:'중요한 일정',date:'2026-11-04'}],saved_routes:[]});
 const pc=await device(db),phone=await device(db);
 await pc.lose('중요한 일정');                  // 삭제 버튼을 누르지 않았는데 목록에서 빠짐
 assert.deepEqual(db.row.items.map(i=>i.title).sort(),['아침 회의','중요한 일정']);
 assert.deepEqual(pc.titles(),['아침 회의','중요한 일정']); // 컴퓨터 화면에도 다시 나타남
 await phone.comeBack();
 assert.deepEqual(phone.titles(),['아침 회의','중요한 일정']);
});

test('the delete button on one device removes the record on the other device too',async()=>{
 const db=cloud({items:[...start,{id:'id-취소',type:'task',title:'취소',date:'2026-11-04'}],saved_routes:[]});
 const pc=await device(db),phone=await device(db);
 await phone.remove('취소');
 await pc.comeBack();
 assert.deepEqual(pc.titles(),['아침 회의']);
 await pc.add('새 일정');                       // 컴퓨터가 저장해도 지운 기록이 되살아나지 않음
 assert.deepEqual(db.row.items.map(i=>i.title).sort(),['새 일정','아침 회의']);
});
