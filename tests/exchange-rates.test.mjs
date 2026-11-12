import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {handle, normalizeRates, CURRENCIES} from '../api/exchange-rates.js';
const coreContext=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../assets/exchange-rates-core.js',import.meta.url),'utf8'),coreContext);
const core=coreContext.UNHARU_EXCHANGE_CORE;
const now=Date.parse('2026-11-12T08:00:00Z');
const rows=[{base:'KRW',quote:'USD',rate:1/1350,date:'2026-11-12'},{base:'KRW',quote:'JPY',rate:1/9,date:'2026-11-11'},{base:'KRW',quote:'VND',rate:20,date:'2026-11-12'}];
const request=(method='GET')=>new Request('https://example.com/api/exchange-rates',{method});

test('inverts KRW quotes, uses 100 yen / 1000 dong, and preserves each reference date',()=>{
 const data=normalizeRates(rows,now);
 assert.deepEqual(data,[{code:'USD',unit:1,krw:1350,date:'2026-11-12'},{code:'JPY',unit:100,krw:900,date:'2026-11-11'},{code:'VND',unit:1000,krw:50,date:'2026-11-12'}]);
});
test('invalid dates, future dates, wrong base, non-numeric/zero/negative/infinite rates are excluded',()=>{
 for(const patch of [{date:'2026-02-30'},{date:'2030-01-01'},{base:'EUR'},{rate:0},{rate:-1},{rate:Infinity},{rate:'0.1'},{quote:'XYZ'}])assert.throws(()=>normalizeRates([{...rows[0],...patch}],now));
 assert.throws(()=>normalizeRates({rates:[]},now));
 assert.equal(normalizeRates([...rows,{base:'KRW',quote:'XYZ',rate:3,date:'2026-11-12'}],now).length,3);
});
test('API queries fixed anonymous source, returns cacheable public rates and handles partial coverage',async()=>{
 const result=await handle(request(),async(url,options)=>{
  assert.equal(new URL(url).origin,'https://api.frankfurter.dev');assert.equal(new URL(url).searchParams.get('base'),'KRW');
  assert.equal(new URL(url).searchParams.get('quotes'),CURRENCIES.join(','));assert.equal(options.redirect,'error');assert.ok(options.signal);
  return Response.json(rows);
 },now);
 assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/s-maxage=3600/);
 const body=await result.json();assert.equal(body.rates.length,3);assert.equal(body.source,'Frankfurter');assert.equal(body.fetchedAt,new Date(now).toISOString());
});
test('source failure, timeout, malformed or empty reply never returns fake success or provider secrets',async()=>{
 for(const fetcher of [async()=>{throw Error('private-debug');},async()=>new Response('bad',{status:429}),async()=>new Response('invalid'),async()=>Response.json([])]){
  const result=await handle(request(),fetcher,now);assert.equal(result.status,502);assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await result.json(),{ok:false,error:'RATES_UNAVAILABLE'});
 }
});
test('rejects writes without making an upstream request',async()=>{
 let calls=0;const result=await handle(request('POST'),async()=>{calls++;},now);assert.equal(result.status,405);assert.equal(result.headers.get('allow'),'GET');assert.equal(calls,0);
});
test('settings sanitize unknown values, deduplicate and retain an intentional empty selection',()=>{
 assert.deepEqual(Array.from(core.selection(null)),['USD','JPY','EUR']);assert.deepEqual(Array.from(core.selection([])),[]);
 assert.deepEqual(Array.from(core.selection(['JPY','JPY','bad','USD'])),['USD','JPY']);
 assert.deepEqual(Array.from(core.selection({JPY:true})),['USD','JPY','EUR']);
});
test('client rejects corrupt or mismatched money units and keeps tiny currency quotes',()=>{
 const yen=core.currencies.find(c=>c.code==='JPY');
 assert.equal(core.validRate({code:'JPY',unit:100,krw:900,date:'2026-11-12'},yen),true);
 for(const patch of [{unit:1},{krw:null},{krw:NaN},{date:'2026-11-31'},{code:'USD'}])assert.equal(core.validRate({code:'JPY',unit:100,krw:900,date:'2026-11-12',...patch},yen),false);
});
