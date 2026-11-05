import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {handle, toGrid, nowcastBase, forecastBase, dayBase, DISTRICTS} from '../api/kma-weather.js';

const at=(kstText)=>Date.parse(kstText+'+09:00');
const ok=(items)=>new Response(JSON.stringify({response:{header:{resultCode:'00',resultMsg:'NORMAL_SERVICE'},body:{items:{item:items}}}}));

test('districts are converted to the official KMA 5km grid (종로구 = 서울 60,127)',()=>{
 assert.deepEqual(toGrid(37.5735,126.9790),[60,127]);
 assert.equal(DISTRICTS.length,25);
 assert.equal(new Set(DISTRICTS.map(([,a,o])=>toGrid(a,o).join(','))).size,16);
});
test('the latest published data is requested, with a safety margin after each release',()=>{
 assert.deepEqual(nowcastBase(at('2026-11-05T15:30')),{date:'20261105',time:'1400'}); // 15시 자료는 아직 공개 전
 assert.deepEqual(nowcastBase(at('2026-11-05T15:50')),{date:'20261105',time:'1500'});
 assert.deepEqual(nowcastBase(at('2026-11-05T00:20')),{date:'20261104',time:'2300'});
 assert.deepEqual(forecastBase(at('2026-11-05T14:20')),{date:'20261105',time:'1400'});
 assert.deepEqual(forecastBase(at('2026-11-05T14:10')),{date:'20261105',time:'1100'});
 assert.deepEqual(forecastBase(at('2026-11-05T01:00')),{date:'20261104',time:'2300'});
 assert.deepEqual(dayBase(at('2026-11-05T15:00')),{date:'20261105',time:'0200'});
 assert.deepEqual(dayBase(at('2026-11-05T01:00')),{date:'20261104',time:'2300'});
});
test('without a key the server says it is not set up, and never calls KMA',async()=>{
 let calls=0;
 const reply=await handle(new Request('https://unharu.vercel.app/api/kma-weather?part=now'),{},async()=>{calls++;return ok([]);});
 assert.equal(reply.status,503);assert.equal((await reply.json()).error,'NOT_CONFIGURED');assert.equal(calls,0);
});
test('now: one question per grid, the key stays on the server, and each district gets its grid values',async()=>{
 const urls=[];
 const fetcher=async(url)=>{urls.push(String(url));const ny=new URL(url).searchParams.get('ny');
  return ok([{category:'T1H',obsrValue:ny==='127'?'18.7':'17.0'},{category:'RN1',obsrValue:'0'},{category:'PTY',obsrValue:'0'},{category:'REH',obsrValue:'37'}]);};
 const reply=await handle(new Request('https://x/api/kma-weather?part=now'),{KMA_SERVICE_KEY:' secret+key/== '},fetcher,at('2026-11-05T15:50'));
 const body=await reply.json();
 assert.equal(reply.status,200);assert.equal(urls.length,16);
 assert.match(reply.headers.get('cache-control'),/s-maxage=600/);
 assert.ok(urls.every(u=>new URL(u).searchParams.get('serviceKey')==='secret+key/=='));
 assert.ok(!JSON.stringify(body).includes('secret'));
 assert.equal(body.districts.find(d=>d.name==='종로구').temp,18.7);
 assert.equal(body.districts.length,25);
 assert.deepEqual(body.base,{date:'20261105',time:'1500'});
});
test('an Encoding-form key also works',async()=>{
 const seen=[];
 await handle(new Request('https://x/api/kma-weather?part=now'),{KMA_SERVICE_KEY:'abc%2Bdef%3D%3D'},async(url)=>{seen.push(new URL(url).searchParams.get('serviceKey'));return ok([]);},at('2026-11-05T15:50'));
 assert.equal(seen[0],'abc+def==');
});
test('today: max from the latest release, min from the 02시 release, hourly values for today only',async()=>{
 const fetcher=async(url)=>{const time=new URL(url).searchParams.get('base_time');
  const fresh=[{category:'TMX',fcstDate:'20261105',fcstTime:'1500',fcstValue:'19.0'},{category:'POP',fcstDate:'20261105',fcstTime:'1600',fcstValue:'10'},{category:'SKY',fcstDate:'20261105',fcstTime:'1600',fcstValue:'1'},{category:'PTY',fcstDate:'20261105',fcstTime:'1600',fcstValue:'0'},{category:'POP',fcstDate:'20261106',fcstTime:'0000',fcstValue:'90'}];
  const early=[{category:'TMN',fcstDate:'20261105',fcstTime:'0600',fcstValue:'9.0'},{category:'POP',fcstDate:'20261105',fcstTime:'0900',fcstValue:'90'},{category:'POP',fcstDate:'20261105',fcstTime:'1600',fcstValue:'60'}];
  return ok(time==='0200'?early:fresh);};
 const body=await (await handle(new Request('https://x/api/kma-weather?part=today'),{KMA_SERVICE_KEY:'k'},fetcher,at('2026-11-05T15:30'))).json();
 const jongno=body.districts.find(d=>d.name==='종로구');
 assert.equal(jongno.max,19);assert.equal(jongno.min,9);
 assert.deepEqual(jongno.hours.map(h=>[h.time,h.pop]),[['09:00',90],['16:00',10]]); // 16시는 최신 발표(10%)가 이김, 내일 0시는 제외
});
test('a key that is not registered for this service is reported as such and is not cached',async()=>{
 const xml='<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
 const reply=await handle(new Request('https://x/api/kma-weather?part=now'),{KMA_SERVICE_KEY:'k'},async()=>new Response(xml),at('2026-11-05T15:50'));
 assert.equal(reply.status,503);assert.equal((await reply.json()).error,'KEY_NOT_READY');assert.equal(reply.headers.get('cache-control'),'no-store');
});

test('rain is shown only from now on, and only at 30% or more (past morning rain is ignored)',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ctx={pad:v=>String(v).padStart(2,'0')};
 vm.runInNewContext(html.slice(html.indexOf('const RAIN_PROBABILITY_MIN'),html.indexOf('function renderRainDistricts(')),ctx);
 vm.runInContext('this.RAIN=RAIN_PROBABILITY_MIN;this.chip=rainChipFor;this.forDistrict=rainForecastForDistrict;',ctx);
 const now=at('2026-11-05T15:30');
 const hours=['09','12','15','16','18','21'].map(h=>`2026-11-05T${h}:00`);
 const data={hourly:{time:hours,precipitation_probability:[90,80,20,10,35,40],precipitation:[2,1,0,0,0,0]}};
 assert.equal(ctx.RAIN,30);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.forDistrict(data,'종로구',now))),{name:'종로구',maxProbability:40,time:'18:00~21:00'});
 assert.equal(ctx.forDistrict({hourly:{time:hours,precipitation_probability:[90,80,20,10,5,1],precipitation:[2,1,0,0,0,0]}},'종로구',now),null);
});
test('the page tries KMA first and keeps Open-Meteo only as a fallback',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const load=html.slice(html.indexOf('async function loadSeoulWeather('));
 assert.ok(load.indexOf('await loadKmaWeather()')<load.indexOf('api.open-meteo.com'));
 assert.match(html,/fetch\(`\/api\/kma-weather\?part=\$\{part\}`/);
 assert.match(html,/기상청 서울\(종로\) 기준/);
});
