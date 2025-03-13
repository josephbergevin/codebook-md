import { ChildProcessWithoutNullStreams } from "child_process";
import * as codebook from "../codebook";
import * as io from "../io";
import { existsSync } from "fs";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

export class Cell implements codebook.ExecutableCell {
  innerScope: string;
  executableCode: string;
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell | undefined) {
    // get the configuration for the shell language
    this.config = new Config(workspace.getConfiguration('codebook-md.shell'), notebookCell);
    this.innerScope = this.config.contentConfig.innerScope;

    this.executableCode = "";
    // use io.parseCommands to get the commands and arguments from the innerScope
    const cmds = codebook.parseCommands(this.innerScope, this.config.execDir);

    // no commands found: notify a warning and return
    if (cmds.length === 0) {
      this.mainExecutable = new codebook.Command("echo", ["No commands found in cell"], ".");
      return;
    }

    // Ensure the execution directory exists
    io.mkdirIfNotExistsSafe(this.config.execDir);

    // get the first command and arguments
    this.mainExecutable = cmds[0];

    // Override the working directory if it doesn't exist
    if (!existsSync(this.mainExecutable.cwd)) {
      console.warn(`Working directory ${this.mainExecutable.cwd} does not exist, falling back to ${this.config.execDir}`);
      this.mainExecutable = new codebook.Command(
        this.mainExecutable.command,
        this.mainExecutable.args,
        this.config.execDir
      );
    }

    if (cmds.length === 1) {
      return;
    }

    // if there are more commands, add them to the postExecutables with the same directory handling
    const additionalCmds = cmds.slice(1);
    additionalCmds.forEach(cmd => {
      if (!existsSync(cmd.cwd)) {
        cmd = new codebook.Command(cmd.command, cmd.args, this.config.execDir);
      }
      this.postExecutables.push(cmd);
    });
  }

  contentCellConfig(): codebook.CellContentConfig {
    return this.config.contentConfig;
  }

  toString(): string {
    return this.innerScope;
  }

  execute(): ChildProcessWithoutNullStreams {
    return this.mainExecutable.execute();
  }

  // executables returns the mainExecutable and postExecutables
  executables(): codebook.Executable[] {
    return [this.mainExecutable, ...this.postExecutables];
  }
}

export class Config {
  contentConfig: codebook.CellContentConfig;
  execDir: string;

  constructor(shellConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
    this.contentConfig = new codebook.CellContentConfig(notebookCell, workspace.getConfiguration('codebook-md.shell.output'), "#");
    this.execDir = codebook.newCodeDocumentCurrentFile().fileDir;
  }
}
