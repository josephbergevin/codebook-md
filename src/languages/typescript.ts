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

    // form the executable code
    this.executableCode = this.innerScope;

    // set the mainExecutable using the ts-node command
    this.mainExecutable = new codebook.Command('ts-node', [this.config.execFile], this.config.execDir);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      // create the directory and main file
      io.writeDirAndFileSyncSafe(this.config.execDir, this.config.execFile, this.executableCode);
    });
  }

  contentCellConfig(): codebook.CellContentConfig {
    return this.config.contentConfig;
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
  execDir: string; execFile: string;
  contentConfig: codebook.CellContentConfig;

  constructor(typescriptConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
    this.execDir = config.getTempPath();
    this.execFile = path.join(this.execDir, typescriptConfig?.get('execFilename') || 'codebook_md_exec.ts');
    this.contentConfig = new codebook.CellContentConfig(notebookCell, workspace.getConfiguration('codebook-md.typescript.output'), "//");
  }
}
