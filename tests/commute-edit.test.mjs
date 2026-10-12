import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../assets/commute-core.js',import.meta.url),'utf8'),ctx);
const core=ctx.UNHARU_COMMUTE_CORE;
const trip=(id,extra={})=>({id,type:'expense',category:'교통',date:'2026-10-08',time:'08:00',title:'기존 경로 '+id,amount:1550,notes:'원본 메모 '+id,transit:{origin:'A',destination:'B',steps:[{label:'마을버스'}],referenceFare:1550,amountBasis:'confirmed'},...extra});
test('mark old outbound then return: count two to one and total unchanged',()=>{
 const a=trip('a'),b=trip('b',{time:'19:00',amount:1750}),all=[a,b],before=JSON.stringify(all);
 const first=core.edit(all,a,'outbound');assert.equal(first.items.length,2);assert.equal(first.saved.transit.commuteRole,'outbound');
 const second=core.edit(first.items,b,'return');assert.equal(second.items.length,1);assert.equal(second.saved.id,'a');assert.equal(second.saved.amount,3300);
 assert.equal(second.saved.transit.commuteLegs[1].id,'b');assert.equal(second.saved.transit.commuteLegs[1].notes,b.notes);
 assert.equal(second.saved.transit.commuteLegs[1].transit.originalTitle,b.title);assert.equal(JSON.stringify(all),before);
});
test('edits combine updated values once, preserving unrelated records',()=>{
 const a=core.edit([trip('a')],trip('a'),'outbound').saved,b=trip('b'),other={id:'x',type:'task'};
 const r=core.edit([a,b,other],{...b,amount:2000,notes:'변경 메모'},'return');
 assert.equal(r.items.length,2);assert.equal(r.saved.amount,3550);assert.equal(r.saved.transit.commuteLegs[1].notes,'변경 메모');assert.equal(r.items[1],other);
});
test('several candidates require explicit valid choice; cannot choose self',()=>{
 const a=core.edit([trip('a')],trip('a'),'outbound').saved,c={...a,id:'c'},b=trip('b');
 assert.throws(()=>core.edit([a,c,b],b,'return'),/선택/);
 assert.throws(()=>core.edit([a,c,b],b,'return','b'),/선택/);
 const r=core.edit([a,c,b],b,'return','c');assert.equal(r.saved.id,'c');assert.equal(r.items.length,2);
});
test('different dates do not combine and general edits do not generate duplicates',()=>{
 const a=core.edit([trip('a')],trip('a'),'outbound').saved,b=trip('b',{date:'2026-10-09'});
 const r=core.edit([a,b],b,'return');assert.equal(r.items.length,2);assert.equal(r.merged,false);
 const plain=core.edit(r.items,{...r.saved,title:'수정 제목'},'general');assert.equal(plain.items.length,2);assert.equal(plain.saved.transit.commuteRole,'general');assert.equal(plain.saved.title,'수정 제목');
});
test('manual transport records can be classified without inventing routes',()=>{
 const a=trip('a'),b=trip('b');delete a.transit;delete b.transit;
 const first=core.edit([a,b],a,'outbound'),second=core.edit(first.items,b,'return');
 assert.equal(second.saved.amount,3100);assert.equal(second.saved.transit.commuteLegs[0].transit.source,'manual');assert.equal(second.saved.transit.commuteLegs[0].transit.steps.length,0);
});
test('missing record, stale return, malformed amounts fail without changing originals',()=>{
 const all=[trip('a')],before=JSON.stringify(all);
 assert.throws(()=>core.edit(all,trip('missing'),'return'),/찾지/);
 assert.throws(()=>core.edit(all,{...all[0],amount:1555},'outbound'),/금액/);
 assert.equal(JSON.stringify(all),before);
});
test('already paired record cannot become a single-leg record',()=>{
 const a=core.edit([trip('a')],trip('a'),'outbound').saved,b=trip('b');
 const pair=core.edit([a,b],b,'return').saved;
 assert.throws(()=>core.edit([pair],pair,'outbound'),/이미/);
 const updated=core.edit([pair],{...pair,title:'수정',amount:4000},'paired');assert.equal(updated.items.length,1);assert.equal(updated.saved.transit.commuteLegs.length,2);assert.equal(updated.saved.amount,4000);
});
test('real edit submit clones before mutation and rolls back on failed storage',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),start=html.indexOf("    $('#edit-form').addEventListener('submit'");
 const script=html.slice(start,html.indexOf("    $('#edit-type').addEventListener",start));
 const nodes=new Map();const q=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,addEventListener(t,fn){this[t]=fn;}});return nodes.get(id);};
 const a=core.edit([trip('a')],trip('a'),'outbound').saved,b=trip('b');
 for(const [key,value] of Object.entries({'edit-id':'b','edit-type':'expense','edit-title-field':b.title,'edit-date':b.date,'edit-time':'19:00','edit-amount':'1550','edit-category':'교통','edit-notes':'귀가'}))q('#'+key).value=value;
 let failure=true,closed=0,error='';const c={items:[a,b],$:q,typeLabels:{expense:'소비'},closeEdit(){closed++;},renderView(){},persist(){if(failure)throw Error('storage full');},window:{DAYFLOW_TRANSIT:{prepareEdit(item){item.transit.amountBasis='confirmed';return true;}},DAYFLOW_COMMUTE_EDIT:{plan(item){return core.edit(c.items,item,'return');},error(message){error=message;}}}};
 const original=JSON.stringify(c.items);vm.createContext(c);vm.runInContext(script,c);
 q('#edit-form').submit({preventDefault(){}});assert.equal(JSON.stringify(c.items),original);assert.equal(closed,0);assert.equal(error,'storage full');assert.equal(q('#edit-notes').value,'귀가');
 failure=false;q('#edit-form').submit({preventDefault(){}});assert.equal(c.items.length,1);assert.equal(c.items[0].amount,3100);assert.equal(closed,1);
});
