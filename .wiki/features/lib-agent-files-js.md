---
title: "Prompt And Skill Loading"
type: "feature"
status: "active"
language: "default"
source_paths:
  - "AGENTS.md"
  - "core/agent-files.ts"
  - "README.md"
updated_at: "2026-05-16"
---

# Prompt And Skill Loading

This module loads the instruction files that shape a turn before the model sees any user or assistant messages.

## Prompt Layers

There are two prompt sources:

1. a built-in default prompt shipped by the codebase
2. optional project instructions from `AGENTS.md`

`AGENTS.md` is additive, not a replacement. If the file is missing, the CLI still runs with the built-in prompt.

## Skill Discovery

Skills are discovered recursively from `.agents/skills/**/SKILL.md`. The walk is deterministic: directories and files are both sorted so tests and runtime behavior stay stable.

Only skills with usable frontmatter, the YAML block at the top of a Markdown file, are included in the inventory. The loader extracts the skill name and description, then passes them forward as `{ skillId, description, sourcePath }` records.

## How The Model Sees Skills

The loader also builds a short skill inventory message that tells the model to call `load_skill` when one of the listed skills is relevant. That keeps skills explicit instead of silently injecting every skill body into every turn.

The runtime layering that uses this inventory is described in [[lib-runtime-client-js]].

## Failure Behavior

- missing `AGENTS.md` is treated as no project prompt
- missing `.agents/skills` is treated as an empty skill inventory
- malformed skills without a usable `name` field are skipped rather than crashing the whole run

That makes skill authoring forgiving while keeping the turn behavior predictable.