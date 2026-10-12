import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const reportContext={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../assets/expense-report.js',import.meta.url),'utf8'),reportContext);
const report=reportContext.module.exports;
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ctx={};
vm.runInNewContext(html.slice(html.indexOf('function expenseCategory('),html.indexOf('function makeTitle(')),ctx);
test('snack option consistent in create edit filter and report',()=>{
 for(const id of ['expense-category','edit-category']){
  const options=html.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))[1];
  const values=[...options.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]).filter(v=>v!=='auto');
  assert.deepEqual(values,Array.from(report.categories));
  assert.match(options,/<option value="간식">간식<\/option>/);
 }
 const buttons=html.match(/id="expense-category-filter"[\s\S]*?<\/div>/)[0];
 assert.deepEqual([...buttons.matchAll(/data-expense-category="([^"]+)"/g)].map(m=>m[1]).filter(v=>v!=='all'),Array.from(report.categories));
 assert.match(buttons,/data-expense-category="간식" aria-pressed="false">간식<\/button>/);
});
test('snacks and meals aggregate independently without changing records or total',()=>{
 const records=[{type:'expense',date:'2026-10-08',amount:9000,category:'식비',title:'점심'},
 {type:'expense',date:'2026-10-08',amount:1550,category:'간식',title:'과자'},
 {type:'expense',date:'2026-10-07',amount:2310,category:'간식',title:'아이스크림'},
 {type:'expense',date:'2026-09-08',amount:1000,category:'간식',title:'과자'}];
 const before=JSON.stringify(records);
 const result=report.compareRecords(records,'2026-10','2026-09','2026-10-08',ctx.itemExpenseCategory);
 assert.equal(result.current.total,12860);
 assert.equal(result.current.byCategory['간식'],3860);
 assert.equal(result.current.byCategory['식비'],9000);
 assert.equal(result.current.byCategory['기타'],0);
 assert.equal(result.baseline.byCategory['간식'],1000);
 assert.equal(JSON.stringify(records),before);
});
test('saved category stays authoritative and legacy inference remains unchanged',()=>{
 assert.equal(ctx.itemExpenseCategory({type:'expense',title:'과자',category:'식비'}),'식비');
 assert.equal(ctx.itemExpenseCategory({type:'expense',title:'커피',category:'간식'}),'간식');
 const baseline=fs.readFileSync(new URL('../../unharu-group-sharing-2026-10-08-v66/index.html',import.meta.url),'utf8');
 const section=s=>s.slice(s.indexOf('function expenseCategory('),s.indexOf('function makeTitle('));
 assert.equal(section(html),section(baseline));
 assert.match(html,/category:item|category:selectedCategory/);
 assert.match(html,/item.category=item.type === 'expense' \? \$\('#edit-category'\).value/);
});
