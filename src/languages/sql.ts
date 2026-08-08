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

  constructor(notebookCell: NotebookCell) {
    // get the configuration for the bash language
    this.config = new Config(workspace.getConfiguration('codebook-md.sql'), notebookCell);

    // Check if cell has a specific execPath configured
    if (this.config.contentConfig.execPath) {
      this.config.execPath = this.config.contentConfig.execPath;
      // Update execFile with the new execPath
      this.config.execFile = path.join(this.config.execPath, path.basename(this.config.execFile));
    }

    // form the innerScope, skipping lines that start with the sql comment character #
    console.log("cellConfig: ", this.config.contentConfig.jsonStringify());
    // the innerScope should only contain the sql command
    const fullInnerScope = this.config.contentConfig.innerScope.trim();

    // split on semicolons to get the sql commands, filtering out empty strings and trimming whitespace
    const sqlStatements = fullInnerScope.split(";").filter((sqlStatement) => sqlStatement.trim() !== "").map((sqlStatement) => sqlStatement.trim() + ";");
    console.log("sqlStatements: ", sqlStatements);

    // the first command is the main command
    this.innerScope = sqlStatements[0] ?? "";

    // set the execCmd and execArgs to execute the bash script
    this.execCmd = 'bash';
    this.execArgs = [this.config.execFile];

    // Without a CLI command there is nothing to run - fail with something the
    // user can act on rather than emitting a script that starts with a bare flag
    if (this.config.execCmd === "") {
      this.executableCode = "";
      this.mainExecutable = new codebook.Command("echo", [
        "No SQL command configured. Set 'codebook-md.sql.execCmd' (for example 'mysql' or 'psql') in your settings, or in this cell's configuration."
      ], this.config.execPath);
      return;
    }

    this.executableCode = this.scriptForStatement(this.innerScope);

    // set the mainExecutable to the bash script
    this.mainExecutable = new codebook.Command(this.execCmd, this.execArgs, this.config.execPath);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      // create the directory and main file
      // run in a try-catch block to avoid errors if the directory already exists
      io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, this.executableCode);
    });
    this.mainExecutable.setCommandToDisplay(this.innerScope);

    // if there are more than one sql commands, add the rest as postExecutables
    if (sqlStatements.length > 1) {
      sqlStatements.slice(1).forEach((sqlStatement) => {
        // form the executable code as a bash script that will execute the sql code from a file
        const postExecutable = new codebook.Command(this.execCmd, this.execArgs, this.config.execPath);
        postExecutable.setCommandToDisplay(sqlStatement);
        postExecutable.addBeforeExecuteFunc(() => {
          try {
            io.writeDirAndFileSyncSafe(
              this.config.execPath, this.config.execFile, this.scriptForStatement(sqlStatement));
          } catch (error) {
            console.error("error writing file: ", error);
          }
        });
        this.postExecutables.push(postExecutable);
      });
    }
  }

  // scriptForStatement builds the bash script that runs a single SQL statement.
  // execOptions holds the connection options only - the statement is appended
  // per call, so that running statement N does not also re-run statement 1.
  private scriptForStatement(sqlStatement: string): string {
    const connectionOptions = this.config.execOptions.join(" ");
    return "#!/bin/bash\n\n"
      + "set -e\n\n"
      + `echo "${codebook.StartOutput}"\n`
      + `${this.config.execCmd} ${connectionOptions} -e "${sqlStatement}"`
      + `\necho "${codebook.EndOutput}"`;
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
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

  allowKeepOutput(): boolean {
    return this.executables().length <= 1;
  }

  commentPrefixes(): string[] {
    return ["--", "#"];
  }

  defaultCommentPrefix(): string {
    return "--";
  }
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  execFile: string;
  execFilename: string;
  execCmd: string;
  execOptions: string[];

  constructor(sqlConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.sql.output'), "--");
    this.execPath = config.getExecPath();

    const cellConfig = this.contentConfig.cellConfig;
    this.execFilename = codebook.resolveSetting(cellConfig, sqlConfig, 'execFilename', 'codebook_md_exec.sql');
    this.execFile = path.join(this.execPath, this.execFilename);
    this.execCmd = codebook.resolveSetting(cellConfig, sqlConfig, 'execCmd', '');
    this.execOptions = codebook.resolveSetting<string[]>(cellConfig, sqlConfig, 'execOptions', []);
  }
}
