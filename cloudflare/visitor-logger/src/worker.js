const SITE_ORIGIN = 'https://kang-jay.github.io';

const cors = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/collect') return new Response('Not found', { status: 404 });
    if (request.headers.get('Origin') !== SITE_ORIGIN) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload.page !== 'string') return new Response('Bad request', { status: 400, headers: cors });

    const cf = request.cf || {};
    await env.DB.prepare(`
      INSERT INTO visits (visited_at, page, ip, country, region, city)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      new Date().toISOString(),
      payload.page.slice(0, 500),
      request.headers.get('CF-Connecting-IP') || '',
      cf.country || '',
      cf.region || '',
      cf.city || ''
    ).run();

    return new Response(null, { status: 204, headers: cors });
  },

  async scheduled(_event, env) {
    await env.DB.prepare("DELETE FROM visits WHERE datetime(visited_at) < datetime('now', '-30 days')").run();
  },
};
