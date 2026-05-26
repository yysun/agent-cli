# REQ: global-skills-env

## Problem

Agent CLI currently treats user-global skills as always available. That makes local workspace behavior less predictable: a repository can load instructions from the user's home directory even when the workspace itself did not opt into that broader instruction surface.

The new behavior should make the boundary explicit. Workspace skills remain local-first and always load from `.agent-world/skills`. Global skills only load when an environment variable enables them, and global discovery should cover both current user skill locations: `~/.agent-world/skills` and `~/.agents/skills`.

## Requirements

- Add an Agent CLI environment variable that enables global skill loading.
- When the variable is disabled or absent, load workspace-local skills from `.agent-world/skills` exactly as before.
- When the variable is enabled, load global skills from both `~/.agent-world/skills` and `~/.agents/skills`.
- Keep workspace skills higher precedence than global skills when duplicate skill ids exist.
- Keep missing global skill directories non-fatal.
- Allow the new environment variable to be read from the invocation cwd `.env` file.
- Keep CLI startup diagnostics honest about which skill scopes are loaded.

## Acceptance

- Default skill inventory contains workspace skills and no home-directory skills.
- Setting the new environment variable to an enabled value adds skills from both global roots.
- Duplicate ids still resolve to the workspace skill.
- Unit tests cover disabled and enabled global skill behavior.
- Targeted build and unit validation passes, or any unrelated failure is reported with the concrete blocker.

## Non-Goals

- Do not change the workspace skill path.
- Do not move or migrate existing skill files.
- Do not add CLI flags for this setting.
- Do not add a registry, worlds folder, or persisted agent configuration.
