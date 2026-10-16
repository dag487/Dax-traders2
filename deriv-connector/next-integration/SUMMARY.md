I've added a small Next.js integration client under deriv-connector/next-integration with:

- client.js — createEventSource() and sendToDeriv()
- useDeriv.js — React hook to manage SSE and send
- DerivWidget.jsx — example component to drop into your app
- README.md — integration instructions

What I changed and next steps:
1. Copy the 3 files into your Next.js project (e.g., app/components/ or components/).
2. Set NEXT_PUBLIC_DERIV_CONNECTOR_BASE in your Next env to the connector URL (e.g., http://localhost:3000) or leave empty for same-origin.
3. Import and place <DerivWidget /> into a page or component in your app.

If you want, I can:
- Automatically extract the `dax-trade-deriv-vercel.zip` Next app in this repo and add the DerivWidget directly into it and commit the changes, or
- Create a PR with the integration changes applied to the Next app after extracting it here.

Which would you prefer?