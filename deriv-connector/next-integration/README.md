Client library to connect to the Deriv connector from a Next.js front-end.

Usage:
- Set NEXT_PUBLIC_DERIV_CONNECTOR_BASE to the connector base URL (e.g. http://localhost:3000) in your Next .env or Vercel env.
- Copy `client.js`, `useDeriv.js`, and `DerivWidget.jsx` into your Next app (for example under `app/components/` or `components/`).

Notes:
- The SSE stream uses the path `${base}/stream`.
- The send uses POST `${base}/send`.
- For same-origin deployments you can set the base to an empty string and use relative `/stream` and `/send`.
