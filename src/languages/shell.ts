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
  commandCount: number = 0;
  config: Config;

  constructor(notebookCell: NotebookCell | undefined) {
    // get the configuration for the shell language
    this.config = new Config(workspace.getConfiguration('codebook-md.shell'), notebookCell);
    this.innerScope = this.config.contentConfig.innerScope;

    this.executableCode = "";

    // Create a shell script that will run all commands sequentially
    this.executableCode = "#!/bin/bash\nset -e\n\n";

    // Get all commands from the inner scope
    const cmds = codebook.parseCommands(this.innerScope, this.config.execDir);

    this.commandCount = cmds.length;
    // no commands found: notify a warning and return
    if (this.commandCount === 0) {
      this.mainExecutable = new codebook.Command("echo", ["No commands found in cell"], ".");
      return;
    }

    // Ensure the execution directory exists
    io.mkdirIfNotExistsSafe(this.config.execDir);

    // Create the full script content with all commands
    cmds.forEach(cmd => {
      // Add command to script without wait output
      this.executableCode += `${cmd.command} ${cmd.args.map(arg => `"${arg}"`).join(' ')}\n`;
    });

    // Set the main executable to run our script
    this.mainExecutable = new codebook.Command("bash", ["-c", this.executableCode], this.config.execDir);

    // Set a clean display of the commands for output
    this.mainExecutable.setCommandToDisplay(this.innerScope.trim());

    // Override the working directory if it doesn't exist
    if (!existsSync(this.mainExecutable.cwd)) {
      console.warn(`Working directory ${this.mainExecutable.cwd} does not exist, falling back to ${this.config.execDir}`);
      this.mainExecutable = new codebook.Command(
        this.mainExecutable.command,
        this.mainExecutable.args,
        this.config.execDir
      );
    }
  }

  allowKeepOutput(): boolean {
    return this.commandCount === 1;
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

  executables(): codebook.Executable[] {
    // All commands are now part of a single script execution
    return [this.mainExecutable];
  }
}

export class Config {
  contentConfig: codebook.CellContentConfig;
  execDir: string;

  constructor(shellConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
    this.contentConfig = new codebook.CellContentConfig(notebookCell, workspace.getConfiguration('codebook-md.shell.output'), "#");
    // First try to get the configured root path, then fall back to workspace folder
    const rootPath = workspace.getConfiguration('codebook-md').get<string>('rootPath');
    const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;

    // If rootPath is '${workspaceFolder}', use the actual workspace folder path
    this.execDir = (rootPath === '${workspaceFolder}' ? workspaceFolder : rootPath) ||
      workspaceFolder ||
      codebook.newCodeDocumentCurrentFile().fileDir;
  }
}
