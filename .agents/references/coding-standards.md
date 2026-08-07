# Coding Standards

## TypeScript

- Use `interface` for type definitions rather than `type` aliases.
- Explicit typing; strict TypeScript patterns. No implicit `any` — if a lint
  escape is genuinely needed, scope it narrowly with an
  `// eslint-disable-next-line` comment rather than disabling for the file.
- `async`/`await` for asynchronous work, not promise chains.
- `const` unless a variable is genuinely reassigned.
- Descriptive names for functions and variables.
- Comment complex or non-obvious logic. Skip comments that restate the code.
- JSDoc on public functions and classes, including parameter descriptions and
  return types.

Lint with `npm run lint` (`eslint src` — pass the directory, not a `**` glob,
which `sh` does not expand recursively); `npm run lint-fix` applies
autofixes. Config lives in `eslint.config.mjs` (flat config) with
`typescript-eslint`.

## Code organization

| Kind of code | Location |
| --- | --- |
| Language implementations | `src/languages/` |
| Webview providers | `src/webview/` |
| Webview HTML templates | `src/webview/templates/` |
| Shared type definitions | `src/types/` |
| Tests | `src/test/`, mirroring `src/` |

Shared helpers live in `src/io.ts` (process spawning, filesystem, environment)
and `src/fmt.ts` (formatting). Reach for those before writing a new utility.

## Error handling

- `try`/`catch` around anything that can fail: spawning, filesystem access, VS
  Code API calls, JSON parsing.
- Give the user a meaningful message; `console.log`/`console.warn` the detail
  for debugging.
- Degrade gracefully rather than throwing. The codebase does this consistently:
  `unsupported.Cell` when a binary is missing, a workspace-folder fallback when
  `getExecPath()` throws, a fallback `cwd` when the configured one does not
  exist.
- Check explicitly for `undefined`/`null` — VS Code APIs return optionals
  frequently (`workspace.workspaceFolders?.[0]?.uri.fsPath`).

## Security

Cell execution runs arbitrary user code by design, but everything around it
still needs care:

- Sanitize user input before it reaches a shell. Quote arguments; do not
  interpolate raw strings into command lines.
- Validate file paths and URLs before acting on them, and resolve them through
  `config.getFullPath()`.
- Escape content interpolated into webview HTML — file and folder display names
  are user-supplied.
- Do not log secrets. Environment variables merged from
  `terminal.integrated.env.*` may contain tokens.

## Performance

- Avoid unnecessary filesystem operations; the notebooks view walks directories
  and can be called often.
- Dispose resources; push disposables onto `context.subscriptions`.
- Lazy-load where it helps activation time — activation events are
  `onLanguage:markdown` and `onStartupFinished`.
- Cache frequently accessed data rather than re-reading configuration in a loop.

## Dependencies

The only runtime dependency is `markdown-it`. Keep it that way unless there is a
strong reason — prefer a VS Code API or a small local helper over a new package.

## Related documents

- [architecture.md](architecture.md)
- [testing.md](testing.md)
- [workflows.md](workflows.md)
