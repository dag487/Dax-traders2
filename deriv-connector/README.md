# Deriv Web Connector

This simple Node.js connector proxies messages to/from the Deriv WebSocket API and exposes:

- HTTP POST /send — send arbitrary JSON to Deriv
- GET /stream — Server-Sent Events (SSE) stream of messages from Deriv

Usage

1. Copy `.env.example` to `.env` and set DERIV_WS_URL or DERIV_API_TOKEN as needed.
2. npm install
3. npm start

Notes

- If you provide DERIV_API_TOKEN the connector will send an `authorize` message after connecting.
- The default public endpoint uses app_id 1089 for unauthenticated requests.
