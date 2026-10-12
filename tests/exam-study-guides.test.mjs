import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root=new URL('../',import.meta.url),old=new URL('../../unharu-multi-group-share-2026-10-08-v70/',import.meta.url);
const read=(file,base=root)=>fs.readFileSync(new URL(file,base),'utf8');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';this.attrs={};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,v){this.events[k]=v;}
}
function setup(){const context={window:{},document:{createElement:t=>new Element(t)}};vm.createContext(context);vm.runInContext(read('assets/exam-study-guides.js'),context);return context.window.DAYFLOW_EXAM_GUIDES;}
const walk=node=>[node,...node.children.flatMap(walk)];
test('all seven registered exams have accessible guide, official links and separate recommendations',()=>{
 const api=setup();const feed={window:{}};vm.createContext(feed);vm.runInContext(read('data/certificate-feed.js'),feed);
 for(const exam of feed.window.DAYFLOW_CERT_FEED.certificates){
 const node=api.render(exam.id),nodes=walk(node);assert.equal(node.tag,'details');assert.equal(nodes[1].tag,'summary');
 assert.ok(nodes.some(x=>x.textContent==='추천 공부 순서'));
 const links=nodes.filter(x=>x.tag==='a');assert.ok(links.length);for(const a of links){assert.ok(['www.dataq.or.kr','exam.toeic.co.kr','www.jlpt.jp','www.historyexam.go.kr','www.q-net.or.kr','license.korcham.net'].includes(new URL(a.href).hostname));assert.equal(a.rel,'noopener noreferrer');}
 }assert.equal(api.render('unknown'),null);
});
test('JLPT level switches guidance only and reset is safe',()=>{
 const nodes=walk(setup().render('jlpt')),select=nodes.find(x=>x.tag==='select'),live=nodes.find(x=>x.attrs['aria-live']);
 assert.equal(select.children.length,6);
 for(const level of ['N1','N2','N3','N4','N5']){select.value=level;select.events.change();assert.match(live.textContent,/公式|공식 시험 구성/);assert.match(live.textContent,/추천 순서/);}
 select.value='';select.events.change();assert.equal(live.textContent,'급수를 선택하세요.');
 assert.ok(nodes.some(x=>x.tag==='label'&&x.htmlFor===select.id));
});
test('no runtime AI/network, account write, HTML injection or exam selection side effects',()=>{
 const src=read('assets/exam-study-guides.js');assert.doesNotMatch(src,/fetch\(|localStorage|supabase|innerHTML|\.rpc\(|eval\(/);
 assert.match(src,/현재 세부 출제기준 원문을 다시 확인하지 못했습니다/);
 assert.match(src,/자동 갱신되지 않습니다/);
});
test('v71 modifies only guide UI, preserves all dates, auth, expenses, groups, calendar and settings',()=>{
 const hook='      const guide = window.DAYFLOW_EXAM_GUIDES?.render(exam.id); if(guide)card.append(guide);';
 assert.equal(read('assets/certificate-settings.js').split(/\r?\n/).filter(x=>x!==hook).join('\n'),read('assets/certificate-settings.js',old).split(/\r?\n/).join('\n'));
 const normalizeHoliday=(source)=>{
  let lines=source.split(/\r?\n/);
  const start=lines.findIndex(x=>x.includes('// 2026년 대한민국 공휴일'));
  const end=lines.findIndex((x,i)=>i>start&&x.includes('function renderCalendar'));
  if(start>=0&&end>start) lines.splice(start,end-start);
  return lines.filter(x=>x.trim()!=='cell.append(dayHeading);'&&!x.includes('.holiday-label {')&&!x.includes('const holiday = HOLIDAYS_2026')&&!x.includes('const weekend = current.getDay()')&&!x.includes('holidayLabel')).map(x=>x.includes('cell.className = `day') ? "        cell.className = `day${current.getMonth() !== month ? ' outside' : ''}${key === TODAY ? ' today' : ''}`;" : x.includes("number.setAttribute('aria-label'") ? "        number.setAttribute('aria-label', `${key} 하루 기록 전체 보기`);" : x.includes('const dayHeading=document.createElement') ? '        const dayHeading=document.createElement(\'div\');dayHeading.className=\'day-heading\';dayHeading.append(number);cell.append(dayHeading);' : x).join('\n');
 };
 const index=normalizeHoliday(read('index.html')).split(/\r?\n/).filter(x=>!x.includes('assets/exam-study-guides.')).join('\n');
 assert.match(index,/const STORAGE_KEY/); assert.match(index,/function renderCalendar/); assert.match(index,/id="calendar-days"/); assert.match(index,/DAYFLOW_CERT_SETTINGS/);
 function compare(rel){for(const name of fs.readdirSync(new URL(rel,old))){const file=rel+name;if(['assets/certificate-settings.js','assets/minimal-canal.css'].includes(file))continue;if(fs.statSync(new URL(file,old)).isDirectory())compare(file+'/');else assert.ok(fs.readFileSync(new URL(file,root)).equals(fs.readFileSync(new URL(file,old))),file);}}
 for(const dir of ['assets/','api/','data/'])compare(dir);
 const html=read('index.html');assert.ok(html.indexOf('src="assets/exam-study-guides.js"')<html.indexOf('src="assets/certificate-settings.js"'));
});
