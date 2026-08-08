const endpoint = 'https://kangjay-site-api.pages.dev/collect';
const storageKey = 'kangjay_visitor_id';
let visitorId = crypto.randomUUID();

try {
  visitorId = localStorage.getItem(storageKey) || visitorId;
  localStorage.setItem(storageKey, visitorId);
} catch {}

fetch(endpoint, {
  method: 'POST',
  mode: 'cors',
  keepalive: true,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ page: location.pathname, visitorId }),
}).catch(() => {});
