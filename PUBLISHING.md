# Publishing Guide

This guide describes how to publish the `codebook-md` extension to both the VS Code Marketplace and the Open VSX Registry.

## Prerequisites

- **VS Code Marketplace**: You need a Personal Access Token (PAT) from Azure DevOps.
- **Open VSX Registry**: You need an Access Token from [open-vsx.org](https://open-vsx.org/user-settings/tokens).
- **Namespace**: Ensure you have claimed the `josephbergevin` namespace on Open VSX.

## Publishing

The release flow is: release commit → PR → CI → merge → publish from `main` →
tag. Publishing is irreversible, so it comes last.

### 1. Bump the version and write the notes

```bash
npm version patch --no-git-tag-version   # or minor / major
```

This updates `package.json` and `package-lock.json` without committing or
tagging. Add the new version's section to `CHANGELOG.md`, update `README.md`
(it becomes the Marketplace listing page) and the in-app documentation, then
commit it all together:

```bash
git commit -am "chore(release): 0.21.8"
```

Avoid `vsce publish patch|minor|major` — it bumps, commits, tags, and publishes
in one step, so the version commit lands after the changelog that describes it.

### 2. Open a PR and merge

Push the branch, open a PR against `main`, wait for CI, and rebase-merge.

### 3. Package and publish from `main`

```bash
git switch main && git pull --ff-only
npx vsce package
```

Publish the same `.vsix` to both registries:

```bash
npx vsce publish --packagePath codebook-md-0.21.8.vsix
npx ovsx publish codebook-md-0.21.8.vsix
```

`vsce` uses the token stored by `vsce login josephbergevin` (or `VSCE_PAT`);
`ovsx` uses `OVSX_PAT`. Avoid passing tokens with `-p` — they end up in shell
history.

### 4. Tag the release

```bash
git tag v0.21.8
git push origin v0.21.8
```

## Automated Publishing (CI)

Currently, publishing is done manually. To automate this via GitHub Actions, you would need to:
1. Add `OPEN_VSX_TOKEN` and `VSCE_PAT` to your repository secrets.
2. Update the `.github/workflows/typescript-ci.yml` or create a new workflow to run the publish commands on release creation.
