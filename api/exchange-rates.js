// 공개 기준 환율만 조회합니다. 사용자 정보와 인증키를 보내지 않습니다.
export const CURRENCIES = ['USD','JPY','EUR','CNY','GBP','CHF','CAD','AUD','HKD','SGD','THB','TWD','VND'];
export function normalizeRates(rows, now = Date.now()) {
  if (!Array.isArray(rows)) throw new Error('INVALID_RATES');
  const rates = [];
  for (const code of CURRENCIES) {
    const row = rows.find(r => r?.base === 'KRW' && r.quote === code);
    const stamp = Date.parse(`${row?.date}T00:00:00Z`);
    if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== row.date || stamp > now + 86400000 || typeof row.rate !== 'number' || !Number.isFinite(row.rate) || row.rate <= 0) continue;
    const unit = code === 'JPY' ? 100 : code === 'VND' ? 1000 : 1;
    const krw = unit / row.rate;
    if (Number.isFinite(krw)) rates.push({code, unit, krw, date:row.date});
  }
  if (!rates.length) throw new Error('EMPTY_RATES');
  return rates;
}
export async function handle(request, fetcher = fetch, now = Date.now()) {
  const reply = (status, body) => Response.json(body, {status, headers:{
    'Cache-Control':status === 200 ? 'public, max-age=60, s-maxage=3600, stale-while-revalidate=600' : 'no-store',
    'X-Content-Type-Options':'nosniff', ...(status === 405 ? {Allow:'GET'} : {})
  }});
  if (request.method !== 'GET') return reply(405, {ok:false,error:'GET_REQUIRED'});
  try {
    const response = await fetcher(`https://api.frankfurter.dev/v2/rates?base=KRW&quotes=${CURRENCIES.join(',')}`, {
      signal:AbortSignal.timeout(8000), redirect:'error', headers:{Accept:'application/json'}
    });
    if (!response.ok) throw new Error('UPSTREAM_FAILED');
    const rates = normalizeRates(await response.json(), now);
    return reply(200, {ok:true, source:'Frankfurter', fetchedAt:new Date(now).toISOString(), rates});
  } catch {
    return reply(502, {ok:false,error:'RATES_UNAVAILABLE'});
  }
}
export default {fetch:request => handle(request)};
