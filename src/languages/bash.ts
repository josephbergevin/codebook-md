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
  execCmd: string;
  execArgs: string[];
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell | undefined) {
    // get the configuration for the bash language

    // form the innerScope with lines that don't start with # or set -e
    if (notebookCell) {
      this.config = new Config(workspace.getConfiguration('codebook-md.bash'), notebookCell);
      // this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#", "set -e");
      this.innerScope = this.config.contentConfig.innerScope;
    } else {
      // another language is using this class to execute the call through bash
      this.config = new Config(undefined, undefined);
      this.innerScope = '';
    }


    // form the executable code as a bash script to execute from a file
    this.executableCode = "#!/bin/bash\n\n";
    // if innerScope doesn't contain 'set -e\n', add it
    if (!this.innerScope.includes("set -e\n")) {
      this.executableCode += "set -e\n\n";
    }

    // and finally, add the innerScope to the executable code
    this.executableCode += this.innerScope;


    this.execCmd = 'bash';
    this.execArgs = [this.config.execFile];

    // set the mainExecutable to the bash script
    this.mainExecutable = new codebook.Command(this.execCmd, this.execArgs, this.config.execPath);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      // create the directory and main file
      io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, this.executableCode);
    });
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
    if (this.config.contentConfig) {
      return this.config.contentConfig;
    } else {
      return new codebook.CodeBlockConfig(undefined, workspace.getConfiguration('codebook-md.bash.output'), "#");
    }
  }

  allowKeepOutput(): boolean {
    return this.executables.length == 1;
  }


  commentPrefixes(): string[] {
    return ["#"];
  }

  defaultCommentPrefix(): string {
    return "#";
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
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  execFile: string;
  execSingleLineAsCommand: boolean;

  constructor(bashConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.bash.output'), "#");
    // First try to get the configured root path, then fall back to workspace folder
    const rootPath = workspace.getConfiguration('codebook-md').get<string>('rootPath');
    const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;

    // If rootPath is '${workspaceFolder}', use the actual workspace folder path
    this.execPath = (rootPath === '${workspaceFolder}' ? workspaceFolder : rootPath) ||
      workspaceFolder ||
      config.getExecPath();
    this.execFile = path.join(this.execPath, bashConfig?.get('execFilename') || 'codebook_md_exec.sh');
    this.execSingleLineAsCommand = bashConfig?.get('execSingleLineAsCommand') || false;
  }
}
