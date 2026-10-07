import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
class Element{
 constructor(){this.checked=false;this.disabled=false;this.value='';this.hidden=false;this.children=[];this.dataset={};this.events={};}
 append(...nodes){this.children.push(...nodes);} before(){} focus(){}
 replaceChildren(...nodes){this.children=nodes;} addEventListener(event,handler){this.events[event]=handler;}
 querySelectorAll(){return this.children.flatMap(label=>label.children).filter(el=>el.type==='checkbox'&&el.checked);}
 async fire(event){await this.events[event]?.();await new Promise(resolve=>setImmediate(resolve));}
}
const event={id:'new-event',type:'task',title:'가상 약속',date:'2026-10-07',time:'18:00',notes:'선택 메모'};
function harness(){
 const map=new Map(),q=id=>{if(!map.has(id))map.set(id,new Element());return map.get(id);};
 let owner='owner',confirmResult=true,flushResult=true,rpcError=null,contactError=null,flushFn=null,contacts=[{recipient_id:'friend',email:'friend@example.invalid'}];
 const calls=[],notices=[],listeners={},window={addEventListener:(n,f)=>listeners[n]=f,DAYFLOW_SHARING:{account:()=>owner,open:id=>notices.push(id)},DAYFLOW_CLOUD:{ready:()=>!!owner,flush:async()=>{calls.push('flush');return flushFn?flushFn():flushResult;}},DAYFLOW_SUPABASE_CLIENT:{from:()=>{const query={select:()=>query,eq:()=>query,order:async()=>({data:contacts,error:contactError})};return query;},rpc:async(name,args)=>{calls.push({name,args});return {error:rpcError};}}};
 const ctx=vm.createContext({window,document:{getElementById:q,createElement:()=>new Element(),querySelectorAll:()=>[]},confirm:text=>{notices.push(text);return confirmResult;},inputMode:'task',console});
 vm.runInContext(fs.readFileSync(new URL('../assets/sharing-core.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(new URL('../assets/inline-sharing.js',import.meta.url),'utf8'),ctx);
 return {q,ctx,window,calls,notices,api:window.DAYFLOW_INLINE_SHARING,
 async choose(){q('quick-share-enabled').checked=true;await q('quick-share-enabled').fire('change');const first=q('quick-share-people').children[0]?.children[0];if(first)first.checked=true;},
 setOwner(value){owner=value;listeners['dayflow-sharing-account-change']();},failContacts(){contactError={code:'42501'};},noContacts(){contacts=[];},cancel(){confirmResult=false;},failFlush(){flushResult=false;},failRpc(){rpcError={code:'42501'};},delayFlush(fn){flushFn=fn;}};
}
test('default private does not request sharing or retain previous people',async()=>{
 const h=harness();assert.equal(h.api.prepare([event]),null);await h.api.complete(null);assert.deepEqual(h.calls,[]);
 await h.choose();assert.ok(h.api.prepare([event]));h.q('quick-share-enabled').checked=false;await h.q('quick-share-enabled').fire('change');assert.equal(h.api.prepare([event]),null);
});
test('explicit selection flushes own record before shared RPC, then resets to private',async()=>{
 const h=harness();await h.choose();const request=h.api.prepare([event]);await h.api.complete(request);
 assert.equal(h.calls[0],'flush');assert.equal(h.calls[1].name,'dayflow_set_event_sharing');assert.equal(h.calls[1].args.p_event_id,event.id);assert.deepEqual([...h.calls[1].args.p_recipients],['friend']);
 assert.equal(h.q('quick-share-enabled').checked,false);assert.match(h.q('quick-share-status').textContent,/1명에게 공유/);assert.equal(h.api.prepare([event]),null);
});
test('no recipients, failed contact load, cancellation and expenses cannot save/share',async()=>{
 for(const mode of ['noContacts','failContacts','cancel']){const h=harness();h[mode]();await h.choose();assert.equal(h.api.prepare([event]),false);assert.deepEqual(h.calls,[]);}
 const h=harness();await h.choose();assert.equal(h.api.prepare([{...event,type:'expense'}]),false);assert.deepEqual(h.calls,[]);
});
test('private save failure never sends grant; ambiguous grant failure points to existing event',async()=>{
 const h=harness();await h.choose();h.failFlush();await h.api.complete(h.api.prepare([event]));assert.deepEqual(h.calls,['flush']);assert.match(h.q('quick-share-status').textContent,/공유 완료를 확인하지 못/);await h.q('quick-share-check').fire('click');assert.equal(h.notices.at(-1),event.id);
 const h2=harness();await h2.choose();h2.failRpc();await h2.api.complete(h2.api.prepare([event]));assert.equal(h2.calls.length,2);assert.match(h2.q('quick-share-status').textContent,/다시 입력하지 말고/);
});
test('account change while flushing cannot grant to next account or restore old success',async()=>{
 const h=harness();await h.choose();let resolve;h.delayFlush(()=>new Promise(r=>resolve=r));const pending=h.api.complete(h.api.prepare([event]));h.setOwner('other');resolve(true);await pending;
 assert.deepEqual(h.calls,['flush']);assert.equal(h.q('quick-share-status').textContent,'');assert.equal(h.q('quick-share-check').hidden,true);
});
test('expense mode clears prior recipient selection; recurrence shares explicit first date only',async()=>{
 const h=harness();await h.choose();h.ctx.inputMode='expense';h.api.modeChanged();assert.equal(h.q('quick-share-enabled').checked,false);
 h.ctx.inputMode='task';h.api.modeChanged();await h.choose();const request=h.api.prepare([event,{...event,id:'next',date:'2026-10-14'}]);assert.match(h.notices.at(-1),/2건 중 첫 날짜 한 건만/);assert.equal(request.eventId,event.id);
});
test('actual quick save handler blocks double save while sharing and cancellation preserves input',async()=>{
 const h=harness(),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 Object.assign(h.ctx,{$:selector=>h.q(selector.slice(1)),items:[],viewDate:null,parseDate:()=>null,parseInput:()=>({...event}),expandRecurringItem:item=>[item],persist:()=>{},renderView:()=>{},downloadCalendarEvent:()=>{},typeLabels:{task:'할 일'}});
 h.q('quick-input').value='가상 약속';h.q('repeat-frequency').value='none';h.q('repeat-duration').value='3';
 vm.runInContext(html.slice(html.indexOf('    let quickInputSaving'),html.indexOf("    $('#parse-button').addEventListener('click', saveQuickInput)")),h.ctx);
 await h.choose();let resolve;h.delayFlush(()=>new Promise(r=>resolve=r));const first=h.ctx.saveQuickInput();h.q('quick-input').value='중복 클릭 입력';await h.ctx.saveQuickInput();assert.equal(h.ctx.items.length,1);resolve(true);await first;assert.equal(h.calls.length,2);
 h.q('quick-input').value='취소할 입력';await h.choose();h.cancel();await h.ctx.saveQuickInput();assert.equal(h.ctx.items.length,1);assert.equal(h.q('quick-input').value,'취소할 입력');
});
