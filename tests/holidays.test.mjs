import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
const css=fs.readFileSync(new URL('assets/minimal-canal.css',root),'utf8');
test('2026 public holidays are visibly and accessibly marked',()=>{
  for(const [key,name] of [['2026-03-01','삼일절'],['2026-05-05','어린이날'],['2026-09-24','추석'],['2026-10-09','한글날'],['2026-12-25','성탄절']]) assert.match(html,new RegExp(`'${key}':'${name}'`));
  assert.match(html,/holiday-label/); assert.match(html,/공휴일 \$\{holiday\}/);
  assert.match(css,/.day\.sunday button\.day-number,.day\.holiday button\.day-number\{color:#b43637/);
  assert.match(css,/.day\.holiday button\.day-number\{background:rgba\(255,226,226,.94\)/);
});
test('holiday presentation does not write records or call a service',()=>{
  const start=html.indexOf('const HOLIDAYS_2026');
  const end=html.indexOf('function renderCalendar',start);
  const source=html.slice(start,end);
  assert.doesNotMatch(source,/fetch\(|localStorage|supabase|\.rpc\(/);
});
