# Done: Auto Interactive Mode

## Summary

- `agent-cli` now starts an interactive terminal prompt when invoked with no message and no `--remote`.
- One-shot messages, `--help`, and `--remote` keep their existing behavior.
- Interactive mode supports `/new`, `/clear`, `/chats`, `/use <chatId>`, `/exit`, and `/quit`.
- Interactive turns reuse the existing persisted chat and runtime execution path.
- Workspace `.env` loading is now quiet and idempotent per workspace root, avoiding duplicate dotenv banners.

## Verification

- `npm run test:syntax`
- `npm run test:unit` (95 unit tests)
- Manual TTY E2E checks for prompt startup and interactive slash commands.
- `node ./bin/agent-cli.js --help`

## Notes

- Live provider-backed E2E chat was not run; unit tests mock runtime dispatch and verify continuation after failed turns.
- GC was blocked by unrelated or pre-existing dirty files in the checkout, including `.gitignore` and earlier executable/build changes.
