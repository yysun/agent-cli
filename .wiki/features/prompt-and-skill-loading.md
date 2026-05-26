---
title: "Prompt And Skill Loading"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "AGENTS.md"
  - "README.md"
  - "core/agent-files.ts"
  - "core/paths.ts"
  - "core/workspace-environment.ts"
  - ".docs/done/2026/05/26/global-skills-env.md"
updated_at: "2026-05-26"
---

# Prompt And Skill Loading

This module loads the instruction files that shape a turn before the model sees user and assistant messages.

## Prompt Layers

There are two prompt sources:

1. a built-in default prompt from `core/agent-files.ts`
2. optional workspace instructions from `AGENTS.md`

`AGENTS.md` is additive, not a replacement. Missing `AGENTS.md` means "no workspace prompt", not a startup failure.

## Skill Discovery

Workspace skills always load from `.agent-world/skills/**/SKILL.md` under the selected workspace. The walk is deterministic and only skills with usable frontmatter `name` values are included.

Global skills are opt-in. Set `AGENT_CLI_GLOBAL_SKILLS=true` to also load:

- `~/.agent-world/skills`
- `~/.agents/skills`

Missing global directories are non-fatal. Workspace skills have higher precedence than global skills when skill ids collide.

## How The Model Sees Skills

The loader does not inject every skill body into every turn. It builds a short inventory message that tells the model to call `load_skill` with an exact skill id when a skill is relevant. That keeps large skill bodies out of the prompt until needed.

Verbose startup diagnostics also omit empty scopes. If there are no project skills, the CLI no longer prints `project: none`.

## Failure Behavior

- missing `AGENTS.md` returns an empty workspace prompt
- missing skill roots return empty inventories
- malformed skills without a `name` are skipped
- non-missing filesystem errors still propagate

The runtime layering that uses this inventory is [[model-runner-handoff]].
