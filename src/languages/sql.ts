import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
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
        this.innerScope = this.config.contentConfig.innerScope.trim();

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
        this.mainExecutable = new codebook.Command(this.execCmd, this.execArgs, this.config.execDir);
        this.mainExecutable.addBeforeExecuteFunc(() => {
            // create the directory and main file
            mkdirSync(this.config.execDir, { recursive: true });
            writeFileSync(this.config.execFile, this.executableCode);
        });
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    }

    executableCodeToDisplay(): string {
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
    contentConfig: codebook.CellContentConfig;
    execDir: string;
    execFile: string;
    execFilename: string;
    execCmd: string;
    execOptions: string[];

    constructor(sqlConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
        this.contentConfig = new codebook.CellContentConfig(notebookCell, workspace.getConfiguration('codebook-md.sql.output'), "--");
        this.execDir = config.getTempPath();
        this.execFilename = sqlConfig?.get('execFilename') || 'codebook_md_exec.sql';
        this.execFile = path.join(this.execDir, this.execFilename);
        this.execCmd = sqlConfig?.get('execCmd') || '';
        this.execOptions = sqlConfig?.get('execOptions') || [];

        // add the afterExecution functions
    }
}
