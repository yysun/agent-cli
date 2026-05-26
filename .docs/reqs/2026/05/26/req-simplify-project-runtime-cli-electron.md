# REQ: simplify-project-runtime-cli-electron

## Problem

The repository has drifted into four product surfaces: local `agent-cli`, `agent-world-cli`, a relay server, and a Vite web client. That is too much surface area for the current direction. The result is a package that publishes binaries and scripts for products that should no longer exist, with tests and docs reinforcing the old shape.

The new shape is narrower: keep the agent runtime, durable storage, the `agent-cli` executable, and the Electron app. Delete the relay/web/Agent World shell surfaces instead of leaving half-supported entrypoints around.

## Requirements

- Remove the relay server source and public package binary.
- Remove the standalone web app source, scripts, and typecheck/build hooks.
- Remove the `agent-world-cli` binary, source entrypoint, package script, and direct tests.
- Remove `agent-cli --remote` behavior because it depends on the relay/web product boundary being deleted.
- Keep core runtime and storage modules that are still needed by `agent-cli`, tests, or the Electron app.
- Keep `agent-cli` buildable and runnable as the sole published CLI binary.
- Keep the Electron app buildable.
- Update tests and docs so they describe the simplified project, not the deleted surfaces.

## Acceptance

- `package.json` publishes only `agent-cli` as a CLI binary.
- `npm run build` does not build server, web, or `agent-world-cli` artifacts.
- `npm run test:syntax` does not check deleted binaries or deleted test files.
- No source imports deleted relay server, web app, or `agent-world-cli` entrypoints.
- README no longer presents relay server, web UI, remote host, or `agent-world-cli` workflows as current features.
- Targeted validation for the kept CLI/core/Electron surfaces passes, or any remaining failure is reported with the concrete blocker.

## Non-Goals

- Do not redesign `.agent-world` storage.
- Do not remove local world/runtime/storage internals that `agent-cli` still needs.
- Do not port web UI behavior into Electron in this change.
- Do not add replacement remote hosting or browser pairing.
