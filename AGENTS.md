# AGENTS.md — CodebookMD

Instructions for coding agents working in this repository. This file is the
entry point; it stays short on purpose. Detailed material lives in
[`.agents/references/`](.agents/references/) and repeatable procedures live in
[`.agents/skills/`](.agents/skills/).

`CLAUDE.md` and `.github/copilot-instructions.md` are symlinks to this file.
Edit **this** file — never the symlinks.

## What this project is

CodebookMD is a VS Code extension that turns markdown files into executable,
Jupyter-like notebooks. Fenced code blocks become runnable cells; output is
captured and rendered back into the notebook. It also provides a sidebar for
organizing markdown files and a `@codebook` chat participant.

Written in TypeScript, bundled with webpack, tested with Jest.
Extension id `codebook-md`, publisher `josephbergevin`, VS Code engine `^1.88.0`.

The user may refer to this project as: CodebookMD, this extension, the
CodebookMD extension, this project, this workspace, or the CodebookMD codebase.

## Repository map

| Path | What lives there |
| --- | --- |
| `src/extension.ts` | Activation, command registration, chat participant |
| `src/kernel.ts` | Notebook controller — executes cells, streams output |
| `src/codebook.ts` | Core types (`ExecutableCell`, `Command`, `CodeBlockConfig`), language registry, `NewExecutableCell()` factory |
| `src/languages/` | One module per executable language ([AGENTS.md](src/languages/AGENTS.md)) |
| `src/webview/` | Sidebar view providers + HTML templates ([AGENTS.md](src/webview/AGENTS.md)) |
| `src/test/` | Jest tests, mirroring `src/` ([AGENTS.md](src/test/AGENTS.md)) |
| `src/config.ts`, `src/cellConfig.ts` | Settings resolution, per-cell config, execution history |
| `src/io.ts`, `src/fmt.ts` | Shared process-spawning / filesystem / formatting helpers |
| `package.json` | `contributes` block — commands, settings, views, notebook type |

## Build, lint, and test

Prefer the VS Code tasks (`npm test`, `npm run compile`, `npm run lint`,
`npm install`) defined in `.vscode/tasks.json` over ad-hoc terminal invocations;
results land in the Problems panel where the `get_errors` tool can read them.
CI (`.github/workflows/typescript-ci.yml`) runs `npm run lint` and `npm test` on
every push and PR to `main`.

```bash
npm run compile   # webpack build
npm run lint      # eslint src (all of src/)
npm test          # jest (all tests must pass)
npm run watch     # webpack --watch, for development
```

All three must be clean before you call a change done.

## Non-negotiable rules

1. **Register commands in two places.** A new command needs an entry in
   `package.json` `contributes.commands` *and* a `registerCommand` call in
   `activate()` in `src/extension.ts`. One without the other is a bug.
2. **Settings must be flat properties.** Define user-facing settings as flat
   keys (`"codebook-md.frontMatter.showInNotebook"`), not nested inside an
   object. Nested settings do not appear in the VS Code Settings UI.
3. **Resolve paths through `config.getFullPath()`** (and `config.getExecPath()`
   for execution directories). Never hand-roll workspace-relative path joins.
4. **Dispose everything.** Push disposables onto `context.subscriptions` and
   implement `dispose()` on webview providers.
5. **Tests mirror source.** `src/languages/go.ts` → `src/test/languages/go.test.ts`.
6. **Update user-facing docs with user-facing changes** — `README.md`,
   `src/webview/templates/documentation.html` (including its index), and
   `CHANGELOG.md` for breaking changes.

## Code conventions

- Prefer `interface` over `type` aliases; explicit typing throughout.
- `async`/`await` over promise chains; `const` unless reassigned.
- Comment non-obvious logic; JSDoc on public functions and classes.
- Wrap error-prone operations in `try`/`catch`, surface a useful message to the
  user, and `console.log` details for debugging.
- Sanitize anything user-supplied that reaches a shell, a path, or HTML.

Full detail: [coding-standards.md](.agents/references/coding-standards.md).

## Commit messages

`<type>(<scope>): <subject>` — subject line ≤ 72 chars, body lines ≤ 68.
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `tooling`. Scopes are area names such as `src`, `languages`,
`go`, `shell`, `webview`, `configModal`, `config`, `test`, `types`.

Full detail: [git-conventions.md](.agents/references/git-conventions.md).

## References

Read these when the task touches the corresponding area.

| Reference | Read it when |
| --- | --- |
| [project-context.md](.agents/references/project-context.md) | You need the feature set and data-flow overview |
| [architecture.md](.agents/references/architecture.md) | Changing execution flow, kernel, or core types |
| [language-support.md](.agents/references/language-support.md) | Touching anything in `src/languages/` |
| [configuration.md](.agents/references/configuration.md) | Adding or changing settings, per-cell config |
| [webviews.md](.agents/references/webviews.md) | Working on sidebar views or the config modal |
| [testing.md](.agents/references/testing.md) | Writing or fixing tests |
| [coding-standards.md](.agents/references/coding-standards.md) | Writing any TypeScript here |
| [workflows.md](.agents/references/workflows.md) | Build, lint, test, watch, docs upkeep |
| [git-conventions.md](.agents/references/git-conventions.md) | Committing or branching |
| [publishing.md](.agents/references/publishing.md) | Cutting a release |

## Skills

Step-by-step procedures for recurring tasks, in [`.agents/skills/`](.agents/skills/):

- [add-language-support](.agents/skills/add-language-support/SKILL.md) — wire up a new executable language
- [add-vscode-command](.agents/skills/add-vscode-command/SKILL.md) — add a command end to end
- [add-configuration-setting](.agents/skills/add-configuration-setting/SKILL.md) — add a setting that shows in the Settings UI
- [add-webview-view](.agents/skills/add-webview-view/SKILL.md) — add a sidebar webview
- [release-extension](.agents/skills/release-extension/SKILL.md) — version, package, publish
