import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import * as io from "../io";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

export class Cell implements codebook.Cell {
    innerScope: string;
    executableCode: string;

    execCmd: string;
    execArgs: string[];
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
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    }

    execute(): ChildProcessWithoutNullStreams {
        // create the directory and main file
        mkdirSync(this.config.execDir, { recursive: true });
        writeFileSync(this.config.execFile, this.executableCode);

        // if the exececutable code is to be printed, then add an output cell with the executable code
        if (this.config.contentConfig.output.showExecutableCodeInOutput) {
            console.log("adding executable code to output:", this.innerScope);
            this.config.contentConfig.output.prependToOutputStrings.push(this.innerScope);
        }

        return io.spawnCommand(this.execCmd, this.execArgs, { cwd: this.config.execDir });
    }

    afterExecution(): void {
        // remove the executable file
        // unlinkSync(this.config.execFile);
        // run the afterExecution functions
        this.config.afterExecutionFuncs.forEach(func => func());
    }
}

export class Config {
    contentConfig: codebook.CellContentConfig;
    execDir: string;
    execFile: string;
    execFilename: string;
    execCmd: string;
    execOptions: string[];
    afterExecutionFuncs: (() => void)[];

    constructor(sqlConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
        this.contentConfig = new codebook.CellContentConfig(notebookCell, "--");
        this.execDir = config.getTempPath();
        this.execFilename = sqlConfig?.get('execFilename') || 'codebook_md_exec.sql';
        this.execFile = path.join(this.execDir, this.execFilename);
        this.execCmd = sqlConfig?.get('execCmd') || '';
        this.execOptions = sqlConfig?.get('execOptions') || [];

        // add the afterExecution functions
        this.afterExecutionFuncs = [];
    }
}
