import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import * as io from "../io";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

export class Cell implements codebook.ExecutableCell {
  innerScope: string;
  executableCode: string;
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell) {
    // get the configuration for the bash language
    this.config = new Config(workspace.getConfiguration('codebook-md.typescript'), notebookCell);

    // form the innerScope with lines that don't start with # or set -e
    this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#");

    // form the executable code with output markers for proper output capture
    this.executableCode = `console.log("${codebook.StartOutput}");\n${this.innerScope}\nconsole.log("${codebook.EndOutput}");`;

    // set the mainExecutable using the ts-node command
    this.mainExecutable = new codebook.Command('ts-node', [this.config.execFile], this.config.execPath);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      // create the directory and main file
      io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, this.executableCode);
    });
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
    return this.config.contentConfig;
  }

  allowKeepOutput(): boolean {
    return this.executables().length <= 1;
  }

  commentPrefixes(): string[] {
    return ["//", "/*", "*/"];
  }

  defaultCommentPrefix(): string {
    return "//";
  }

  toString(): string {
    return this.innerScope;
  }

  execute(): ChildProcessWithoutNullStreams {
    // use the mainExecutable to execute the bash script
    return this.mainExecutable.execute();
  }

  executables(): codebook.Executable[] {
    return [this.mainExecutable, ...this.postExecutables];
  }
}

export class Config {
  execPath: string; execFile: string;
  contentConfig: codebook.CodeBlockConfig;

  constructor(typescriptConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
    this.execPath = config.getExecPath();
    this.execFile = path.join(this.execPath, typescriptConfig?.get('execFilename') || 'codebook_md_exec.ts');
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.typescript.output'), "//");
  }
}
