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
    this.config = new Config(workspace.getConfiguration('codebook-md.javascript'), notebookCell);

    // form the innerScope with lines that don't start with # or set -e
    this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#");

    // form the executable code
    this.executableCode = this.innerScope;

    // set the mainExecutable using the node command
    this.mainExecutable = new codebook.Command('node', [this.config.execFile], this.config.execDir);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      // create the directory and main file
      io.writeDirAndFileSyncSafe(this.config.execDir, this.config.execFile, this.executableCode);
    });
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
    return this.config.contentConfig;
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

  allowKeepOutput(): boolean {
    return this.executables().length <= 1;
  }
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execDir: string;
  execFile: string;

  constructor(javascriptConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
    this.execDir = config.getTempPath();
    this.execFile = path.join(this.execDir, javascriptConfig?.get('execFilename') || 'codebook_md_exec.js');
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-javascript.bash.output'), "//");
  }
}
