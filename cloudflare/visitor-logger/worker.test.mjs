import assert from 'node:assert/strict';
import worker from './src/worker.js';

let values;
const env = { DB: { prepare: () => ({ bind: (...next) => ({ run: async () => { values = next; } }) }) } };
const request = new Request('https://logger.test/collect', {
  method: 'POST',
  headers: { Origin: 'https://kang-jay.github.io', 'CF-Connecting-IP': '203.0.113.7' },
  body: JSON.stringify({ page: '/index.html', visitorId: '123e4567-e89b-12d3-a456-426614174000' }),
});
Object.defineProperty(request, 'cf', { value: { country: 'CN', region: 'Beijing', city: 'Beijing' } });
const pending = [];

assert.equal((await worker.fetch(request, env, { waitUntil: (promise) => pending.push(promise) })).status, 204);
await Promise.all(pending);
assert.deepEqual(values.slice(1), ['/index.html', '203.0.113.7', 'CN', 'Beijing', 'Beijing', '123e4567-e89b-12d3-a456-426614174000']);
