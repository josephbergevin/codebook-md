# Publishing

The extension ships to two registries: the VS Code Marketplace and the Open VSX
Registry. See [`PUBLISHING.md`](../../PUBLISHING.md) for the user-facing guide;
this document is the agent-facing checklist.

## Prerequisites

- **VS Code Marketplace** — a Personal Access Token (PAT) from Azure DevOps.
- **Open VSX** — an access token from
  [open-vsx.org](https://open-vsx.org/user-settings/tokens).
- The `josephbergevin` namespace must be claimed on Open VSX.

Never write a token into a file or a committed script. `npm run publish:ovsx`
prompts for it if it is not already configured.

## Release checklist

The order is: release commit → PR → CI → merge → publish from `main` → tag.
The [release-extension](../skills/release-extension/SKILL.md) skill has the
full procedure; this is the summary.

1. `npm run lint` and `npm test` clean; `npm run compile` succeeds.
2. `npm version <patch|minor|major> --no-git-tag-version` — bumps
   `package.json` and `package-lock.json` together, with no commit and no tag.
3. Add a `CHANGELOG.md` entry for the new version, calling out breaking changes
   explicitly. Update `README.md` (it is the Marketplace listing page) and
   `src/webview/templates/documentation.html` for any user-facing change.
4. Commit the bump and the notes together as `chore(release): <version>`.
5. `npx vsce package` and `npx vsce ls` — dry run to catch packaging problems.
6. Push, open a PR titled `<version> - <summary>`, wait for CI, and
   rebase-merge.
7. On an up-to-date `main`: `npx vsce package`, then publish that one `.vsix` to
   both registries — `npx vsce publish --packagePath <file>` and
   `npx ovsx publish <file>`.
8. `git tag v<version>` on the published `main` commit and push the tag.

Never use `vsce publish patch|minor|major`. It bumps, commits, tags, and
publishes in a single irreversible call, which puts the version commit after
the changelog that describes it and tags a branch commit that rebase-merging
then orphans.

## Notes

- Publishing is manual today. Automating it means adding `OPEN_VSX_TOKEN` and
  `VSCE_PAT` to repository secrets and extending
  `.github/workflows/typescript-ci.yml` (or adding a release workflow) to run
  the publish commands on release creation.
- Packaging respects `.vscodeignore`.
- Historic `.vsix` artifacts are committed at the repository root. New releases
  do not need to add to them.

## Related documents

- [workflows.md](workflows.md)
- [git-conventions.md](git-conventions.md)
- Skill: [release-extension](../skills/release-extension/SKILL.md)
