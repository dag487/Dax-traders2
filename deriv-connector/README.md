Updated README: added Dockerfile, serverless notes, frontend demo, and security guidance.

Usage additions:
- Build with Docker: docker build -t deriv-connector deriv-connector/ && docker run -p 3000:3000 --env-file deriv-connector/.env deriv-connector
- Vercel: deploy `deriv-connector/vercel` as a Serverless Function. Note: streaming /stream cannot work on serverless; use the long-lived Node server in this repo for that feature.
- Frontend: open deriv-connector/frontend/index.html while the connector is running and visit http://localhost:3000

Security notes:
- Enable BASIC_AUTH_USER and BASIC_AUTH_PASS in .env to require basic auth for HTTP endpoints.
- RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS provide simple rate limiting.
