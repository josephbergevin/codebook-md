# AGENTS.md — `src/test/`

Jest tests. See [testing.md](../../.agents/references/testing.md) for detail.

## Setup

- Jest with `ts-jest`, `testEnvironment: node` (`jest.config.js`)
- `testMatch: ['**/src/test/**/*.test.ts']`
- `.vscode-test/` and `out/` are ignored to avoid haste module collisions
- The `vscode` module is mocked at `../../__mocks__/vscode.js` and picked up
  automatically

Run with `npm test`, or the VS Code task of the same name so failures land in
the Problems panel.

## Layout

Mirror `src/`. `src/languages/go.ts` → `src/test/languages/go.test.ts`.
Name files `<filename>.test.ts`.

Existing tests: `codebook.test.ts`, `config.test.ts`, `env.test.ts`,
`executionHistory.test.ts`, `folders.test.ts`, `fmt.test.ts`,
`markdownRenderer.test.ts`, `prompt.test.ts`, `extension.test.ts` (a stub),
`languages/go.test.ts`, `languages/http.test.ts`,
`webview/configModal.test.ts`.

## Rules for this directory

- **One behavior per test.** A test asserting three unrelated things says
  little when it fails.
- **Name the scenario, not the method** — `'returns unsupported cell when go is
  not on PATH'`, not `'test NewExecutableCell'`.
- **Group with `describe`** by unit, then by scenario.
- **Cover the error path**, not only the happy path. The codebase leans on
  graceful degradation (`unsupported.Cell`, `cwd` fallbacks, `getExecPath()`
  throwing) — those branches are exactly the ones worth pinning down.
- **Extend `__mocks__/vscode.js`** when a test needs a VS Code API it does not
  cover, rather than stubbing `vscode` inline in each file.
- **`CodeBlockConfig` accepts `undefined`** for the notebook cell and builds an
  empty instance — convenient when you need a config without a real cell.
- **Run the whole suite** when fixing a failure. The language modules share
  enough through `codebook.ts` that a targeted fix can break a neighbor.

## Gaps worth filling

`templating/` is empty. `src/kernel.ts` and `src/extension.ts` have essentially
no coverage, and most of `src/languages/` is untested — only `go` and `http`
have test files. New work in those areas is a good chance to add the first real
tests.
