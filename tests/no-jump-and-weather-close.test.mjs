import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('choosing an input type or 결제 직후 does not move the cursor to the bottom text box',()=>{
 const modeHandler=html.slice(html.indexOf("$$('.mode-tabs button').forEach"),html.indexOf("$$('#expense-entry-options button').forEach"));
 const entryHandler=html.slice(html.indexOf("$$('#expense-entry-options button').forEach"),html.indexOf('}));',html.indexOf("$$('#expense-entry-options button').forEach"))+4);
 for(const handler of [modeHandler,entryHandler]){
  assert.match(handler,/updateInputGuide\(\);/);
  assert.doesNotMatch(handler,/\.focus\(/);
 }
});
test('weather district picker has ✕ buttons that only close the list',()=>{
 assert.match(html,/<button type="button" class="weather-filter-close" data-weather-filter-close aria-label="구 선택 닫기"[^>]*>✕<\/button>/);
 assert.match(html,/<button type="button" class="weather-filter-done" data-weather-filter-close>✕ 선택 닫기<\/button>/);
 const handler=html.slice(html.indexOf("$$('[data-weather-filter-close]')"),html.indexOf('}));',html.indexOf("$$('[data-weather-filter-close]')")));
 assert.match(handler,/filter\.open = false;/);
 assert.doesNotMatch(handler,/watchedDistricts|saveWeatherDistrictFilter/);
});
