/*
  Simple Deriv websocket connector exposing an HTTP send endpoint and an SSE stream for inbound messages.
*/

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || process.env.PORT || 3000;
const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN || null;

let ws = null;
let sseClients = new Set();
let reconnectTimer = null;

function broadcastToClients(message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  for (const res of sseClients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (err) {
      // ignore write errors
    }
  }
}

function connect() {
  console.log('Connecting to Deriv WS:', DERIV_WS_URL);
  ws = new WebSocket(DERIV_WS_URL);

  ws.on('open', () => {
    console.log('Connected to Deriv');
    if (DERIV_API_TOKEN) {
      const auth = { authorize: DERIV_API_TOKEN };
      ws.send(JSON.stringify(auth));
      console.log('Sent authorize');
    }
  });

  ws.on('message', (msg) => {
    let parsed = null;
    const text = msg.toString();
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = text;
    }
    console.log('Message from Deriv:', parsed);
    broadcastToClients(parsed);
  });

  ws.on('close', () => {
    console.log('Deriv WS closed, scheduling reconnect');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('Deriv WS error:', err && err.message ? err.message : err);
    // ws will emit close after error in many cases; ensure reconnect
    if (ws && ws.readyState !== WebSocket.OPEN) {
      scheduleReconnect();
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

connect();

// POST /send -> forwards body as JSON to Deriv websocket
app.post('/send', (req, res) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'Deriv websocket not connected' });
  }
  const payload = req.body;
  try {
    ws.send(JSON.stringify(payload));
    return res.json({ sent: true, payload });
  } catch (err) {
    console.error('Failed to send', err);
    return res.status(500).json({ error: 'Failed to send to Deriv' });
  }
});

// GET /stream -> Server-Sent Events streaming messages from Deriv
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a comment as a keep-alive
  res.write(': connected\n\n');

  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', wsConnected: ws && ws.readyState === WebSocket.OPEN });
});

app.listen(PORT, () => {
  console.log(`Deriv web connector listening on port ${PORT}`);
});
