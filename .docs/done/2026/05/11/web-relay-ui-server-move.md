# DD: web-relay-ui-server-move

- Story slug: `web-relay-ui-server-move`
- Date: `2026-05-11`
- Status: Completed

## Delivered

1. Moved relay server files:
   - `bin/relay-server.js` -> `server/bin/relay-server.js`
   - `lib/relay-server.js` -> `server/lib/relay-server.js`
2. Updated package wiring:
   - package `bin` path for `agent-cli-relay`
   - syntax script and relay run script paths
   - added `web:*` scripts
3. Updated unit test import for relay server path move.
4. Added browser CORS and preflight support to relay server, including SSE response CORS header.
5. Added a new React + Vite web app under `web/` with:
   - pair from CLI client connection URL
   - event stream reading and backlog display
   - remote command sending (`user_message`, `approval_decision`, `cancel`, `resume`)
   - session disconnect/revoke action
   - notification polling
6. Added production static hosting support so the relay can serve the compiled React app from `bin/public`.
7. Fixed SPA routing so API routes remain authoritative and non-API routes fall back to `index.html`.
8. Added relay server host/static-dir flags and a `relay-server:prod` helper script.
9. Updated README with relay + web startup instructions and production static hosting guidance.
10. Added RPD docs for REQ/AP/E2E for this story.

## Verification

1. `npm run test:syntax`
2. `npm run test:unit`
3. `npm --prefix ./web run build`
4. `npm test`

All commands passed.
