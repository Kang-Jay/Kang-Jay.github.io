const endpoint = 'https://kangjay-site-api.pages.dev/collect';
const storageKey = 'kangjay_visitor_id';
let visitorId = crypto.randomUUID();

try {
  visitorId = localStorage.getItem(storageKey) || visitorId;
  localStorage.setItem(storageKey, visitorId);
} catch {}

function record(eventType, useBeacon = false) {
  const body = JSON.stringify({ eventType, page: location.pathname, visitorId });
  if (useBeacon && navigator.sendBeacon?.(endpoint, body)) return;

  fetch(endpoint, {
    method: 'POST',
    mode: 'cors',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {});
}

record('page_view');

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element
    ? event.target.closest('a[href*="/Kang-Jiayue-Portfolio.pdf"]')
    : null;
  if (link) record('portfolio_download', true);
}, true);
