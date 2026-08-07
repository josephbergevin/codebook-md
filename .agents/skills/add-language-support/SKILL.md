---
name: add-language-support
description: Add support for executing a new language in CodebookMD notebooks. Use when asked to make a new language runnable in markdown code blocks, e.g. "add Ruby support", "make PHP cells executable", or when extending src/languages/.
---

# Add Language Support

Wiring a new executable language into CodebookMD touches six places. Do all of
them — a language that is half-registered fails silently.

Read [`.agents/references/language-support.md`](../../references/language-support.md)
first if you have not already.

## 1. Register the `Language`

In `src/codebook.ts`, add a constant next to the existing ones and append it to
the `languages` array:

```ts
export const languageRuby = new Language("Ruby", ["rb"], true);

const languages = [
  languageGo,
  // ...
  languageRuby,
];
```

`nameId` is derived as `displayName.toLowerCase()`. Aliases should cover every
fence tag a user might plausibly type — this is what makes ```` ```rb ```` work
as well as ```` ```ruby ````.

## 2. Create the language module

Create `src/languages/ruby.ts`. Copy `src/languages/javascript.ts` as the
starting point — it is the smallest complete implementation.

```ts
import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import * as io from "../io";
import { NotebookCell, WorkspaceConfiguration, workspace } from "vscode";

export class Cell implements codebook.ExecutableCell {
  innerScope: string;
  executableCode: string;
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell) {
    this.config = new Config(
      workspace.getConfiguration('codebook-md.ruby'), notebookCell);

    if (this.config.contentConfig.execPath) {
      this.config.execPath = this.config.contentConfig.execPath;
      this.config.execFile = path.join(
        this.config.execPath, path.basename(this.config.execFile));
    }

    this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#");

    this.executableCode =
      `puts "${codebook.StartOutput}"\n` +
      `${this.innerScope}\n` +
      `puts "${codebook.EndOutput}"`;

    this.mainExecutable = new codebook.Command(
      'ruby', [this.config.execFile], this.config.execPath);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      io.writeDirAndFileSyncSafe(
        this.config.execPath, this.config.execFile, this.executableCode);
    });
  }

  codeBlockConfig(): codebook.CodeBlockConfig { return this.config.contentConfig; }
  commentPrefixes(): string[] { return ["#"]; }
  defaultCommentPrefix(): string { return "#"; }
  toString(): string { return this.innerScope; }
  execute(): ChildProcessWithoutNullStreams { return this.mainExecutable.execute(); }
  executables(): codebook.Executable[] {
    return [this.mainExecutable, ...this.postExecutables];
  }
  allowKeepOutput(): boolean { return this.executables().length <= 1; }
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  execFile: string;

  constructor(rubyConfig: WorkspaceConfiguration | undefined,
              notebookCell: NotebookCell) {
    this.execPath = config.getExecPath();
    this.execFile = path.join(
      this.execPath, rubyConfig?.get('execFilename') || 'codebook_md_exec.rb');
    this.contentConfig = new codebook.CodeBlockConfig(
      notebookCell,
      workspace.getConfiguration('codebook-md.ruby.output'),
      "#",
    );
  }
}
```

Decisions to make deliberately:

- **Output markers.** If the runtime can print anything before or after the
  user's code, wrap `innerScope` in `StartOutput`/`EndOutput`. If the process
  emits only what the user wrote (as with shell), skip them.
- **Comment prefixes.** These drive per-cell `[>]` directive parsing. Include
  block-comment markers too, the way `javascript.ts` lists
  `["//", "/*", "*/"]`.
- **Temp file vs. inline.** Most languages write a temp file and execute it.
  `shell.ts` instead passes a script to `bash -c`.

## 3. Wire the dispatch

In `NewExecutableCell()` in `src/codebook.ts`, add a case and an import:

```ts
import * as ruby from "./languages/ruby";

// ...
case languageRuby.nameId:
  if (io.commandNotOnPath("ruby", "https://www.ruby-lang.org/")) {
    return new unsupported.Cell(notebookCell);
  }
  return new ruby.Cell(notebookCell);
```

The `commandNotOnPath` check gives the user an install link instead of an
opaque spawn error. If the command itself is configurable, construct the cell
first and check `cell.config.execCmd`, as `python` does.

## 4. Declare settings

In `package.json` `contributes.configuration.properties`, add a
`codebook-md.ruby` block mirroring an existing language — the exec options plus
a nested `output` block with `showExecutableCodeInOutput`, `replaceOutputCell`,
`showTimestamp`, and `timestampTimezone`.

Any setting that should be editable from the Settings UI must be declared as a
flat property; see
[`.agents/references/configuration.md`](../../references/configuration.md).

## 5. Add language-specific config options

If the language has per-cell config the modal should expose, add a case to
`getLanguageConfigOptions()` in `src/cellConfig.ts` alongside `go`, `bash`, and
`python`.

## 6. Test and document

- Add `src/test/languages/ruby.test.ts`, mirroring
  `src/test/languages/go.test.ts`. Cover the constructed command, the generated
  `executableCode`, comment-prefix parsing, and the missing-binary fallback.
- Add the language to the supported list in `README.md`.
- Add it to `src/webview/templates/documentation.html`, including its index.
- Add a `CHANGELOG.md` entry.

## Verify

```bash
npm run compile && npm run lint && npm test
```

Then run the Extension Development Host, open a markdown file with a fenced
block in the new language, and execute it. Confirm output is captured, the code
appears in the output when `showExecutableCodeInOutput` is on, and a
`# [>].output.showTimestamp(false)` directive takes effect.

Commit as `feat(languages): add <language> execution support`.
