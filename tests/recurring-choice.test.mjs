import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('repeat settings expose user-selectable daily, weekly and monthly periods',()=>{
  assert.match(html,/id="repeat-frequency"/);
  for(const value of ['none','daily','weekly','monthly']) assert.match(html,new RegExp(`value="${value}"`));
  assert.match(html,/repeatFrequency === 'daily' \? '매일'/);
});
test('daily repeats advance one day and export as DAILY without changing stored base data',()=>{
  assert.match(html,/frequency === 'daily'/);
  assert.match(html,/nextDate\.setDate\(nextDate\.getDate\(\)\+1\)/);
  assert.match(html,/frequency === 'daily' \? 'DAILY'/);
  assert.match(html,/recurrence:\{ frequency, durationMonths, seriesId, sequence, count:dates\.length \}/);
});
