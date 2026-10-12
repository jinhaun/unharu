import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('frequent district filter is multi-select and persisted locally',()=>{
  assert.match(html,/자주 보는 구 선택/);
  assert.match(html,/id="rain-district-filter"/);
  assert.match(html,/id="weather-filter-all"/);
  assert.match(html,/id="weather-filter-none"/);
  assert.match(html,/dayflow-seoul-weather-filter-v1/);
  assert.match(html,/watchedDistricts\.includes\(district\.name\)/);
});
test('weather filter does not change the 25-district fetch scope',()=>{
  assert.match(html,/results\.length !== SEOUL_DISTRICTS\.length/);
  assert.match(html,/서울 25개 구의 오늘 날씨/);
  assert.doesNotMatch(html,/latitude=\$\{watchedDistricts/);
});
