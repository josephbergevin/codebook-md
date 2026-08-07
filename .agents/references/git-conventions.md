# Git Conventions

## Branches

`main` is the default branch and the base for pull requests. CI runs on push
and PR to `main`. Work on a topic branch; the naming in use is
`<area>/<short-description>` (for example `shell/integrated-env-vars`).

## Commit message format

```
<type>(<scope>): <subject>

<body>
```

- Subject line: **72 characters max**.
- Body lines: **68 characters max** each; any number of lines.
- Subject in the imperative, no trailing period.

## Types

| Type | Use for |
| --- | --- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Formatting only — whitespace, semicolons, no meaning change |
| `refactor` | A change that neither fixes a bug nor adds a feature |
| `perf` | A performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or external dependency changes |
| `ci` | CI configuration and scripts |
| `chore` | Routine maintenance |
| `tooling` | Build process or auxiliary tooling, e.g. doc generation |

## Scopes

The area of the change:

- Source areas — `src`, `languages`, `config`, `types`, `test`
- Languages — `go`, `bash`, `shell`, `python`, `javascript`, `typescript`,
  `sql`, `http`
- Webviews — `webview`, and more specifically `configModal`,
  `documentationView`, `notebooksView`
- Other — `chat`, `kernel`, `executionHistory`, `docs`, `changelog`

## Examples

Drawn from the repository history:

```
feat(shell): support vscode env var substitution
feat(chat): add commands for chatting with cell, section, and notebook
feat(docs): update docs for vscode env var support & ws token vars
fix(config): resolve relative execPath against workspace root
docs: add commit message guidelines to code conventions
```

Version-bump commits are the bare version number (`0.21.2`).

## Related documents

- [workflows.md](workflows.md)
- [publishing.md](publishing.md)
