# DD: codebase-structure-cleanup

- Story slug: `codebase-structure-cleanup`
- Completed: `2026-05-14`
- Status: Done

## Outcome

Cleaned up the repo layout so the active runtime lives in one shared module tree, removed duplicate root-level JavaScript build artifacts, removed the unused legacy CLI JavaScript mirror under `./src/`, and aligned the top-level README with the shipped `.agent-world` storage and runtime configuration behavior.

The shipped structure now centers on:
- `./cli/src/*.ts` bundling to `./bin/agent-cli.js`
- `./core/*.ts` compiling in place to `./core/*.js`
- `./server/src/*.ts` bundling to `./bin/server.js`
- `./web/src/*` bundling to `./bin/public/`
- `.agent-world/` as the durable world, chat, and agent persistence root

## Delivered

1. Build layout cleanup
- Updated `tsconfig.core.json` so shared runtime TypeScript emits back into `./core/` instead of generating duplicate root-level files.
- Removed duplicate root-level runtime modules that were not part of the active CLI execution path.
- Removed the unused legacy `./src/*.js` CLI mirror and aligned the shipped outputs under `./bin/` for the CLI bundle, relay bundle, and built web app.

2. README corrections
- Replaced the old chat-storage description that still pointed at `./.chats/` as the primary durable session root.
- Documented the current `.agent-world/` layout for world, chat, and agent files.
- Corrected runtime precedence so it reflects file-based defaults plus CLI overrides, with `.env` limited to credentials and relay configuration.
- Documented the `.agent-world/remote-host.lock.json` location so remote-host coordination lives inside the same storage root.

3. Validation
- Rebuilt all TypeScript targets after the layout change.
- Verified that the duplicate root-level runtime files were no longer emitted.
- Re-ran focused unit coverage around path resolution, CLI execution, and session-store behavior.

## Verification

Executed on `2026-05-14`:

1. `npm run build:core`
2. `npm run build:ts`
3. `vitest run tests/unit/paths.test.js tests/unit/agent-cli.test.js tests/unit/session-store.test.js`

Observed result:
- Shared runtime rebuild: passed.
- Full TypeScript build: passed.
- Focused unit suite: passed.
- Focused unit coverage in the verified run: 39 tests passed.

## Follow-Up Risks

1. Historical plan and done docs under `./.docs/` still reference earlier `lib/*.js` and pre-migration storage layouts, so contributors may still encounter older implementation terminology when reading archive material.
2. Any external scripts that deep-imported the removed root-level runtime files will need to switch to the canonical `./core/*.js` paths or the supported CLI entrypoints.