# REQ: web-relay-ui-server-move

- Story slug: `web-relay-ui-server-move`
- Created: `2026-05-11`
- Status: Implemented

## Summary

Add a React + Vite web UI that connects to the relay server for supervising long-running `agent-cli --remote` sessions, and move relay server source files under the `server/` folder.

## Requirements

1. Relay server entrypoint must move from `bin/relay-server.js` to `server/bin/relay-server.js`.
2. Relay server implementation must move from `lib/relay-server.js` to `server/lib/relay-server.js`.
3. Existing CLI remote mode behavior must continue to work after the move.
4. Existing test and package script wiring must be updated to the new relay paths.
5. A web app must be added under `web/` using React + Vite.
6. The web app must pair using the `Client connection URL` printed by `agent-cli --remote`.
7. The web app must read relay events and notifications for the paired session.
8. The web app must send remote commands for user messages, approvals, cancel/resume, and disconnect.
9. Relay server HTTP responses must be browser-accessible so the web app can connect from a Vite dev origin.

## Non-Goals

1. Moving CLI core runtime files out of `lib/` is not required.
2. Production auth hardening for public relay deployment is not required.
3. Replacing the current local CLI interface is not required.

## Acceptance Criteria

1. `npm run relay-server` starts the relay from `server/bin/relay-server.js`.
2. Unit tests referencing relay internals pass with imports pointing at `server/lib/relay-server.js`.
3. `npm run web:dev` serves a React UI from `web/`.
4. Given a valid client connection URL, the UI pairs and receives relay events.
5. Given a paired session, the UI can send remote command payloads accepted by relay APIs.
6. Browser requests from web dev origin succeed against relay APIs without CORS failures.
