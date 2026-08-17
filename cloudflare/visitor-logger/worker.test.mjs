import assert from 'node:assert/strict';
import worker from './src/worker.js';

const writes = [];
const env = { DB: { prepare: () => ({ bind: (...values) => ({ run: async () => { writes.push(values); } }) }) } };

async function collect(eventType) {
  const request = new Request('https://logger.test/collect', {
    method: 'POST',
    headers: { Origin: 'https://kang-jay.github.io', 'CF-Connecting-IP': '203.0.113.7' },
    body: JSON.stringify({ eventType, page: '/index.html', visitorId: '123e4567-e89b-12d3-a456-426614174000' }),
  });
  Object.defineProperty(request, 'cf', { value: { country: 'CN', region: 'Beijing', city: 'Beijing' } });
  const pending = [];
  assert.equal((await worker.fetch(request, env, { waitUntil: (promise) => pending.push(promise) })).status, 204);
  await Promise.all(pending);
}

await collect();
await collect('portfolio_download');
assert.deepEqual(writes.map((values) => values.slice(1)), [
  ['/index.html', '203.0.113.7', 'CN', 'Beijing', 'Beijing', '123e4567-e89b-12d3-a456-426614174000', 'page_view'],
  ['/index.html', '203.0.113.7', 'CN', 'Beijing', 'Beijing', '123e4567-e89b-12d3-a456-426614174000', 'portfolio_download'],
]);
