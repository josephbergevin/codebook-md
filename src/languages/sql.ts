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

    // form the innerScope, skipping lines that start with the sql comment character #
    console.log("cellConfig: ", this.config.contentConfig.jsonStringify());
    // the innerScope should only contain the sql command
    const fullInnerScope = this.config.contentConfig.innerScope.trim();

    // split on semicolons to get the sql commands, filtering out empty strings and trimming whitespace
    const sqlStatements = fullInnerScope.split(";").filter((sqlStatement) => sqlStatement.trim() !== "").map((sqlStatement) => sqlStatement.trim() + ";");
    console.log("sqlStatements: ", sqlStatements);

    // the first command is the main command
    this.innerScope = sqlStatements[0];

    // add the query to the execOptions along with the -e flag - commonly used as the execute flag in sql cli commands
    this.config.execOptions.push("-e " + '"' + this.innerScope + '"');

    // form the executable code as a bash script that will execute the sql code from a file
    this.executableCode = "#!/bin/bash\n\n";
    this.executableCode += "set -e\n\n";
    this.executableCode += this.config.execCmd + " " + this.config.execOptions.join(" ");

    // set the execCmd and execArgs to execute the bash script
    this.execCmd = 'bash';
    this.execArgs = [this.config.execFile];

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
            const sqlCliCommand = "#!/bin/bash\n\nset -e\n\n" + this.config.execCmd + " " + this.config.execOptions.join(" ") + " -e " + '"' + sqlStatement + '"';
            io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, sqlCliCommand);
          } catch (error) {
            console.error("error writing file: ", error);
          }
        });
        this.postExecutables.push(postExecutable);
      });
    }
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
    this.execFilename = sqlConfig?.get('execFilename') || 'codebook_md_exec.sql';
    this.execFile = path.join(this.execPath, this.execFilename);
    this.execCmd = sqlConfig?.get('execCmd') || '';
    this.execOptions = sqlConfig?.get('execOptions') || [];

    // add the afterExecution functions
  }
}
