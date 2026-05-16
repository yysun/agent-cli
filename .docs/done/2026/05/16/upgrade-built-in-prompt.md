## Summary

- Upgraded Agent CLI's built-in system prompt with evidence-first, read-only tool, `load_skill`, and secret-handling guidance adapted from ai-workspace's runtime prompt.
- Kept Agent CLI's existing prompt layering model unchanged: built-in prompt, optional `AGENTS.md`, and optional skill inventory remain separate prompt contributions.
- Limited the source change to `core/agent-files.ts` and expanded unit assertions in `tests/unit/agent-files.test.js`.

## Verification

- Ran `npm run build:ts` from the repo root.
- Ran focused unit tests for `tests/unit/agent-files.test.js`; all passed.
- Ran the full unit test suite under `tests/unit`; all passed.
- Reviewed the scoped diff and checked the edited files for workspace diagnostics errors.

## Notes

- The change ports instruction themes from ai-workspace's server/runtime prompt, not a verbatim prompt copy.
- No E2E spec was needed because this is an internal prompt-content update with unchanged runtime architecture.