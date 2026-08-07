# Developer Workflows

## Build, lint, test

Prefer the VS Code tasks defined in `.vscode/tasks.json` over ad-hoc terminal
commands. Task output is matched by `$tsc` and lands in the Problems panel,
where the `get_errors` tool can read it.

| Task | Script | Purpose |
| --- | --- | --- |
| `npm run compile` | `webpack` | Build the extension bundle |
| `npm run lint` | `eslint src/**/*.ts` | Lint |
| `npm test` | `jest` | Unit tests — all must pass |
| `npm install` | | Install dependencies |
| `npm: watch` | `webpack --watch` | Development watch build |
| `npm: watch-tests` | `tsc -p . -w --outDir out` | Watch-compile tests |
| `tasks: watch-tests` | | Runs both watchers together |
| `gpom` | `git pull origin main --autostash` | Sync with main |
| `npm update` | | Update dependencies |

Other scripts not exposed as tasks:

- `npm run package` — production webpack build (`vscode:prepublish` runs this)
- `npm run compile-tests` — `tsc -p . --outDir out`
- `npm run pretest` — compile-tests + compile + lint
- `npm run lint-fix` — eslint with `--fix`
- `npm run test:silent` — jest without console noise
- `npm run publish:ovsx` — publish to Open VSX

A change is done when `npm run compile`, `npm run lint`, and `npm test` are all
clean.

## CI

`.github/workflows/typescript-ci.yml` runs on push and pull request to `main`:
`npm install`, `npm run lint`, `npm test` on `ubuntu-latest`.

## Debugging the extension

`.vscode/launch.json` provides the standard Extension Development Host
configuration. Run the watch build first so changes are picked up. VS Code
engine target is `^1.88.0`.

## Extension development patterns

- **Commands** — register in `activate()` in `src/extension.ts` *and* in
  `package.json` `contributes.commands`. Prefix ids with `codebook-md.`.
- **Webviews** — always implement `dispose()`; push disposables onto
  `context.subscriptions`.
- **Configuration** — read with
  `workspace.getConfiguration('codebook-md.<section>')`.
- **Paths** — resolve with `config.getFullPath()` / `config.getExecPath()`.

## Documentation upkeep

Ship documentation with the feature, not after it:

- **`README.md`** — user-facing features, with an example where it helps.
- **`src/webview/templates/documentation.html`** — the in-extension docs. Add
  the section *and* an entry in its index.
- **`CHANGELOG.md`** — every release; breaking changes called out explicitly.
- **JSDoc** — public functions and classes, with parameters and return types.
- **`.agents/`** — if you change a convention or add a subsystem, update the
  relevant reference or skill so this documentation does not drift.

## Scratch and generated files

`codebook-md.execPath` defaults to `./codebook-md/`, so generated cell-execution
files land in `codebook-md/` at the workspace root. `apiplayground/` holds
scratch execution targets. Neither is part of the extension source.

## Related documents

- [testing.md](testing.md)
- [publishing.md](publishing.md)
- [git-conventions.md](git-conventions.md)
