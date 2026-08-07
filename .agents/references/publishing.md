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

1. `npm run lint` and `npm test` clean; `npm run compile` succeeds.
2. Bump `version` in `package.json`.
3. Add a `CHANGELOG.md` entry for the new version, calling out breaking changes
   explicitly.
4. Confirm `README.md` and `src/webview/templates/documentation.html` cover any
   new user-facing feature.
5. Commit the bump with the bare version as the message (e.g. `0.21.3`), which
   matches the existing history.
6. `npm run package` — production webpack build. `vscode:prepublish` runs this
   automatically, but running it first catches packaging problems early.
7. `npm run publish:ovsx` — publish to Open VSX.
8. `npx vsce publish` — publish to the VS Code Marketplace.

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
