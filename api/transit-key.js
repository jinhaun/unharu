// The URI key is intentionally delivered only to the verified owner browser.
// ODsay calls originate there, with the real registered domain's Referer.
const ORIGIN = 'https://unharu.vercel.app';
const AUTH_URL = 'https://azjtaqynzrpcgolxwluy.supabase.co/auth/v1/user';
const PUBLISHABLE_KEY = 'sb_publishable_A4yG-YAdkvFW7g4S3Nzzvg_KTKM7DaC';

export async function authorize(request, env = process.env, fetcher = fetch) {
  const reply = (status, body) => Response.json(body, {status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
    'Vary': 'Authorization, Origin', 'X-Content-Type-Options': 'nosniff'
  }});
  if (request.method !== 'POST') return reply(405, {error:'POST_REQUIRED'});
  if (request.headers.get('origin') !== ORIGIN) return reply(403, {error:'ORIGIN_DENIED'});
  const token = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(token) || token.length > 12000) return reply(401, {error:'LOGIN_REQUIRED'});
  if (!env.ODSAY_API_KEY?.trim() || !env.ODSAY_ALLOWED_EMAIL?.trim()) return reply(503, {error:'NOT_CONFIGURED'});
  try {
    const upstream = await fetcher(AUTH_URL, {
      headers:{apikey:PUBLISHABLE_KEY, Authorization:token},
      signal:AbortSignal.timeout(8000), redirect:'error', cache:'no-store'
    });
    if (!upstream.ok) return reply(upstream.status >= 500 || upstream.status === 429 ? 503 : 401, {error:'AUTH_UNAVAILABLE_OR_EXPIRED'});
    const user = await upstream.json();
    if (!user.id || !user.email_confirmed_at || user.is_anonymous ||
        String(user.email || '').toLowerCase() !== env.ODSAY_ALLOWED_EMAIL.trim().toLowerCase()) {
      return reply(403, {error:'OWNER_ONLY'});
    }
    return reply(200, {apiKey:env.ODSAY_API_KEY.trim()});
  } catch {
    return reply(503, {error:'AUTH_UNAVAILABLE'});
  }
}

export default {fetch:request => authorize(request)};
