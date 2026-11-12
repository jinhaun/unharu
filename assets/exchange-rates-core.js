(function(root){
  'use strict';
  const currencies = [
    ['USD','미국 달러',1,'달러'],['JPY','일본 엔',100,'엔'],['EUR','유로',1,'유로'],
    ['CNY','중국 위안',1,'위안'],['GBP','영국 파운드',1,'파운드'],['CHF','스위스 프랑',1,'프랑'],
    ['CAD','캐나다 달러',1,'달러'],['AUD','호주 달러',1,'달러'],['HKD','홍콩 달러',1,'달러'],
    ['SGD','싱가포르 달러',1,'달러'],['THB','태국 밧',1,'밧'],['TWD','대만 달러',1,'달러'],['VND','베트남 동',1000,'동']
  ].map(([code,name,unit,label])=>Object.freeze({code,name,unit,label}));
  const defaults = ['USD','JPY','EUR'];
  function selection(value) {
    if (!Array.isArray(value)) return [...defaults];
    return currencies.filter(c=>value.includes(c.code)).map(c=>c.code);
  }
  function validRate(row, currency) {
    const stamp = Date.parse(`${row?.date}T00:00:00Z`);
    return !!row && row.code === currency.code && row.unit === currency.unit && typeof row.krw === 'number' && Number.isFinite(row.krw) && row.krw > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === row.date;
  }
  root.UNHARU_EXCHANGE_CORE = Object.freeze({currencies:Object.freeze(currencies),selection,validRate});
})(globalThis);
