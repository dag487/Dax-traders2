// deriv-connector/next-integration/client.js
// Small browser client for the Deriv connector.

const getBase = () => {
  const b = (typeof window !== 'undefined' && window.__DERIV_CONNECTOR_BASE) || process.env.NEXT_PUBLIC_DERIV_CONNECTOR_BASE || '';
  return b.replace(/\/$/, '');
};

export function createEventSource(onMessage, onOpen, onError) {
  const base = getBase();
  const url = base + '/stream';
  const es = new EventSource(url);
  es.onopen = (e) => onOpen && onOpen(e);
  es.onmessage = (e) => {
    let data = e.data;
    try { data = JSON.parse(e.data); } catch (_) {}
    onMessage && onMessage(data);
  };
  es.onerror = (e) => onError && onError(e);
  return es;
}

export async function sendToDeriv(payload) {
  const base = getBase();
  const url = base + '/send';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Connector send failed: ${resp.status} ${txt}`);
  }
  return resp.json();
}
