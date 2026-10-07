import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
class Element{
 constructor(){this.children=[];this.events={};this.attrs={};this.value='';this.hidden=false;this.open=false;this.dataset={};this.classList={add(){}};}
 append(...nodes){this.children.push(...nodes);}before(...nodes){this.beforeNodes=nodes;}after(...nodes){this.afterNodes=nodes;}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.events[k]=v;}focus(){this.focused=true;}
}
function harness(){
 const nodes=new Map(),created=[],q=id=>{const found=created.find(el=>el.id===id);if(found)return found;if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};const opens=[];
 const window={UNHARU_SHARING_CORE:{twoWeekRange:()=>({today:'2026-10-07'})}};
 const ctx=vm.createContext({window,document:{getElementById:q,querySelector:q,createElement:()=>{const el=new Element();created.push(el);return el;}},TODAY:'2026-10-06',openDayDetails:key=>{window.DAYFLOW_DATE_ENTRY.open(key);q('day-details-dialog').open=true;opens.push(key);}});
 vm.runInContext(fs.readFileSync(new URL('../assets/date-entry.js',import.meta.url),'utf8'),ctx);
 return {q,ctx,window,opens,api:window.DAYFLOW_DATE_ENTRY};
}
test('date click selects date without saving and re-render preserves draft date/mode',()=>{
 const h=harness();h.q('quick-input').value='미저장 내용';h.ctx.openDayDetails('2026-10-12');
 assert.equal(h.q('quick-date').value,'2026-10-12');assert.equal(h.q('.capture').hidden,false);
 assert.equal(h.q('day-details-list').hidden,true);assert.equal(h.q('quick-input').value,'미저장 내용');
 h.api.saved('2026-10-12');assert.equal(h.q('.capture').hidden,true);assert.equal(h.q('quick-date').value,'2026-10-12');
 h.ctx.openDayDetails('2026-10-12');assert.equal(h.q('.capture').hidden,true);
 h.ctx.openDayDetails('2026-10-13');assert.equal(h.q('.capture').hidden,false);assert.equal(h.q('quick-date').value,'2026-10-13');
});
test('date change refreshes selected day; blank date restored; failed sharing stays visible',()=>{
 const h=harness();h.ctx.openDayDetails('2026-10-12');h.q('quick-date').value='2026-10-14';h.q('quick-date').events.change();assert.equal(h.opens.at(-1),'2026-10-14');
 h.q('quick-date').value='';h.q('quick-date').events.change();assert.equal(h.q('quick-date').value,'2026-10-14');
 h.q('quick-share-status').dataset.error='true';h.api.saved('2026-10-14');assert.equal(h.q('.capture').hidden,false);
});
test('every existing save route refreshes day entry and retains original editor nodes',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal((html.match(/DAYFLOW_DATE_ENTRY\?\.saved\(/g)||[]).length,3);
 assert.equal((html.match(/id="quick-input"/g)||[]).length,1);
 assert.equal((html.match(/id="quick-date"/g)||[]).length,1);
 assert.match(html,/DAYFLOW_DATE_ENTRY\?\.open\(key\)/);
});
test('home input starts collapsed, folding keeps draft, and modal close restores prior expansion',()=>{
 const h=harness();assert.equal(h.q('.capture').hidden,true);assert.equal(h.q('capture-fold').attrs['aria-expanded'],'false');
 h.q('capture-fold').events.click();assert.equal(h.q('.capture').hidden,false);
 h.q('quick-input').value='보존할 초안';h.q('capture-fold').events.click();assert.equal(h.q('quick-input').value,'보존할 초안');
 h.q('capture-fold').events.click();h.ctx.openDayDetails('2026-10-13');assert.equal(h.q('capture-fold').disabled,true);
 h.q('day-details-dialog').open=false;h.q('day-details-dialog').events.close();
 assert.equal(h.q('capture-fold').disabled,false);assert.equal(h.q('.capture').hidden,false);assert.equal(h.q('quick-input').value,'보존할 초안');
});
