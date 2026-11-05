// 기상청 단기예보 조회서비스(공공데이터포털)에서 서울 25개 구 날씨를 받아 옵니다.
// 인증키는 Vercel 환경변수 KMA_SERVICE_KEY에만 두고 브라우저로 보내지 않습니다.
//   ?part=now   : 초단기실황(지금 실제 기온·강수·습도). 10분 동안 모든 사용자가 같은 결과를 함께 씁니다.
//   ?part=today : 단기예보(오늘 최고·최저, 시간별 강수확률·하늘상태). 30분 동안 함께 씁니다.
// 같은 5km 칸에 있는 구는 한 번만 묻기 때문에 하루 호출은 약 4천 번(개발계정 한도 1만 번)입니다.
const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

export const DISTRICTS = [
  ['종로구',37.5735,126.9790],['중구',37.5641,126.9979],['용산구',37.5326,126.9905],['성동구',37.5633,127.0371],['광진구',37.5385,127.0823],
  ['동대문구',37.5744,127.0396],['중랑구',37.6063,127.0927],['성북구',37.5894,127.0167],['강북구',37.6396,127.0257],['도봉구',37.6688,127.0471],
  ['노원구',37.6542,127.0568],['은평구',37.6027,126.9291],['서대문구',37.5791,126.9368],['마포구',37.5663,126.9014],['양천구',37.5170,126.8666],
  ['강서구',37.5509,126.8495],['구로구',37.4955,126.8877],['금천구',37.4569,126.8955],['영등포구',37.5264,126.8963],['동작구',37.5124,126.9393],
  ['관악구',37.4784,126.9516],['서초구',37.4837,127.0324],['강남구',37.5172,127.0473],['송파구',37.5145,127.1060],['강동구',37.5301,127.1238]
];

// 위도·경도를 기상청 5km 격자 번호(nx, ny)로 바꿉니다(기상청 공개 변환식).
export function toGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5, SLAT1 = 30, SLAT2 = 60, OLON = 126, OLAT = 38, XO = 43, YO = 136, DEG = Math.PI / 180;
  const re = RE / GRID, slat1 = SLAT1 * DEG, slat2 = SLAT2 * DEG, olon = OLON * DEG, olat = OLAT * DEG;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEG * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lon * DEG - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return [Math.floor(ra * Math.sin(theta) + XO + 0.5), Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)];
}

const pad = (n) => String(n).padStart(2, '0');
// 한국 시간 기준 날짜·시각 조각. offsetMinutes만큼 과거로 옮길 수 있습니다.
function kst(now, offsetMinutes = 0) {
  const d = new Date(now + 9 * 3600000 - offsetMinutes * 60000);
  return { date: `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`, hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
// 초단기실황: 매시 정각 자료가 40분쯤 공개되므로 45분이 지나기 전에는 한 시간 전 자료를 씁니다.
export function nowcastBase(now = Date.now()) {
  const t = kst(now, 45);
  return { date: t.date, time: `${pad(t.hour)}00` };
}
// 단기예보: 02·05·08·11·14·17·20·23시 발표, 15분 여유를 둡니다.
export function forecastBase(now = Date.now()) {
  const t = kst(now, 15);
  const hours = [2, 5, 8, 11, 14, 17, 20, 23].filter((h) => h <= t.hour);
  if (hours.length) return { date: t.date, time: `${pad(hours.at(-1))}00` };
  return { date: kst(now, 15 + 24 * 60).date, time: '2300' };
}
// 오늘의 최저·최고 기온이 모두 들어 있는 발표(오늘 02시, 그 전이면 어제 23시).
export function dayBase(now = Date.now()) {
  const t = kst(now, 15);
  if (t.hour >= 2) return { date: t.date, time: '0200' };
  return { date: kst(now, 15 + 24 * 60).date, time: '2300' };
}

function serviceKey(env) {
  const raw = String(env.KMA_SERVICE_KEY || '').trim();
  if (!raw) return '';
  // Encoding 키를 넣었어도 동작하도록 한 번 풀어 줍니다(Decoding 키는 그대로).
  try { return /%[0-9A-F]{2}/i.test(raw) ? decodeURIComponent(raw) : raw; } catch { return raw; }
}

async function ask(operation, params, key, fetcher) {
  const url = new URL(`${BASE}/${operation}`);
  url.search = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '1000', dataType: 'JSON', ...params }).toString();
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  const code = body?.response?.header?.resultCode ?? (text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>|<resultCode>(\d+)<\/resultCode>/)?.slice(1).find(Boolean) || '');
  if (!response.ok || code !== '00') {
    const error = new Error(`KMA ${operation} ${response.status} ${code}`);
    // 30: 등록되지 않은 키, 20·22: 접근 거부·한도 초과 등. 키 설정이나 활용신청을 확인해야 하는 경우입니다.
    error.kind = /SERVICE_KEY|NOT_REGISTERED|^30$|^20$|^31$/.test(code) || /SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ACCESS DENIED|접근|인증키/.test(text) ? 'KEY' : 'UPSTREAM';
    throw error;
  }
  return body.response.body?.items?.item || [];
}

// 같은 칸에 있는 구들을 묶습니다.
function gridGroups() {
  const groups = new Map();
  for (const [name, lat, lon] of DISTRICTS) {
    const [nx, ny] = toGrid(lat, lon);
    const id = `${nx},${ny}`;
    if (!groups.has(id)) groups.set(id, { nx, ny, names: [] });
    groups.get(id).names.push(name);
  }
  return [...groups.values()];
}

async function eachGrid(task, limit = 4) {
  const groups = gridGroups(), results = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < groups.length) {
      const group = groups[next++];
      results.set(group, await task(group));
    }
  }));
  return groups.map((group) => [group, results.get(group)]);
}

const number = (value) => { const n = Number(value); return Number.isFinite(n) ? n : null; };

export async function nowPart(key, fetcher, now = Date.now()) {
  const base = nowcastBase(now);
  const rows = await eachGrid(({ nx, ny }) => ask('getUltraSrtNcst', { base_date: base.date, base_time: base.time, nx: String(nx), ny: String(ny) }, key, fetcher));
  const districts = [];
  for (const [group, items] of rows) {
    const value = (category) => number(items.find((item) => item.category === category)?.obsrValue);
    for (const name of group.names) districts.push({ name, nx: group.nx, ny: group.ny, temp: value('T1H'), rain1h: value('RN1'), pty: value('PTY'), humidity: value('REH') });
  }
  return { base, districts };
}

export async function todayPart(key, fetcher, now = Date.now()) {
  const latest = forecastBase(now), day = dayBase(now), today = kst(now).date;
  const rows = await eachGrid(async ({ nx, ny }) => {
    const grid = { nx: String(nx), ny: String(ny) };
    const fresh = await ask('getVilageFcst', { base_date: latest.date, base_time: latest.time, ...grid }, key, fetcher);
    const early = latest.date === day.date && latest.time === day.time ? fresh : await ask('getVilageFcst', { base_date: day.date, base_time: day.time, ...grid }, key, fetcher);
    return { fresh, early };
  });
  const districts = [];
  for (const [group, { fresh, early }] of rows) {
    const pick = (list, category) => list.find((item) => item.category === category && item.fcstDate === today)?.fcstValue;
    const max = number(pick(fresh, 'TMX') ?? pick(early, 'TMX'));
    const min = number(pick(early, 'TMN') ?? pick(fresh, 'TMN'));
    const hours = new Map();
    // 지난 시간은 이른 발표, 남은 시간은 가장 최근 발표 값을 씁니다.
    for (const list of [early, fresh]) for (const item of list) {
      if (item.fcstDate !== today || !['POP', 'PTY', 'SKY', 'TMP', 'PCP'].includes(item.category)) continue;
      if (!hours.has(item.fcstTime)) hours.set(item.fcstTime, { time: `${item.fcstTime.slice(0, 2)}:${item.fcstTime.slice(2)}` });
      const hour = hours.get(item.fcstTime);
      hour[item.category.toLowerCase()] = item.category === 'PCP' ? item.fcstValue : number(item.fcstValue);
    }
    const list = [...hours.values()].sort((a, b) => a.time.localeCompare(b.time));
    for (const name of group.names) districts.push({ name, nx: group.nx, ny: group.ny, max, min, hours: list });
  }
  return { base: latest, dayBase: day, date: today, districts };
}

export async function handle(request, env = process.env, fetcher = fetch, now = Date.now()) {
  const reply = (status, body, seconds = 0) => Response.json(body, { status, headers: {
    'Cache-Control': seconds ? `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${seconds}` : 'no-store',
    'X-Content-Type-Options': 'nosniff'
  } });
  if (request.method !== 'GET') return reply(405, { ok: false, error: 'GET_REQUIRED' });
  const part = new URL(request.url).searchParams.get('part');
  if (!['now', 'today'].includes(part)) return reply(400, { ok: false, error: 'PART_REQUIRED' });
  const key = serviceKey(env);
  if (!key) return reply(503, { ok: false, error: 'NOT_CONFIGURED' });
  try {
    const data = part === 'now' ? await nowPart(key, fetcher, now) : await todayPart(key, fetcher, now);
    return reply(200, { ok: true, part, source: '기상청', fetchedAt: new Date(now).toISOString(), ...data }, part === 'now' ? 600 : 1800);
  } catch (error) {
    return reply(error.kind === 'KEY' ? 503 : 502, { ok: false, error: error.kind === 'KEY' ? 'KEY_NOT_READY' : 'UPSTREAM_FAILED' });
  }
}

export default { fetch: (request) => handle(request) };
