import { ChildProcessWithoutNullStreams } from "child_process";
import * as codebook from "../codebook";
import * as io from "../io";
import { existsSync } from "fs";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";
import * as config from "../config";
import * as path from "path";
import * as shellSession from "../shellSession";

export class Cell implements codebook.ExecutableCell {
  innerScope: string;
  executableCode: string;
  mainExecutable: codebook.Executable;
  postExecutables: codebook.Executable[] = [];
  commandCount: number = 0;
  config: Config;

  constructor(notebookCell: NotebookCell | undefined) {
    // get the configuration for the shell language - shell/bash cells are both
    // handled here, and their settings are declared under 'codebook-md.bash'
    this.config = new Config(workspace.getConfiguration('codebook-md.bash'), notebookCell);
    this.innerScope = this.config.contentConfig.innerScope;

    // In a persistent session the cell runs inside the notebook's long-lived
    // shell, so its cd/export/variables carry over to the next session cell
    if (this.config.persistentSession && notebookCell) {
      this.commandCount = codebook.parseCommands(this.innerScope, this.config.execPath).length;
      this.executableCode = this.innerScope.trim();
      if (this.config.contentConfig.execPath) {
        // [>].execPath becomes a cd - and, like any cd in a session, it sticks
        const target = path.resolve(this.config.execPath, this.config.contentConfig.execPath);
        this.executableCode = `cd ${shellSession.shellQuote(target)} || return\n${this.executableCode}`;
      }
      this.mainExecutable = new SessionCommand(
        notebookCell.notebook.uri.toString(), this.executableCode, this.config.execPath, this.innerScope.trim());
      return;
    }

    // Check if cell has a specific execPath configured
    if (this.config.contentConfig.execPath) {
      this.config.execPath = this.config.contentConfig.execPath;
    }

    // commandCount is only used to decide whether prior output may be kept
    this.commandCount = codebook.parseCommands(this.innerScope, this.config.execPath).length;

    // no commands found: notify a warning and return
    if (this.commandCount === 0) {
      this.executableCode = "";
      this.mainExecutable = new codebook.Command("echo", ["No commands found in cell"], ".");
      return;
    }

    // Build the script from the cell contents verbatim. The script is handed to
    // `bash -c`, so bash does its own parsing - pipes, redirects, globs, quoting,
    // command substitution and multi-line constructs all behave as written.
    // Tokenizing the cell and re-quoting each argument here would turn shell
    // operators such as `|` into literal arguments.
    this.executableCode = `#!/bin/bash\nset -e\n\n${this.innerScope.trim()}\n`;

    // Set the main executable to run our script
    let command = new codebook.Command("bash", ["-c", this.executableCode], this.config.execPath);

    // Set a clean display of the commands for output
    command.setCommandToDisplay(this.innerScope.trim());

    // Override the working directory if it doesn't exist
    if (!existsSync(command.cwd)) {
      console.warn(`Working directory ${command.cwd} does not exist, falling back to ${this.config.execPath}`);
      command = new codebook.Command(
        command.command,
        command.args,
        this.config.execPath
      );
    }
    this.mainExecutable = command;
  }

  allowKeepOutput(): boolean {
    return this.commandCount === 1;
  }


  executionPath(): string {
    return this.config.execPath;
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

/**
 * SessionCommand runs a cell's script in the notebook's persistent shell session
 * rather than in a fresh process.
 */
export class SessionCommand implements codebook.Executable {
  constructor(
    readonly sessionKey: string,
    readonly script: string,
    readonly cwd: string,
    readonly commandToDisplay: string,
  ) { }

  execute(): ChildProcessWithoutNullStreams {
    io.mkdirIfNotExistsSafe(this.cwd);
    const session = shellSession.getSession(this.sessionKey, this.cwd, io.getMergedEnvironmentVariables());
    // CellRun provides the parts of the ChildProcess interface the kernel uses
    return session.run(this.script) as unknown as ChildProcessWithoutNullStreams;
  }

  toString(): string {
    return this.commandToDisplay;
  }

  jsonStringify(): string {
    return JSON.stringify({ session: this.sessionKey, script: this.script, cwd: this.cwd });
  }
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  persistentSession: boolean;

  constructor(bashConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.bash.output'), "#");

    // The per-cell value saved by the config modal wins over the setting
    this.persistentSession = codebook.resolveSetting<boolean>(
      this.contentConfig.cellConfig, bashConfig, 'persistentSession', false) === true;

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
