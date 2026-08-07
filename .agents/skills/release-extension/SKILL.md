---
name: release-extension
description: Cut a CodebookMD release — bump the version, update the changelog, package, and publish to the VS Code Marketplace and Open VSX. Use when asked to release, publish, ship a version, or bump the extension version.
---

# Release the Extension

Publishing is manual and goes to two registries. Do not publish without
explicit confirmation from the user — it is an outward-facing, irreversible
action.

## Preflight

All three must be clean before anything else:

```bash
npm run lint
npm test
npm run compile
```

Also confirm:

- The working tree is clean and you are on `main` (or the release branch the
  user names).
- `README.md` and `src/webview/templates/documentation.html` describe every
  user-facing change since the last release. Check `git log <last-tag>..HEAD`.

## 1. Bump the version

Edit `version` in `package.json`. Semver:

- **patch** — bug fixes only
- **minor** — new features, backward compatible
- **major** — breaking changes to settings, commands, or config file format

## 2. Update `CHANGELOG.md`

Add a section for the new version at the top. Group entries by kind (Added,
Changed, Fixed) and call out breaking changes explicitly. Derive entries from
the commit log:

```bash
git log --oneline <previous-version>..HEAD
```

## 3. Commit

The repository history uses the bare version number as the message for
version-bump commits:

```bash
git commit -am "0.21.3"
```

## 4. Package

```bash
npm run package
```

This is the production webpack build (`webpack --mode production --devtool
hidden-source-map`). `vscode:prepublish` runs it automatically, but running it
first surfaces packaging problems before you touch a registry.

Packaging respects `.vscodeignore`.

## 5. Publish

Confirm with the user before running either command.

```bash
npm run publish:ovsx   # Open VSX Registry
npx vsce publish       # VS Code Marketplace
```

Credentials:

- Open VSX — access token from
  [open-vsx.org](https://open-vsx.org/user-settings/tokens). `ovsx` prompts if
  it is not configured. The `-p <token>` form leaks into shell history; prefer
  the prompt.
- Marketplace — an Azure DevOps PAT for the `josephbergevin` publisher.

Never write a token into a file or a committed script, and never echo one.

## 6. Tag and push

```bash
git tag v0.21.3
git push origin main --tags
```

## Automating later

CI (`.github/workflows/typescript-ci.yml`) currently only installs, lints, and
tests. To automate publishing: add `OPEN_VSX_TOKEN` and `VSCE_PAT` to the
repository secrets and add a workflow triggered on release creation that runs
the publish commands.

## Related

- [`.agents/references/publishing.md`](../../references/publishing.md)
- [`PUBLISHING.md`](../../../PUBLISHING.md) — the user-facing guide
