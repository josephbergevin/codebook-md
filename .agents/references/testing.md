# Testing

## Framework

Jest with `ts-jest`, configured in `jest.config.js`:

- preset `ts-jest`, environment `node`
- `testMatch: ['**/src/test/**/*.test.ts']`
- ignores `.vscode-test/` and `out/` to avoid haste module collisions

Run with `npm test` (or `npm run test:silent`). Prefer the VS Code task named
`npm test` so failures land in the Problems panel.

## Layout

Tests live in `src/test/` and mirror the structure of `src/`:

| Implementation | Test |
| --- | --- |
| `src/codebook.ts` | `src/test/codebook.test.ts` |
| `src/config.ts` | `src/test/config.test.ts` |
| `src/io.ts` | `src/test/env.test.ts` |
| `src/folders.ts` | `src/test/folders.test.ts` |
| `src/languages/go.ts` | `src/test/languages/go.test.ts` |
| `src/languages/http.ts` | `src/test/languages/http.test.ts` |
| `src/webview/configModal.ts` | `src/test/webview/configModal.test.ts` |

Naming: `<filename>.test.ts`. Tests are written in TypeScript.

## Mocking VS Code

The `vscode` module is not available outside the extension host, so it is
mocked at `__mocks__/vscode.js` and picked up automatically by Jest. Extend that
mock when a test needs an API it does not yet cover, rather than stubbing
`vscode` inline in each test file.

For narrower cases use `jest.mock` in the test file itself.

## Conventions

- One behavior per test; a test that asserts three unrelated things tells you
  little when it fails.
- Descriptive names stating the scenario, not the method
  (`'returns unsupported cell when go is not on PATH'`).
- Group with `describe` blocks by unit and then by scenario.
- Cover both the success path and the error path.
- `CodeBlockConfig` accepts an `undefined` notebook cell and builds an empty
  instance — useful when you need a config without a real cell.

## Fixing a failing test

Run the full suite (`npm test`), not just the failing file — the language
modules share enough state through `codebook.ts` that a targeted fix can break
a neighbor. All tests must pass before a change is done.

## Gaps

`src/test/templating/` exists but is empty, and several modules
(`src/kernel.ts`, `src/extension.ts`, most of `src/languages/`) have no direct
coverage. `src/test/extension.test.ts` is a stub. New work in those areas is a
good opportunity to add the first real tests.

## Related documents

- [workflows.md](workflows.md)
- [coding-standards.md](coding-standards.md)
