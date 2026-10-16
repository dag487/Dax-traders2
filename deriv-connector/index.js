/*
  Deriv web connector with improved robustness, security, and rate limiting.
*/

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const http = require('http');

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

  // decode safely and parse first ':' only
  let creds;
  try {
    creds = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
  } catch (err) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Invalid authorization header');
  }
  const idx = creds.indexOf(':');
  if (idx === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
    return res.status(401).send('Invalid authorization format');
  }
  const u = creds.slice(0, idx);
  const p = creds.slice(idx + 1);

  // simple compare (avoid logging credentials)
  if (u === user && p === pass) return next();

  res.setHeader('WWW-Authenticate', 'Basic realm="Restricted"');
  return res.status(401).send('Invalid credentials');
}

// Rate limiter (apply per-route)
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // default 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
});

const PORT = process.env.PORT || 3000;
const DERIV_WS_URL = process.env.DERIV_WS_URL || 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN || null;

let ws = null;
let sseClients = new Set();
let reconnectTimer = null;

// Helper to safely write SSE; if it fails, remove client.
function safeSSEWrite(res, data) {
  try {
    if (res.writableEnded || !res.writable) {
      return false;
    }
    res.write(`data: ${data}\n\n`);
    return true;
  } catch (err) {
    return false;
  }
}

function broadcastToClients(message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  for (const res of Array.from(sseClients)) {
    const ok = safeSSEWrite(res, data);
    if (!ok) {
      try { res.end(); } catch (e) {}
      sseClients.delete(res);
    }
  }
}

function cleanupWebSocket(socket) {
  try {
    socket.removeAllListeners && socket.removeAllListeners();
    socket.terminate && socket.terminate();
    socket.close && socket.close();
  } catch (_) {}
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

function connect() {
  console.log('Connecting to Deriv WS:', DERIV_WS_URL);
  // Clean previous socket if any
  if (ws) {
    cleanupWebSocket(ws);
    ws = null;
  }

  ws = new WebSocket(DERIV_WS_URL);

  ws.on('open', () => {
    console.log('Connected to Deriv');
    if (DERIV_API_TOKEN) {
      // send authorize as an object; do not log token
      const authObj = { authorize: DERIV_API_TOKEN };
      try {
        ws.send(JSON.stringify(authObj));
        console.log('Sent authorize (token not shown)');
      } catch (err) {
        console.error('Failed to send authorize:', err && err.message ? err.message : err);
      }
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
    // Minimal logging to avoid sensitive data
    console.log('Message from Deriv received');
    broadcastToClients(parsed);
  });

  ws.on('close', (code, reason) => {
    console.warn('Deriv WS closed, scheduling reconnect', code, reason && reason.toString ? reason.toString() : reason);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('Deriv WS error:', err && err.message ? err.message : err);
    // Ensure socket is cleaned and reconnect scheduled
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      try { cleanupWebSocket(ws); } catch (_) {}
      scheduleReconnect();
    }
  });
}

connect();

// POST /send -> forwards body as JSON to Deriv websocket
app.post('/send', apiLimiter, basicAuth, (req, res) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'Deriv websocket not connected' });
  }
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'JSON body required' });
  }

  try {
    const str = JSON.stringify(payload);
    ws.send(str, (err) => {
      if (err) {
        console.error('Failed to send to Deriv:', err && err.message ? err.message : err);
        return res.status(500).json({ error: 'Failed to send to Deriv' });
      }
      return res.json({ sent: true, payload });
    });
  } catch (err) {
    console.error('Failed to send', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to send to Deriv' });
  }
});

// GET /stream -> Server-Sent Events streaming messages from Deriv
app.get('/stream', basicAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Node/Express may not have flushHeaders on all versions; guard it
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // Send a comment as a keep-alive
  try { res.write(': connected\n\n'); } catch (_) {}

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
    try { res.end(); } catch (_) {}
  });
});

// Health (apply limiter optionally)
app.get('/health', apiLimiter, (req, res) => {
  res.json({ status: 'ok', wsConnected: ws && ws.readyState === WebSocket.OPEN });
});

// Create HTTP server so we can close it later
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Deriv web connector listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      cleanupWebSocket(ws);
      ws = null;
    }
    for (const res of Array.from(sseClients)) {
      try { res.end(); } catch (_) {}
      sseClients.delete(res);
    }
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
    // In case server doesn't close in time
    setTimeout(() => process.exit(0), 5000);
  } catch (err) {
    console.error('Error during shutdown:', err && err.message ? err.message : err);
    process.exit(1);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
