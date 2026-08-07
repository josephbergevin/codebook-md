# `.agents/` — Coding Agent Documentation

Documentation written for coding agents working in this repository. Humans are
welcome to read it; it is kept accurate against the code.

## Layout

```
AGENTS.md                     # repo root — entry point, always read first
CLAUDE.md                     # symlink → AGENTS.md
.github/copilot-instructions.md  # symlink → ../AGENTS.md

.agents/
  README.md                   # this file
  references/                 # descriptive: how the codebase works
  skills/                     # procedural: how to perform a recurring task

.claude/skills                # symlink → ../.agents/skills

src/AGENTS.md                 # directory-scoped guidance
src/languages/AGENTS.md
src/webview/AGENTS.md
src/test/AGENTS.md
```

## The three kinds of document

**`AGENTS.md`** — normative and always in context. The root one covers the
project as a whole; directory-embedded ones cover a single area and are picked
up when an agent works in that directory. Keep them short. If a section grows
past a screen, move it to a reference and link.

**`references/`** — descriptive. How a subsystem works, what the contracts are,
where things live. Read on demand when a task touches that area. Optimized for
lookup, not for reading front to back.

**`skills/`** — procedural. A named, repeatable task with concrete steps,
following the `SKILL.md` convention: a directory per skill containing a
`SKILL.md` with YAML frontmatter (`name`, `description`). The `description`
decides whether an agent picks the skill up, so it should name the triggering
situations in the words a user would actually use.

## Symlinks

The root `AGENTS.md` is the single source of truth for top-level instructions.
`CLAUDE.md` and `.github/copilot-instructions.md` are symlinks to it, so Claude
Code, GitHub Copilot, and any tool following the [agents.md](https://agents.md)
convention all read the same file. `.claude/skills` symlinks to
`.agents/skills`, making the skills discoverable by Claude Code without
duplicating them.

**Edit the real files, never the symlinks.**

## Current index

References:

| File | Covers |
| --- | --- |
| [project-context.md](references/project-context.md) | What the extension is and does; data flow |
| [architecture.md](references/architecture.md) | Execution pipeline, language registry, commands, chat |
| [language-support.md](references/language-support.md) | The `ExecutableCell` contract and language modules |
| [configuration.md](references/configuration.md) | Settings hierarchy, per-cell directives, folder groups |
| [webviews.md](references/webviews.md) | Provider + template pattern, messaging, theming |
| [testing.md](references/testing.md) | Jest setup, layout, mocking `vscode` |
| [coding-standards.md](references/coding-standards.md) | TypeScript style, error handling, security |
| [workflows.md](references/workflows.md) | Build, lint, test, watch, docs upkeep |
| [git-conventions.md](references/git-conventions.md) | Branches and commit message format |
| [publishing.md](references/publishing.md) | Release prerequisites and checklist |

Skills:

| Skill | Task |
| --- | --- |
| [add-language-support](skills/add-language-support/SKILL.md) | Make a new language executable in notebooks |
| [add-vscode-command](skills/add-vscode-command/SKILL.md) | Add a command end to end |
| [add-configuration-setting](skills/add-configuration-setting/SKILL.md) | Add a setting that shows in the Settings UI |
| [add-webview-view](skills/add-webview-view/SKILL.md) | Add a sidebar webview |
| [release-extension](skills/release-extension/SKILL.md) | Version, package, publish |

## History

This replaces the previous `.agent/rules/` directory and the flat
`.github/copilot-instructions.md`. Their content was folded into `AGENTS.md`
and `references/`; the originals were removed once the migration was complete.

## Adding to this documentation

- New subsystem or convention → a reference, linked from the table above and
  from the root `AGENTS.md`.
- New recurring multi-step task → a skill, with frontmatter whose `description`
  states when to use it.
- Guidance that only applies inside one directory → that directory's
  `AGENTS.md`.

Verify claims against the code before writing them down. Documentation that is
wrong is worse than documentation that is missing.
