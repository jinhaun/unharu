import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
class Element {
 constructor(){this.children=[];this.events={};this.value='';this.open=false;this.dataset={};}
 append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
 setAttribute(){} addEventListener(name,fn){this.events[name]=fn;} focus(){} showModal(){this.open=true;} close(){this.open=false;}
 fire(name){this.events[name]?.({preventDefault(){}});}
}
function harness(stored=new Map()) {
 const els=new Map(),q=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};
 let account='',deny=false;const events={},calls=[];
 const window={DAYFLOW_SHARING:{account:()=>account},addEventListener:(name,fn)=>events[name]=fn};
 const context=vm.createContext({window,document:{getElementById:q,createElement:()=>new Element(),body:{append:el=>els.set(el.id,el)}},IS_TEST_MODE:true,showCertificates:true,showMyCalendar:()=>calls.push('hide'),showSelectedCertificates:()=>calls.push('show'),renderView:()=>calls.push('render'),openDayDetails:()=>calls.push('day'),showToast:()=>{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>{if(deny)throw new Error('denied');stored.set(k,v);}}});
 vm.runInContext(source('data/certificate-feed.js'),context);
 vm.runInContext(source('assets/certificate-core.js'),context);window.DAYFLOW_CERT_CORE=context.DAYFLOW_CERT_CORE;
 vm.runInContext(source('assets/certificate-settings.js'),context);
 const api=window.DAYFLOW_CERT_SETTINGS, core=window.DAYFLOW_CERT_CORE,catalog=window.DAYFLOW_CERT_FEED.certificates;
 return {q,api,core,catalog,stored,calls,deny:()=>deny=true,login:id=>{account=id;events['dayflow-sharing-account-change']();},choose:id=>{const card=q('exam-results').children.find(card=>card.children[0].children[0].value===id);assert.ok(card);const box=card.children[0].children[0];box.checked=true;box.fire('change');},search:query=>{q('exam-search').value=query;q('exam-search').fire('input');}};
}
test('catalog supports aliases, space/case normalization and honest unavailable statuses',()=>{
 const h=harness();for(const [query,ids] of [['토익',['toeic']],[' sql d ',['sqld']],['한능검',['history-advanced']],['컴활 2급',['computer-2']],['정처기',['information-engineer']],['없는시험',[]]])assert.deepEqual(Array.from(h.core.search(h.catalog,query),x=>x.id),ids);
 assert.equal(h.catalog.length,7);assert.ok(h.catalog.filter(x=>x.id.startsWith('computer-')||x.id==='information-engineer').every(x=>x.events.length===0));
 const ids=h.catalog.flatMap(x=>x.events.map(e=>e.id));assert.equal(ids.length,new Set(ids).size);
});
test('initial selection empty; filtering keeps draft; only save commits; cancel does not',()=>{
 const h=harness();assert.equal(h.api.selected().length,0);h.api.open();h.choose('sqld');h.search('한국사');h.choose('history-advanced');assert.equal(h.api.selected().length,0);h.q('exam-save').fire('click');assert.deepEqual(Array.from(h.api.selected()),['sqld','history-advanced']);assert.deepEqual(h.calls,['show']);
 h.api.open();h.q('exam-clear').fire('click');h.q('exam-cancel').fire('click');assert.deepEqual(Array.from(h.api.selected()),['sqld','history-advanced']);
 h.api.open();assert.match(h.q('exam-selection-summary').textContent,/2개 선택/);
});
test('reload remembers settings; empty save hides exams without writing personal records',()=>{
 const h=harness();h.api.open();h.choose('sqld');h.q('exam-save').fire('click');const next=harness(h.stored);assert.deepEqual(Array.from(next.api.selected()),['sqld']);next.api.open();next.q('exam-clear').fire('click');next.q('exam-save').fire('click');assert.equal(next.api.selected().length,0);assert.equal(next.stored.size,1);assert.match([...next.stored.keys()][0],/^dayflow-exam-settings-v1:test:/);
});
test('storage failure retains last choice and open dialog, never claims success',()=>{
 const h=harness();h.api.open();h.choose('sqld');h.q('exam-save').fire('click');h.api.open();h.choose('toeic');h.deny();h.q('exam-save').fire('click');assert.deepEqual(Array.from(h.api.selected()),['sqld']);assert.match(h.q('exam-feedback').textContent,/저장하지 못/);assert.equal(h.q('certificate-settings-dialog').open,true);assert.equal(h.calls.length,1);
});
test('account changes close drafts, isolate choices and avoid adopting guest settings',()=>{
 const h=harness();h.api.open();h.choose('sqld');h.q('exam-save').fire('click');h.api.open();h.login('a');assert.equal(h.api.selected().length,0);assert.equal(h.q('certificate-settings-dialog').open,false);h.api.open();h.choose('toeic');h.q('exam-save').fire('click');h.login('b');assert.equal(h.api.selected().length,0);h.login('a');assert.deepEqual(Array.from(h.api.selected()),['toeic']);h.login('');assert.deepEqual(Array.from(h.api.selected()),['sqld']);
 assert.notEqual(h.core.key('a',true),h.core.key('a',false));
});
test('corrupt settings show recovery, unknown ids/duplicates are discarded safely',()=>{
 const stored=new Map([['dayflow-exam-settings-v1:test:guest','broken']]);const h=harness(stored);h.api.open();assert.match(h.q('exam-feedback').textContent,/읽지 못/);assert.deepEqual(Array.from(h.core.cleanSelection(['sqld','sqld','unknown',null],h.catalog)),['sqld']);
});
test('calendar and date details use selected-only derived items; stored personal items untouched',()=>{
 const html=source('index.html');assert.match(html,/showCertificates \? \[\.\.\.items, \.\.\.selectedCertificateItems\(\)\] : items/);assert.match(html,/showCertificates \? selectedCertificateItems\(\) : \[\]/);assert.match(html,/certificateId:certificate.id/);
 const settings=source('assets/certificate-settings.js');assert.doesNotMatch(settings,/persist\(|items\s*=|fetch\(|\.rpc\(|\.from\(/);
 assert.ok(html.indexOf('assets/certificate-settings.js')>html.indexOf('assets/email-sharing.js'));
});
