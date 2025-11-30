# Publishing Guide

This guide describes how to publish the `codebook-md` extension to both the VS Code Marketplace and the Open VSX Registry.

## Prerequisites

- **VS Code Marketplace**: You need a Personal Access Token (PAT) from Azure DevOps.
- **Open VSX Registry**: You need an Access Token from [open-vsx.org](https://open-vsx.org/user-settings/tokens).
- **Namespace**: Ensure you have claimed the `josephbergevin` namespace on Open VSX.

## Publishing

### 1. Package the Extension

Before publishing, it's good practice to ensure the extension packages correctly.

```bash
npm run package
```

### 2. Publish to Open VSX

To publish to the Open VSX Registry, use the following command. You will be prompted for your Open VSX Access Token if it's not already configured.

```bash
npm run publish:ovsx
```

Or, providing the token via command line (be careful with history):

```bash
npm run publish:ovsx -- -p <YOUR_OPEN_VSX_TOKEN>
```

### 3. Publish to VS Code Marketplace

(Assuming you have `vsce` installed globally or use `npx`)

```bash
npx vsce publish
```

## Automated Publishing (CI)

Currently, publishing is done manually. To automate this via GitHub Actions, you would need to:
1. Add `OPEN_VSX_TOKEN` and `VSCE_PAT` to your repository secrets.
2. Update the `.github/workflows/typescript-ci.yml` or create a new workflow to run the publish commands on release creation.
