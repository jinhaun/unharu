import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
class Element{
 constructor(){this.value='';this.checked=false;this.disabled=false;this.children=[];this.events={};this.dataset={};this.open=false;}
 append(...nodes){this.children.push(...nodes);} after(){} before(){} focus(){} add(node){this.children.push(node);}
 replaceChildren(...nodes){this.children=nodes;this.value='';} setAttribute(){} showModal(){this.open=true;}close(){this.open=false;}
 addEventListener(name,fn){this.events[name]=fn;} async fire(name){await this.events[name]?.({preventDefault(){}});await new Promise(r=>setImmediate(r));}
}
const item={id:'fixture-event',type:'task',title:'약속',date:'2026-10-07',time:'18:00',notes:'메모'};
function harness(){
 const elements=new Map(),q=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const calls=[],handlers={},docHandlers={};let authHandler,flushOK=true,confirmOK=true,replyError=null,lookupReply=[],delay=null,saveDelay=null;
 const window={setTimeout:fn=>fn(),setInterval:()=>{},addEventListener:(name,fn)=>handlers[name]=fn,dispatchEvent:event=>handlers[event.type]?.(),DAYFLOW_CLOUD:{ready:()=>true,flush:async()=>{calls.push('flush');return saveDelay?saveDelay():flushOK;}},DAYFLOW_SUPABASE_CLIENT:{auth:{onAuthStateChange:fn=>authHandler=fn,getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:()=>{const query={select:()=>query,eq:async()=>({data:[]})};return query;},rpc:async(name,args)=>{calls.push({name,args});return name==='dayflow_lookup_calendar'?(delay?delay(args):{data:lookupReply,error:replyError}):{data:true,error:replyError};}}};
 const document={hidden:false,getElementById:q,body:new Element(),createElement:()=>new Element(),addEventListener:(name,fn)=>docHandlers[name]=fn,querySelectorAll:()=>[]};
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-07T06:00:00Z']));}};
 const ctx=vm.createContext({window,document,Date:FixedDate,Event:class{constructor(type){this.type=type;}},Option:class{constructor(text,value){this.text=text;this.value=value;}},items:[{...item}],detailLabels:{},inputMode:'task',renderView:()=>{},openDayDetails:()=>{},showToast:()=>{},confirm:()=>confirmOK});
 for(const file of ['sharing-core.js','email-sharing.js','email-publish.js'])vm.runInContext(fs.readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),ctx);
 return {q,ctx,calls,window,api:window.DAYFLOW_INLINE_SHARING, async ready(){await new Promise(r=>setImmediate(r));},login:id=>authHandler('SIGNED_IN',id?{user:{id}}:null),failSave:()=>flushOK=false,cancel:()=>confirmOK=false,failRPC:()=>replyError={code:'42501'},rows:value=>lookupReply=value,delay:fn=>delay=fn,delaySave:fn=>saveDelay=fn,async search(email){q('lookup-email').value=email;await q('lookup-form').fire('submit');},hide(){document.hidden=true;docHandlers.visibilitychange();}};
}
test('share is private by default, explicit flag needs no contacts and saves after own cloud flush',async()=>{
 const h=harness();await h.ready();assert.equal(h.api.prepare([item]),null);h.q('quick-share-enabled').checked=true;const intent=h.api.prepare([item]);assert.ok(intent);await h.api.complete(intent);
 assert.equal(h.calls[0],'flush');assert.equal(h.calls[1].name,'dayflow_set_event_published');assert.equal(h.calls[1].args.p_shared,true);assert.equal(h.calls[1].args.p_event_id,item.id);assert.equal(h.q('quick-share-enabled').checked,false);
});
test('expense, cancellation and signed-out sharing are blocked before saving',async()=>{
 const h=harness();await h.ready();h.q('quick-share-enabled').checked=true;assert.equal(h.api.prepare([{...item,type:'expense'}]),false);h.cancel();assert.equal(h.api.prepare([item]),false);h.login('');h.q('quick-share-enabled').checked=true;assert.equal(h.api.prepare([item]),false);assert.deepEqual(h.calls,[]);
});
test('failed private flush never grants, RPC failure does not claim shared',async()=>{
 for(const failure of ['failSave','failRPC']){const h=harness();await h.ready();h.q('quick-share-enabled').checked=true;h[failure]();await h.api.complete(h.api.prepare([item]));assert.match(h.q('quick-share-status').textContent,/공유 완료를 확인하지 못/);assert.equal(h.calls.length,failure==='failSave'?1:2);}
});
test('exact normalized email query returns sanitized readonly fields, no registration call',async()=>{
 const h=harness();await h.ready();h.rows([{owner_id:'someone',event_id:'one',title:'Title',date:'2026-10-07',time:'18:00',notes:'Note',raw:'SECRET',amount:999}]);await h.search(' PERSON@EXAMPLE.INVALID ');
 assert.equal(h.calls[0].name,'dayflow_lookup_calendar');assert.equal(h.calls[0].args.p_email,'person@example.invalid');const rows=h.window.DAYFLOW_SHARING.received();assert.equal(rows.length,1);assert.equal(rows[0].type,'shared');assert.equal(rows[0].raw,undefined);assert.equal(rows[0].amount,undefined);
});
test('late result cannot return after typing another email, hiding or changing account',async()=>{
 for(const invalidate of ['input','hide','login']){const h=harness();await h.ready();let finish;h.delay(()=>new Promise(r=>finish=r));const pending=h.search('one@example.invalid');await new Promise(r=>setImmediate(r));
 if(invalidate==='input')await h.q('lookup-email').fire('input');else if(invalidate==='hide')h.hide();else h.login('other');
 finish({data:[{owner_id:'a',event_id:'1',title:'OLD'}]});await pending;assert.equal(h.window.DAYFLOW_SHARING.received().length,0);}
});
test('unknown/no sharing result differs from connection failure and clears previous result',async()=>{
 const h=harness();await h.ready();await h.search('empty@example.invalid');assert.match(h.q('lookup-status').textContent,/조회할 공유 일정이 없습니다/);
 h.failRPC();await h.search('empty@example.invalid');assert.match(h.q('lookup-status').textContent,/확인하지 못했습니다/);assert.equal(h.window.DAYFLOW_SHARING.received().length,0);
});
test('account change during private save cannot publish for next account',async()=>{
 const h=harness();await h.ready();h.q('quick-share-enabled').checked=true;let finish;h.delaySave(()=>new Promise(r=>finish=r));const pending=h.api.complete(h.api.prepare([item]));h.login('other');finish(true);await pending;assert.deepEqual(h.calls,['flush']);assert.equal(h.q('quick-share-status').textContent,'');
});
test('runtime loads only new email sharing UI, auth and private storage unchanged',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(html.includes('src="assets/email-sharing.js"'));assert.ok(!html.includes('src="assets/sharing.js"'));assert.ok(!html.includes('src="assets/inline-sharing.js"'));
 assert.equal(fs.readFileSync(new URL('../assets/dayflow-auth.js',import.meta.url),'utf8').replaceAll('나다운하루','운하루'),fs.readFileSync(new URL('./baselines/v44/dayflow-auth.js',import.meta.url),'utf8'));
});

test('shared list groups this and next week, shows weekdays, excludes outside dates without mutating rows',async()=>{
 const h=harness();await h.ready();
 const dates=['2026-10-04','2026-10-05','2026-10-11','2026-10-12','2026-10-18','2026-10-19',''];
 const rows=dates.map((date,i)=>({owner_id:'fixture-owner',event_id:String(i),date,time:'18:00',title:'가상 일정 '+i,notes:'공유 메모'}));
 const original=JSON.stringify(rows);h.rows(rows);await h.search('fixture@example.invalid');
 assert.equal(JSON.stringify(rows),original);
 assert.deepEqual(Array.from(h.window.DAYFLOW_SHARING.received(),r=>r.date),dates.slice(1,5));
 const text=el=>[el.textContent||'',...el.children.map(text)].join(' ');
 assert.match(text(h.q('lookup-results')),/2026년 10월 5일 \(월\) · 18:00/);
 assert.match(text(h.q('lookup-results')),/2026년 10월 18일 \(일\) · 18:00/);
 assert.doesNotMatch(text(h.q('lookup-results')),/가상 일정 (0|5|6)/);
 assert.equal(h.q('lookup-results').children.length,2);
 assert.match(h.q('lookup-range').textContent,/월요일 시작/);
 assert.match(h.q('lookup-status').textContent,/공유 일정 4건/);
});

test('weekday formatting and Korean two-week boundaries include Sunday and roll Monday across years',()=>{
 const h=harness(),core=h.window.UNHARU_SHARING_CORE;
 assert.equal(core.formatDate('2026-10-08'),'2026년 10월 8일 (목)');
 assert.equal(core.formatDate('2024-02-29'),'2024년 2월 29일 (목)');
 for(const invalid of ['',null,'2026-02-30','2026-13-01','not-a-date'])assert.equal(core.formatDate(invalid),'날짜 미정');
 let r=core.twoWeekRange(new Date('2026-10-11T14:59:59Z'));
 assert.equal(r.today,'2026-10-11');assert.equal(r.start,'2026-10-05');assert.equal(r.end,'2026-10-18');
 r=core.twoWeekRange(new Date('2026-10-11T15:00:00Z'));
 assert.equal(r.today,'2026-10-12');assert.equal(r.start,'2026-10-12');assert.equal(r.end,'2026-10-25');
 r=core.twoWeekRange(new Date('2026-12-31T06:00:00Z'));
 assert.equal(r.start,'2026-12-28');assert.equal(r.end,'2027-01-10');
});
