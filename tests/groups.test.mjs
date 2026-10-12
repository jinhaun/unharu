import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import '../assets/groups-core.js';
const core=globalThis.DAYFLOW_GROUPS_CORE,G='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222';
const event={id:'local-task',type:'task',title:'가상 일정',date:'2026-10-08',time:'10:00',notes:'가상 메모',amount:10000,raw:'not-shared'};
test('group payload only includes selected event/group IDs; consumes no personal data automatically',()=>{
 assert.deepEqual(core.request(event,[G,G],[{id:G}]),{event_id:'local-task',group_ids:[G]});
 assert.throws(()=>core.request({...event,type:'expense'},[G],[{id:G}]),/EVENT_NOT_SHAREABLE/);
 assert.throws(()=>core.request(event,[A],[{id:G}]),/NOT_MEMBER/);assert.deepEqual(core.request(event,[],[]).group_ids,[]);
 assert.equal(core.validCode('a'.repeat(32)),true);assert.equal(core.validCode('12345'),false);
});
test('missing database configuration and network errors never claim completion or leak errors',()=>{
 assert.match(core.errorText({code:'PGRST202'}),/설정이 아직 필요/);
 assert.equal(core.errorText(new Error('a-secret')).includes('a-secret'),false);
});
function harness(){
 const nodes=new Map(),listeners={};let authHandler;
 class Element{
  constructor(tag='div'){this.tag=tag;this.events={};this.children=[];this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.textContent='';this.attrs={};}
  set id(id){this._id=id;nodes.set(id,this);}get id(){return this._id;}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}async fire(name){for(const fn of this.events[name]||[])await fn({preventDefault(){}});}
  append(...v){this.children.push(...v);}after(){}before(){}add(v){this.children.push(v);}replaceChildren(...v){this.children=v;this.value='';}
  setAttribute(k,v){this.attrs[k]=v;}focus(){}select(){}showModal(){this.open=true;}close(){this.open=false;this.fire('close');}
  querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...(c.querySelectorAll?.('*')||[])]);if(selector==='input:checked')return all.filter(n=>n.tag==='input'&&n.checked);if(selector==='*')return all;return all.filter(n=>['button','select','input'].includes(n.tag)&&n.id!=='groups-close');}
 }
 const q=id=>{if(!nodes.has(id)){const el=new Element();el.id=id;}return nodes.get(id);};
 const h={calls:[],allow:true,flush:true,reply:null,confirms:[],groups:[{id:G,name:'가상 가족',is_owner:true}]};
 const window={setTimeout:fn=>fn(),setInterval:()=>{},addEventListener:(k,fn)=>listeners[k]=fn,
  DAYFLOW_CLOUD:{ready:()=>true,flush:async()=>h.flush},DAYFLOW_TASK_TIME:{format:()=> '10:00'},
  DAYFLOW_SUPABASE_CLIENT:{auth:{onAuthStateChange:fn=>authHandler=fn,getSession:async()=>({data:{session:{user:{id:A}}}})},rpc:async(name,args)=>{
   h.calls.push({name,...args});if(h.reply)return h.reply(args);
   const data={list:{groups:h.groups},event_groups:{group_ids:[]},detail:{id:G,name:'가상 가족',is_owner:true,members:[]},events:{events:[],start:'2026-10-05',end:'2026-10-18'},set_event_groups:{saved:true},create:{id:G,code:'A'.repeat(32)},join:{id:G}}[args.p_action]||{};
   return {data};
  }}};
 const document={getElementById:q,createElement:tag=>new Element(tag),body:new Element(),activeElement:null,hidden:false,addEventListener:(k,fn)=>listeners[k]=fn};
 const ctx=vm.createContext({window,document,Option:class{constructor(text,value){this.text=text;this.value=value;}},items:[event,{...event,id:'expense',type:'expense'}],inputMode:'task',confirm:message=>{h.confirms.push(message);return h.allow;},showToast:()=>{},navigator:{clipboard:{writeText:async()=>{}}}});
 for(const file of ['sharing-core.js','groups-core.js','groups.js'])vm.runInContext(readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),ctx);
 return Object.assign(h,{q,window,ctx,choose:(...ids)=>q('quick-group').querySelectorAll('input').forEach(el=>el.checked=ids.includes(el.value)),auth:id=>authHandler('SIGNED_IN',id?{user:{id}}:null),settle:()=>new Promise(r=>setImmediate(r))});
}
test('no automatic requests on startup; opening loads only own group metadata and saved event IDs',async()=>{
 const h=harness();await h.settle();assert.equal(h.calls.length,0);await h.window.DAYFLOW_GROUPS.open(event.id);
 assert.equal(h.q('groups-dialog').open,true);assert.equal(h.q('groups-event').children.length,2);
 assert.equal(h.calls.some(c=>c.p_action==='set_event_groups'),false);assert.equal(h.q('groups-save').disabled,false);
});
test('group selection and confirm is required before inline sharing; cancellation saves nothing',async()=>{
 const h=harness();await h.settle();assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),null);
 await h.q('quick-groups-load').fire('click');h.choose(G);h.allow=false;assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),false);
 h.allow=true;const request=h.window.DAYFLOW_GROUPS.prepare([event]);await h.window.DAYFLOW_GROUPS.complete(request);
 assert.equal(h.calls.filter(c=>c.p_action==='set_event_groups').length,1);assert.equal(h.q('quick-group').querySelectorAll('input:checked').length,0);assert.match(h.q('quick-groups-status').textContent,/선택한 그룹에 공유했습니다/);
 assert.equal(JSON.stringify(h.calls).includes('not-shared'),false);assert.equal(h.calls.some(c=>c.name==='dayflow_set_event_published'),false);
});
test('private save failure blocks sharing and does not discard private input',async()=>{
 const h=harness();await h.settle();await h.q('quick-groups-load').fire('click');h.choose(G);h.flush=false;
 await h.window.DAYFLOW_GROUPS.complete(h.window.DAYFLOW_GROUPS.prepare([event]));assert.equal(h.calls.some(c=>c.p_action==='set_event_groups'),false);assert.match(h.q('quick-groups-status').textContent,/서버 저장을 확인하지 못/);assert.equal(h.ctx.items.length,2);
});
test('no stale response or inline grant crosses an account change',async()=>{
 const h=harness();await h.settle();await h.q('quick-groups-load').fire('click');h.choose(G);const request=h.window.DAYFLOW_GROUPS.prepare([event]);
 let finish;h.reply=()=>new Promise(resolve=>finish=resolve);const loading=h.window.DAYFLOW_GROUPS.open(event.id);while(!finish)await h.settle();
 h.auth(null);finish({data:{groups:[{id:G,name:'old owner'}]}});await loading;await h.window.DAYFLOW_GROUPS.complete(request);
 assert.equal(h.q('groups-dialog').open,false);assert.equal(h.q('groups-list').children.length,1);assert.equal(h.q('groups-targets').children.length,1);assert.equal(h.calls.some(c=>c.p_action==='set_event_groups'),false);
});
test('setup missing leaves sharing controls disabled and private records alone',async()=>{
 const h=harness();await h.settle();h.reply=()=>({error:{code:'PGRST202'}});await h.window.DAYFLOW_GROUPS.open(event.id);
 assert.match(h.q('groups-status').textContent,/設定|설정이 아직 필요/);assert.equal(h.q('groups-save').disabled,true);assert.equal(h.ctx.items[0],event);
});
test('group member/create UI returns errors, duplicate clicks do not create duplicate groups',async()=>{
 const h=harness();await h.settle();h.q('groups-name').value='가족';h.q('groups-nickname').value='나';let finish;
 h.reply=({p_action})=>p_action==='create'?new Promise(r=>finish=r):({data:{groups:[]}});
 const first=h.q('groups-create').fire('click');while(!finish)await h.settle();await h.q('groups-create').fire('click');assert.equal(h.calls.filter(c=>c.p_action==='create').length,1);
 finish({error:{code:'503'}});await first;assert.match(h.q('groups-status').textContent,/완료 여부를 확인하지 못/);
});
test('new scripts parse; public index connects group prepare and complete without altering storage',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/DAYFLOW_GROUPS\?\.prepare\(savedItems\)/);assert.match(html,/DAYFLOW_GROUPS\?\.complete\(groupRequest\)/);
 for(const file of ['groups.js','groups-core.js'])assert.doesNotThrow(()=>new vm.Script(readFileSync(new URL('../assets/'+file,import.meta.url),'utf8')));
 const sql=readFileSync(new URL('../docs/group-schema-v66.sql',import.meta.url),'utf8');assert.doesNotMatch(sql,/update public\.dayflow_user_state|delete from public\.dayflow_user_state|insert into public\.dayflow_published_events/i);
});
test('inline multi-group selection sends exactly one atomic request and confirms every group',async()=>{
 const h=harness();await h.settle();h.groups.push({id:A,name:'가상 친구'});await h.q('quick-groups-load').fire('click');
 h.choose(G,A);const request=h.window.DAYFLOW_GROUPS.prepare([event,{...event,id:'repeat-next'}]);
 assert.deepEqual(Array.from(request.args.group_ids),[G,A]);assert.equal(request.args.event_id,event.id);
 assert.match(h.confirms.at(-1),/2개 그룹.*가상 가족, 가상 친구/);
 await h.window.DAYFLOW_GROUPS.complete(request);
 const writes=h.calls.filter(c=>c.p_action==='set_event_groups');assert.equal(writes.length,1);
 assert.deepEqual(Array.from(writes[0].p_args.group_ids),[G,A]);
 assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),null);
});
test('refresh preserves checked groups only, new groups never selected and removed groups dropped',async()=>{
 const h=harness();await h.settle();await h.q('quick-groups-load').fire('click');h.choose(G);
 h.groups.push({id:A,name:'다른 그룹'});await h.q('quick-groups-load').fire('click');
 assert.deepEqual(h.q('quick-group').querySelectorAll('input:checked').map(e=>e.value),[G]);
 h.groups=h.groups.filter(g=>g.id!==G);await h.q('quick-groups-load').fire('click');
 assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),null);
});
test('clear all and switching to expense cannot leave accidental shares',async()=>{
 const h=harness();await h.settle();h.groups.push({id:A,name:'친구'});await h.q('quick-groups-load').fire('click');
 h.choose(G,A);await h.q('quick-groups-clear').fire('click');assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),null);
 h.choose(G,A);h.ctx.inputMode='expense';h.window.DAYFLOW_GROUPS.modeChanged();assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),null);
});
test('cancel keeps checkboxes, server rejection is not partial success and preserves personal record',async()=>{
 const h=harness();await h.settle();h.groups.push({id:A,name:'친구'});await h.q('quick-groups-load').fire('click');
 h.choose(G,A);h.allow=false;assert.equal(h.window.DAYFLOW_GROUPS.prepare([event]),false);assert.equal(h.q('quick-group').querySelectorAll('input:checked').length,2);
 h.allow=true;const request=h.window.DAYFLOW_GROUPS.prepare([event]);h.reply=()=>({data:{error:'NOT_MEMBER'}});
 await h.window.DAYFLOW_GROUPS.complete(request);
 assert.match(h.q('quick-groups-status').textContent,/접근 권한이 없습니다/);assert.equal(h.ctx.items[0],event);
 assert.equal(h.calls.filter(c=>c.p_action==='set_event_groups').length,1);
});
