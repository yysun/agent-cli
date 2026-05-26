# DD: simplify-project-runtime-cli-electron

## Summary

- Removed the relay server, Vite web app, `agent-world-cli`, and generated artifacts for those deleted surfaces.
- Removed `agent-cli --remote`, relay client/control code, remote host lock storage, and relay `.env` configuration.
- Reduced the package to one published binary: `agent-cli`.
- Kept local runtime/storage, local CLI, and Electron build paths intact.
- Rewrote README and AGENTS guidance around the simplified local-first project boundary.

## Verification

- `npm install --package-lock-only --ignore-scripts`
- `npm run build`
- `npm run test:syntax`
- `npm run test:unit`
- `npm run electron:build`
- `npm run test:e2e`
- CR pass: checked diff and stale references; no blocking findings.

## Notes

- Existing `node_modules` still contains extraneous packages from the old surfaces until someone runs `npm prune` or reinstalls dependencies.
- No replacement remote hosting, browser UI, or `agent-world-cli` compatibility was added.
