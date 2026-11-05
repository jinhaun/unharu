// 그룹 일정의 사람별 색·날짜순/사람별 보기·사람 끄기를 가짜 그룹 서버로 확인합니다.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const G='11111111-1111-4111-8111-111111111111',ME='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SIS='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',MOM='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function setup(store=new Map()){
 const nodes=new Map();
 class El{
  constructor(tag='div'){this.tag=tag;this.events={};this.children=[];this.value='';this.hidden=false;this.textContent='';this.attrs={};this.className='';this.vars={};this.style={setProperty:(k,v)=>{this.vars[k]=v;}};this.options=[];}
  set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id;}
  addEventListener(n,f){(this.events[n]??=[]).push(f);}async fire(n){for(const f of this.events[n]||[])await f({preventDefault(){}});}
  append(...v){this.children.push(...v);}prepend(...v){this.children.unshift(...v);}after(){}before(){}add(o){this.options.push(o);this.children.push(o);}
  replaceChildren(...v){this.children=v;this.options=[];}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}focus(){}showModal(){this.open=true;}close(){this.open=false;}
  querySelectorAll(){return [];}
  get text(){return [this.textContent,...this.children.map(c=>typeof c==='string'?c:c.text)].join('');}
  all(){return this.children.flatMap(c=>typeof c==='string'?[]:[c,...c.all()]);}
 }
 const q=id=>{if(!nodes.has(id)){const el=new El();el.id=id;}return nodes.get(id);};
 const day=n=>new Date(Date.now()+9*3600000+n*86400000).toISOString().slice(0,10);
 const events=[[ME,'나','어제 일정',-1,'09:00'],[ME,'나','보고서',0,'10:00'],[SIS,'누나','치과',0,'14:30'],[MOM,'엄마','모임',1,'18:00'],[SIS,'누나','출장',2,''],[SIS,'누나','결혼식',8,'12:00']].map(([o,n,t,d,time])=>({owner_id:o,nickname:n,title:t,date:day(d),time}));
 const data={list:{groups:[{id:G,name:'우리 가족',is_owner:true}]},event_groups:{group_ids:[]},
  detail:{id:G,name:'우리 가족',is_owner:true,members:[{id:ME,nickname:'하운',is_me:true,is_owner:true},{id:SIS,nickname:'누나'},{id:MOM,nickname:'엄마'}]},
  events:{events,start:day(0),end:day(13)}};
 const window={setTimeout:f=>f(),setInterval(){},addEventListener(){},DAYFLOW_CLOUD:{ready:()=>true,flush:async()=>true},
  DAYFLOW_SUPABASE_CLIENT:{auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:ME}}}})},rpc:async(n,args)=>({data:data[args.p_action]||{}})}};
 const document={getElementById:q,createElement:t=>new El(t),body:new El(),activeElement:null,addEventListener(){}};
 const ctx=vm.createContext({window,document,Option:class{constructor(t,v){this.text=t;this.value=v;}},items:[],inputMode:'task',confirm:()=>true,showToast(){},Event:class{constructor(t){this.type=t;}},
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}});
 for(const f of ['sharing-core.js','groups-core.js','groups.js'])vm.runInContext(readFileSync(new URL('../assets/'+f,import.meta.url),'utf8'),ctx);
 const settle=()=>new Promise(r=>setImmediate(r));
 return {q,window,settle,store,
  async show(){await settle();await window.DAYFLOW_GROUPS.open();await settle();q('groups-list').value=G;await q('groups-list').fire('change');await settle();await settle();},
  cards:()=>q('groups-events').all().filter(n=>n.className==='shared-card group-card'),
  chips:()=>q('groups-events').all().filter(n=>n.className==='group-person'),
  modes:()=>q('groups-events').all().filter(n=>n.tag==='button'&&['날짜순','사람별'].includes(n.textContent))};
}
test('every person gets one fixed color, used on their name chip and on all their cards',async()=>{
 const h=setup();await h.show();
 const chips=h.chips();
 assert.deepEqual(chips.map(c=>c.text),['하운 (나) 1','누나 3','엄마 1']);
 const colors=chips.map(c=>c.vars['--person']);
 assert.equal(new Set(colors).size,3);
 const cards=h.cards();
 assert.equal(cards.length,5);
 for(const c of cards){const name=c.children[0].text;const i=['하운 (나)','누나','엄마'].indexOf(name);assert.equal(c.vars['--person'],colors[i],name);}
});
test('사람별 view groups each person together and the choice is remembered',async()=>{
 const h=setup();await h.show();
 await h.modes().find(b=>b.textContent==='사람별').fire('click');
 const heads=h.q('groups-events').all().filter(n=>n.className==='shared-week group-person-section').map(s=>s.children[0].text);
 assert.deepEqual(heads,['하운 (나) · 1건','누나 · 3건','엄마 · 1건']);
 assert.equal(h.store.get('unharu-group-view-v1'),'person');
 const again=setup(h.store);await again.show();
 assert.equal(again.modes().find(b=>b.textContent==='사람별').attrs['aria-pressed'],'true');
});
test('tapping a person hides or shows only that person’s schedules',async()=>{
 const h=setup();await h.show();
 await h.chips().find(c=>c.text.startsWith('누나')).fire('click');
 assert.deepEqual(h.cards().map(c=>c.children[0].text),['하운 (나)','엄마']);
 assert.equal(h.chips().find(c=>c.text.startsWith('누나')).attrs['aria-pressed'],'false');
 await h.chips().find(c=>c.text.startsWith('누나')).fire('click');
 assert.equal(h.cards().length,5);
});
test('past days are hidden from group schedules, even within this week',async()=>{
 const h=setup();await h.show();
 // 가짜 서버가 어제 일정을 보내도 화면에는 나오지 않아야 합니다.
 const titles=h.cards().map(c=>c.children[2].textContent);
 assert.ok(!titles.includes('어제 일정'));
});
