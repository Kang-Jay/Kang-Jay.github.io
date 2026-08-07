const endpoint = 'https://kangjay-visitor-logger.visitor-logger.workers.dev/collect';

fetch(endpoint, {
  method: 'POST',
  mode: 'cors',
  keepalive: true,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ page: location.pathname }),
}).catch(() => {});
