import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const html=read('index.html');
const ctx={};
vm.runInNewContext(html.slice(html.indexOf('function expenseCategory('),html.indexOf('function makeTitle(')),ctx);
const lists=()=>{
 const out={};
 for(const file of ['assets/expense-report.js','assets/expense-habits-core.js','assets/expense-categories.js'])out[file]=read(file).match(/\[('식비'[^\]]*)\]/)[1];
 return out;
};
test('게임 is offered when adding, editing and filtering spending, and in every summary',()=>{
 for(const id of ['expense-category','edit-category'])assert.match(html.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))[1],/<option value="게임">게임<\/option><option value="기타">기타<\/option>/);
 assert.match(html,/data-expense-category="게임" aria-pressed="false">게임<\/button>/);
 for(const [file,list] of Object.entries(lists()))assert.equal(list,"'식비','간식','카페','교통','쇼핑','구독','의료','게임','기타'",file);
 assert.match(read('assets/expense-categories.css'),/\[data-category="게임"\] \{ --cat:#[0-9a-f]{6}; \}/);
});
test('game purchases are sorted into 게임 automatically, and a chosen category still wins',()=>{
 for(const text of ['스팀 게임 결제 33,000','닌텐도 eShop 64,800','뱅가드 부스터팩 6,000','PC방 3,000','메이플 현질 10,000','유희왕 카드팩 5,000'])assert.equal(ctx.expenseCategory(text),'게임',text);
 for(const [text,expected] of [['점심 김밥 9,000','식비'],['쿠팡 생필품 12,000','쇼핑'],['넷플릭스 13,500','구독'],['버스 1,500','교통']])assert.equal(ctx.expenseCategory(text),expected,text);
 assert.equal(ctx.itemExpenseCategory({type:'expense',title:'스팀 게임',category:'쇼핑'}),'쇼핑');
 assert.equal(ctx.itemExpenseCategory({type:'expense',title:'스팀 게임'}),'게임');
});
