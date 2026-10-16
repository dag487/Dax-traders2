/*
  Deriv web connector with basic security and rate limiting.
*/

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic auth middleware (optional) using BASIC_AUTH_USER and BASIC_AUTH_PASS
function basicAuth(req, res, next) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return next();

  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Authentication required');
  }
  const creds = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const [u, p] = creds.split(':');
  if (u === user && p === pass) return next();

  res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
  return res.status(401).send('Invalid credentials');
}

// Rate limiter
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)), // default 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(basicAuth);

const PORT = process.env.PORT || 3000;
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
