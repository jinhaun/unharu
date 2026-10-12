import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const old=path.resolve(root,'../unharu-minimal-canal-2026-10-08-v62');
function previousStyle(text){return text.replaceAll('rgba(255,254,248,.60)','rgba(255,254,248,.76)').replace('button.day-number{background:rgba(255,254,248,.92);color:#203a40','button.day-number{background:transparent;color:#203a40').replace('.day.outside button.day-number{background:rgba(255,254,248,.92);color:#52646a','.day.outside button.day-number{background:transparent;color:#64777d').replace('.day.sunday button.day-number,.day.holiday button.day-number{color:#b43637}\n.day.saturday button.day-number{color:#2461a1}\n.day.holiday button.day-number{background:rgba(255,226,226,.94);box-shadow:inset 0 0 0 1px #d98b8b}\n.holiday-label{color:#b43637}\n','');}
test('Commute change preserves the existing minimal theme',()=>{
 assert.equal(previousStyle(fs.readFileSync(path.join(root,'assets/minimal-canal.css'),'utf8')),fs.readFileSync(path.join(old,'assets/minimal-canal.css'),'utf8'));
 assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/href="assets\/minimal-canal.css"/);
});
test('Existing assets stay unchanged except approved transit changes and snack category',()=>{
 function compare(rel){for(const name of fs.readdirSync(path.join(old,rel))){const file=path.join(rel,name),normalized=file.replaceAll('\\','/');if(normalized==='assets/transit.js')continue;
 if(normalized==='assets/certificate-settings.js'){assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/      const guide = window\.DAYFLOW_EXAM_GUIDES\?\.render\(exam.id\); if\(guide\)card.append\(guide\);\r?\n/,''),fs.readFileSync(path.join(old,file),'utf8'));continue;}
 if(normalized==='assets/minimal-canal.css'){assert.equal(previousStyle(fs.readFileSync(path.join(root,file),'utf8')),fs.readFileSync(path.join(old,file),'utf8'));continue;}
 if(normalized==='assets/expense-report.js'){
  const report=fs.readFileSync(path.join(root,file),'utf8').replace(/^    window\.UnharuHabits\?\.render\(body,real,baseline,\{target,prior,days:range.targetEnd,priorDays:range.priorEnd,demo:mode==='demo'\}\);\r?\n/m,'');
  assert.equal(report.replace("['식비','간식','카페','교통','쇼핑','구독','의료','기타']","['식비','카페','교통','쇼핑','구독','의료','기타']"),fs.readFileSync(path.join(old,file),'utf8'));continue;
 }
 if(fs.statSync(path.join(old,file)).isDirectory())compare(file);else assert.ok(fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(old,file))),file);}}
 for(const dir of ['assets','api','data'])compare(dir);
 for(const file of ['package.json','vercel.json'])assert.ok(fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(old,file))));
 assert.equal(fs.existsSync(path.join(root,'assets/favorites-store.js')),false);
});
test('Theme contains no remote assets or data-changing scripts; calendar remains seven columns',()=>{
 const css=fs.readFileSync(path.join(root,'assets/minimal-canal.css'),'utf8');
 assert.doesNotMatch(css,/https?:|javascript:|@import|localStorage|supabase/i);
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:760px\)/);
});
