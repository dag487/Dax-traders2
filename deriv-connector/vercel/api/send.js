// Vercel serverless API route to send a single message to Deriv and return the first response.
// Note: Serverless functions cannot maintain long-lived connections for streaming. This endpoint
// is intended for single-request/response patterns (e.g., placing a trade and getting the immediate response).

const WebSocket = require('ws');

const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN || null;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload = req.body;
  if (!payload) {
    res.status(400).json({ error: 'Missing JSON body' });
    return;
  }

  let ws;
  try {
    ws = new WebSocket(DERIV_WS_URL);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create websocket', detail: err.message });
    return;
  }

  const timeoutMs = 5000;
  let responded = false;

  const cleanup = () => {
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.close(); } catch (e) {}
  };

  const timer = setTimeout(() => {
    if (!responded) {
      responded = true;
      cleanup();
      res.status(504).json({ error: 'Timeout waiting for Deriv response' });
    }
  }, timeoutMs);

  ws.on('open', () => {
    if (DERIV_API_TOKEN) {
      ws.send(JSON.stringify({ authorize: DERIV_API_TOKEN }));
    }
    ws.send(JSON.stringify(payload));
  });

  ws.on('message', (msg) => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    let parsed = null;
    try { parsed = JSON.parse(msg.toString()); } catch (e) { parsed = msg.toString(); }
    cleanup();
    res.status(200).json({ response: parsed });
  });

  ws.on('error', (err) => {
    if (responded) return;
    responded = true;
    clearTimeout(timer);
    cleanup();
    res.status(500).json({ error: 'Websocket error', detail: err && err.message ? err.message : String(err) });
  });
};
