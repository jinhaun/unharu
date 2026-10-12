import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const box={};vm.createContext(box);vm.runInContext(fs.readFileSync(new URL('../assets/commute-core.js',import.meta.url),'utf8'),box);
const core=box.UNHARU_COMMUTE_CORE;
const trip=(id,extra={})=>({id,type:'expense',date:'2026-10-08',time:'08:30',title:'A → B',amount:1550,notes:'메모',transit:{origin:'A',destination:'B',steps:[{label:'버스'}],referenceFare:1550,amountBasis:'confirmed'},...extra});
const out=(id='o',extra={})=>core.plan([],trip(id,extra),'outbound').saved;
test('outbound saved first, return combines into same ID with one expense total',()=>{
 const o=out(),r=trip('r',{time:'18:10',amount:1650}),input=[o],snapshot=JSON.stringify(input);
 const result=core.plan(input,r,'return');
 assert.equal(result.items.length,1);assert.equal(result.saved.id,'o');assert.equal(result.saved.amount,3200);assert.equal(result.saved.title,'출퇴근 교통비');
 assert.equal(result.saved.transit.commuteLegs[0].amount,1550);assert.equal(result.saved.transit.commuteLegs[1].amount,1650);
 assert.equal(result.saved.transit.commuteLegs[1].time,'18:10');assert.equal(result.saved.transit.commuteLegs[0].notes,'메모');
 assert.equal(JSON.stringify(input),snapshot);assert.equal(r.title,'A → B');assert.equal(result.items.reduce((s,i)=>s+i.amount,0),3200);
});
test('different day, old unclassified transit and ordinary expense never merge',()=>{
 for(const existing of [out('o',{date:'2026-10-07'}),trip('old'),{id:'x',type:'expense',date:'2026-10-08',amount:5000}]){
  const result=core.plan([existing],trip('r'),'return');assert.equal(result.items.length,2);assert.equal(result.merged,false);assert.equal(result.items[0],existing);
 }
});
test('multiple outbound entries require explicit valid target',()=>{
 const items=[out('a'),out('b')];assert.throws(()=>core.plan(items,trip('r'),'return'),/선택/);
 assert.throws(()=>core.plan(items,trip('r'),'return','missing'),/선택/);
 const r=core.plan(items,trip('r'),'return','b');assert.equal(r.saved.id,'b');assert.equal(r.items[0],items[0]);
});
test('paired entries are not merged again; replay of same return ID rejected',()=>{
 const paired=core.plan([out()],trip('r'),'return');
 assert.throws(()=>core.plan(paired.items,trip('r'),'return'),/이미/);
 const next=core.plan(paired.items,trip('r2'),'return');assert.equal(next.merged,false);assert.equal(next.items.length,2);
});
test('amount validation, zero fare and estimates preserve meaning',()=>{
 for(const amount of [-10,NaN,Infinity,1555,null])assert.throws(()=>core.plan([],trip('x',{amount}),'outbound'));
 const r=trip('r',{amount:0,transit:{...trip('x').transit,referenceFare:0,amountBasis:'estimated'}});
 const saved=core.plan([out()],r,'return').saved;assert.equal(saved.amount,1550);assert.equal(saved.transit.amountBasis,'estimated');
});
test('reload retains both route details; pairing does not require mirrored routes',()=>{
 const r=trip('r',{transit:{origin:'C',destination:'D',steps:[{label:'지하철'}],referenceFare:1550,amountBasis:'confirmed'}});
 const saved=JSON.parse(JSON.stringify(core.plan([out()],r,'return').saved));
 assert.equal(saved.transit.commuteLegs[1].transit.origin,'C');assert.equal(saved.transit.commuteLegs[1].transit.steps[0].label,'지하철');
});
test('storage failure rolls back records and leaves input intact; success resets only after save',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const body=html.slice(html.indexOf('    function saveTransitExpense() {'),html.indexOf("    $('#calculate-transit').addEventListener"));
 const nodes=new Map();const q=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',dataset:{},checked:false});return nodes.get(id);};
 q('#quick-date').value='2026-10-08';q('#quick-input').value='귀가 메모';
 let fail=true,resets=0;
 const ctx={items:[out()],transitQuote:{origin:'B',destination:'A',fare:1550},TODAY:'2026-10-08',Date,Math,$:q,formatMoney:v=>v+'원',renderView(){},resetTransitResult(){resets++;},persist(){if(fail)throw Error('storage full');},window:{DAYFLOW_TRANSIT:{prepareSave:()=>true,record:()=>trip('t').transit,restore(){}},DAYFLOW_DATE_ENTRY:{saved(){}}}};
 ctx.window.DAYFLOW_COMMUTE={plan:i=>core.plan(ctx.items,i,'return'),reset(){}};
 vm.createContext(ctx);vm.runInContext(body,ctx);const previous=ctx.items;
 ctx.saveTransitExpense();assert.equal(ctx.items,previous);assert.equal(q('#quick-input').value,'귀가 메모');assert.equal(resets,0);
 fail=false;ctx.saveTransitExpense();assert.equal(ctx.items.length,1);assert.equal(ctx.items[0].amount,3100);assert.equal(resets,1);assert.equal(q('#quick-input').value,'');
});
