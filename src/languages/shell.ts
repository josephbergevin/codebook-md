import { ChildProcessWithoutNullStreams } from "child_process";
import * as codebook from "../codebook";
import * as io from "../io";
import { existsSync } from "fs";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";
import * as config from "../config";

export class Cell implements codebook.ExecutableCell {
  innerScope: string;
  executableCode: string;
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  commandCount: number = 0;
  config: Config;

  constructor(notebookCell: NotebookCell | undefined) {
    // get the configuration for the shell language - shell/bash cells are both
    // handled here, and their settings are declared under 'codebook-md.bash'
    this.config = new Config(workspace.getConfiguration('codebook-md.bash'), notebookCell);
    this.innerScope = this.config.contentConfig.innerScope;

    // Check if cell has a specific execPath configured
    if (this.config.contentConfig.execPath) {
      this.config.execPath = this.config.contentConfig.execPath;
    }

    this.executableCode = "";

    // Create a shell script that will run all commands sequentially
    this.executableCode = "#!/bin/bash\nset -e\n\n";

    // Get all commands from the inner scope
    const cmds = codebook.parseCommands(this.innerScope, this.config.execPath);

    this.commandCount = cmds.length;
    // no commands found: notify a warning and return
    if (this.commandCount === 0) {
      this.mainExecutable = new codebook.Command("echo", ["No commands found in cell"], ".");
      return;
    }

    // Ensure the execution directory exists
    io.mkdirIfNotExistsSafe(this.config.execPath);

    // Create the full script content with all commands
    // Modify to ensure each command's output is captured and displayed
    cmds.forEach(cmd => {
      // Execute each command and echo its output directly
      // This ensures the output is captured in stdout
      this.executableCode += `${cmd.command} ${cmd.args.map(arg => `"${arg}"`).join(' ')}\n`;
    });

    // Set the main executable to run our script
    this.mainExecutable = new codebook.Command("bash", ["-c", this.executableCode], this.config.execPath);

    // Set a clean display of the commands for output
    this.mainExecutable.setCommandToDisplay(this.innerScope.trim());

    // Override the working directory if it doesn't exist
    if (!existsSync(this.mainExecutable.cwd)) {
      console.warn(`Working directory ${this.mainExecutable.cwd} does not exist, falling back to ${this.config.execPath}`);
      this.mainExecutable = new codebook.Command(
        this.mainExecutable.command,
        this.mainExecutable.args,
        this.config.execPath
      );
    }
  }

  allowKeepOutput(): boolean {
    return this.commandCount === 1;
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
    return this.config.contentConfig;
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
    return this.mainExecutable.execute();
  }

  executables(): codebook.Executable[] {
    // All commands are now part of a single script execution
    return [this.mainExecutable];
  }
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;

  constructor(bashConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.bash.output'), "#");

    // Use config.getExecPath() which properly handles execution path resolution
    // This respects the codebook-md.execPath setting and rootPath configuration
    try {
      this.execPath = config.getExecPath();
    } catch (error) {
      // Fallback to workspace folder if getExecPath() throws an error
      const workspaceFolder = workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.execPath = workspaceFolder || codebook.newCodeDocumentCurrentFile().fileDir;
    }
  }
}
