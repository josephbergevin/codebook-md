---
name: release-extension
description: Take finished work live — bump the version, write the changelog and README updates, open and merge the PR, then publish to the VS Code Marketplace and Open VSX and tag the release. Use when asked to release, publish, ship, go live, cut a version, or bump the extension version.
---

# Release the Extension

This skill starts where the coding stops: the fix or feature is committed on a
branch, and it needs to become a published version.

```
release commit  →  push + PR  →  CI green  →  merge  →  publish from main  →  tag
```

Two ideas shape the order:

- **The version bump is part of the release commit, not of publishing.** Never
  run `vsce publish patch|minor|major` — that form bumps, commits (with a bare
  `0.21.8` message and no context), tags, and publishes in one irreversible
  call. Bump with `npm version --no-git-tag-version` instead, so the version,
  changelog, and README land together in one reviewable commit, and
  `vsce publish` (no argument) just ships whatever `package.json` says.
- **Publish last, from `main`.** Publishing cannot be undone, so it happens
  after CI has passed and the PR has merged. It also means the tag lands on a
  commit that actually exists on `main` — the repo rebase-merges, so a tag made
  on the branch would point at an orphan.

## 0. Preflight

```bash
git status --short                          # clean, on the feature branch
git fetch origin && git log --oneline origin/main..HEAD
npm run lint && npm test && npm run compile
npx vsce show josephbergevin.codebook-md    # version currently live
```

`git log origin/main..HEAD` is the content of this release — every entry in the
changelog comes from it. If the branch is behind `origin/main`, rebase first.

## 1. Pick the version

- **patch** — bug fixes only
- **minor** — new features, backward compatible
- **major** — breaking changes to settings, commands, or config file format

Infer it from the commit types (`fix` → patch, `feat` → minor), say which you
picked and why, and let the user override.

```bash
npm version patch --no-git-tag-version    # or minor / major
```

This updates `package.json` **and** `package-lock.json` together and creates no
commit and no tag. Do not hand-edit the version — that is how the lockfile
drifts.

The new version must be greater than the live one from preflight. If
`package.json` was already ahead of the Marketplace (an earlier release was
bumped but never published), say so and ask whether to fold those entries into
this release.

## 2. Write the release notes

Everything here describes the version from step 1:

- **`CHANGELOG.md`** — new `## [x.y.z] - YYYY-MM-DD` section at the top, grouped
  under Added / Changed / Fixed. Lead each entry with the user-visible symptom
  in bold, then the cause and the fix. Call out breaking changes explicitly.
- **`README.md`** — this is the Marketplace listing page; it is packaged as-is.
  Update it for any user-facing change.
- **`src/webview/templates/documentation.html`** — same changes, plus its index.

Bug-fix-only releases usually touch only the changelog.

## 3. Release commit

One commit carries the bump and the notes:

```bash
git add package.json package-lock.json CHANGELOG.md README.md src/webview/templates/documentation.html
git commit -m "chore(release): 0.21.8"
```

Give it a body summarizing the release when there is more than one change.

## 4. Verify the package

```bash
npx vsce package
npx vsce ls | head -40
```

`vsce package` runs the production build via `vscode:prepublish` and writes
`codebook-md-<version>.vsix` (gitignored). Check that the file list has
`dist/`, `README.md`, `CHANGELOG.md`, and nothing from `src/`, `.agents/`, or
local scratch directories. Packaging respects `.vscodeignore`.

This is a dry run — the artifact that ships is rebuilt from `main` in step 7.

## 5. Push and open the PR

Pushing and opening a PR are outward-facing: confirm with the user unless they
already asked for the full release.

```bash
git push -u origin HEAD
gh pr create --base main --title "<version> - <short summary>" --body "<changelog section>"
```

Title follows the existing PRs (`0.21.3 - vscode env var support & ws token
vars`). The body is the new changelog section verbatim.

## 6. Wait for CI, then merge

```bash
gh pr checks --watch
gh pr merge --rebase
```

Rebase-merge keeps the conventional commits intact on `main` (merge commits are
disabled; squash would fold the release commit into the feature). The branch is
deleted on merge. Never merge with failing or pending checks.

## 7. Publish from `main`

```bash
git switch main && git pull --ff-only
npx vsce package
```

Confirm `package.json` on `main` shows the new version, then **stop and get an
explicit yes from the user** — name the version and both registries. Then ship
the same `.vsix` to both, so the registries are byte-identical:

```bash
npx vsce publish --packagePath codebook-md-<version>.vsix
npx ovsx publish codebook-md-<version>.vsix
```

Credentials are the user's. `vsce` uses the PAT stored by `vsce login
josephbergevin` (or `VSCE_PAT`); `ovsx` uses `OVSX_PAT`. If either command
fails on auth, hand the command to the user to run — never ask for a token,
never pass one with `-p` (it lands in shell history), never write one to a file.

If the Marketplace publish succeeds and Open VSX fails, do not re-bump. Fix the
cause and re-run only the `ovsx` command with the same `.vsix`.

The agent's permission mode may refuse to run the publish commands at all. Do
not work around that — give the user the two commands to run themselves and
pick up at step 8 once they report back.

**Open VSX is not set up yet.** As of 0.21.8 the extension has never been
published there and the `josephbergevin` namespace does not exist
(`curl -s https://open-vsx.org/api/josephbergevin/codebook-md` returns 404).
Until the user has created a token and run
`npx ovsx create-namespace josephbergevin` once, the `ovsx` step is optional:
ask whether to include it, and skip it without fuss if not.

## 8. Tag and verify

```bash
git tag v<version>
git push origin v<version>
npx vsce show josephbergevin.codebook-md
```

The tag goes on the `main` commit that was published — tag as soon as the
Marketplace publish reports `DONE`, since the version is then permanent.

`DONE` means uploaded, not live: the Marketplace validates each version before
listing it, which can take several minutes, and `vsce show` keeps reporting the
old version until then. Poll rather than assume, and point the user at the
publisher hub (`https://marketplace.visualstudio.com/manage/publishers/josephbergevin`)
if it has not appeared after ~15 minutes — a failed validation shows up there,
not in the CLI. Do not call the release done until the new version is listed.

## If something goes wrong

| Situation | What to do |
| --- | --- |
| CI fails on the PR | Fix on the branch, push, wait again. Nothing is published yet. |
| Bug found after merge, before publish | Fix forward in a new PR; bump again only if the release commit is already on `main`. |
| Bug found after publish | Published versions are permanent. Ship a new patch release. |
| Version already exists on a registry | It was published earlier. Skip that registry; do not bump to work around it. |

## Related

- [`.agents/references/publishing.md`](../../references/publishing.md)
- [`.agents/references/git-conventions.md`](../../references/git-conventions.md)
- [`PUBLISHING.md`](../../../PUBLISHING.md) — the user-facing guide
