---
name: add-configuration-setting
description: Add a new user-facing setting to CodebookMD so it appears in the VS Code Settings UI and is read correctly at runtime. Use when asked to add a setting, option, preference, or toggle, or when a setting is not showing up in the Settings UI.
---

# Add a Configuration Setting

## The rule that trips everyone up

**A setting only appears in the VS Code Settings UI if it is declared as a flat
property.** Nesting it inside an object hides it.

```jsonc
// Correct
"codebook-md.frontMatter.showInNotebook": {
  "type": "boolean",
  "default": false,
  "description": "Show YAML Front Matter as the first cell in notebooks",
  "scope": "window"
}

// Wrong — invisible in the Settings UI
"codebook-md.frontMatter": {
  "type": "object",
  "properties": { "showInNotebook": { "type": "boolean" } }
}
```

The per-language blocks (`codebook-md.go`, `codebook-md.python`, …) predate this
rule and remain object-shaped. Leave them alone; use the flat form for anything
new.

## 1. Declare in `package.json`

Add to `contributes.configuration.properties`:

```jsonc
"codebook-md.myFeature.enabled": {
  "type": "boolean",
  "default": true,
  "description": "Enable the my-feature behavior.",
  "scope": "window"
}
```

- `description` is what the user reads — write a full sentence.
- Give every setting a `default`, and make the default the safe behavior.
- Use `enum` with `enumDescriptions` for a fixed set of choices.
- `scope`: `window` for workspace-level, `resource` for per-file,
  `application` for global-only.

## 2. Read it at runtime

```ts
const enabled = workspace
  .getConfiguration('codebook-md.myFeature')
  .get<boolean>('enabled', true);
```

Always pass a default to `get()` so a missing value cannot become `undefined`.

If the setting belongs to a language, read it in that language's `Config` class
(`src/languages/<lang>.ts`) rather than at the call site.

If it is a path, run the value through `config.getFullPath()` or
`config.getExecPath()` — never join it by hand.

Consider adding an accessor to `src/config.ts` when more than one call site
needs it, following `getDynamicFolderGroupConfig()` /
`isDynamicFolderGroupEnabled()`.

## 3. Per-cell override (optional)

Settings that make sense per cell get a `[>]` directive. `CodeBlockConfig` in
`src/codebook.ts` parses lines whose comment prefix is followed by `[>]`:

```bash
# [>].output.showTimestamp(true)
```

To expose the setting in the cell config modal, add it to the options returned
by `getLanguageConfigOptions()`, `getOutputConfigOptions()`, or
`getExecutionHistoryConfigOptions()` in `src/cellConfig.ts`.

## 4. Test

Add or extend a test in `src/test/config.test.ts`. Cover the default, an
explicit value, and — for paths — resolution against the workspace root. The
`vscode` module is mocked at `__mocks__/vscode.js`; extend that mock if it does
not yet return configuration the way your test needs.

## 5. Document

- `README.md` — the setting, its default, and what it does.
- `src/webview/templates/documentation.html`, including its index.
- `CHANGELOG.md`.

## Verify

```bash
npm run compile && npm run lint && npm test
```

In the Extension Development Host, open Settings and search for the key.
If it does not appear, it is almost certainly nested — see the rule above.

Commit as `feat(config): add <setting> setting`.

## Related

- [`.agents/references/configuration.md`](../../references/configuration.md)
