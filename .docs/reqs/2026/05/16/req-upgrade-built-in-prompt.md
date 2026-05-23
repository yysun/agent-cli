# REQ: upgrade-built-in-prompt

- Story slug: `upgrade-built-in-prompt`
- Created: `2026-05-16`
- Status: Done

## Summary

Upgrade Agent CLI's built-in system prompt with stronger evidence-first and tool-usage guidance derived from ai-workspace's server/runtime prompt, while preserving Agent CLI's current prompt layering model.

## Problem

Agent CLI's built-in prompt is currently minimal. It gives the model almost no explicit guidance about inspecting workspace state before speculating, using tools before asking, using `load_skill` when workspace-specific instructions matter, or handling secrets conservatively. ai-workspace's server/runtime prompt already carries stronger operational guidance in those areas. The requested change is to bring the useful instruction content into Agent CLI without changing how Agent CLI layers the built-in prompt, optional `AGENTS.md`, and skill inventory.

## Requirements

1. Agent CLI must keep a built-in system prompt separate from workspace `AGENTS.md` content.
2. Agent CLI must keep the current layering model in which the built-in prompt, optional workspace prompt, and skill inventory remain distinct prompt contributions.
3. The built-in prompt must be expanded with instruction content inspired by ai-workspace's runtime prompt.
4. The built-in prompt must tell the model to prefer workspace evidence over speculation when answers depend on files, configuration, environment variables, logs, generated outputs, or repository state.
5. The built-in prompt must tell the model to use available read-only tools before asking the user for information that may already exist in the workspace.
6. The built-in prompt must tell the model to use `load_skill` when a task depends on domain-specific instructions, procedures, or contracts and a relevant skill is available.
7. The built-in prompt must tell the model not to claim local files, configuration, or prerequisites are missing until likely sources have been inspected when appropriate.
8. The built-in prompt must include conservative secret-handling guidance that avoids revealing secret values by default.
9. The built-in prompt may be adapted to Agent CLI's style and scope; it does not need to match ai-workspace's prompt text verbatim.
10. The change must not collapse the current prompt layering into one concatenated prompt string.
11. Existing workspace `AGENTS.md` loading behavior must remain unchanged.
12. Existing skill inventory loading behavior and `load_skill` hint behavior must remain unchanged except where the stronger built-in prompt makes better use of them.
13. Existing tests must be updated or expanded to cover the upgraded built-in prompt behavior.

## Non-Goals

1. Changing Agent CLI to use ai-workspace's exact server architecture is not required.
2. Changing runtime selection, persistence, tool execution, or CLI display behavior is not required.
3. Adding new tools, new flags, or new prompt sources is not required.
4. Replacing the current layered prompt model with a single combined prompt string is not required.

## Acceptance Criteria

1. `getBuiltInSystemPrompt()` returns a prompt that contains stronger workspace-inspection, tool-usage, `load_skill`, and secret-handling guidance than the current three-sentence prompt.
2. Workspace `AGENTS.md` prompt loading behavior remains unchanged.
3. `buildSkillInventoryMessage()` behavior remains unchanged.
4. Runtime prompt layering still uses the built-in prompt plus optional workspace prompt plus optional skill inventory as separate system-message contributions.
5. Unit tests verify the upgraded built-in prompt and preserve the separation between built-in prompt loading and workspace prompt loading.

## Open Questions

1. No open questions remain for the implemented scope.
