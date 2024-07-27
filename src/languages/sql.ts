import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as bash from "./bash";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

export class Cell implements codebook.Cell {
    innerScope: string;
    executableCode: string;
    config: Config;

    constructor(notebookCell: NotebookCell) {
        // get the configuration for the bash language
        this.config = new Config(workspace.getConfiguration('codebook-md.sql'), notebookCell);

        // form the innerScope, skipping lines that start with the sql comment character #
        console.log("cellConfig: ", this.config.contentConfig.jsonStringify());
        this.innerScope = this.config.contentConfig.innerScope.trim();

        // form the executable code
        this.config.execOptions.push("-e " + '"' + this.innerScope + '"');
        this.executableCode = this.config.execCmd + " " + this.config.execOptions.join(" ");
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    }

    execute(): ChildProcessWithoutNullStreams {
        // call the executable cli command using bash.Cell.execute
        // create a new bash cell with a null notebook cell, then add the executable code to it
        const cell = new bash.Cell(undefined);
        console.log("executing (from bash): " + this.innerScope);
        cell.executableCode += this.executableCode;

        // if the exececutable code is to be printed, then add an output cell with the executable code
        if (this.config.contentConfig.output.prependExecutableCode) {
            console.log("adding executable code to output:", this.innerScope);
            this.config.contentConfig.output.prependOutputStrings.push(this.innerScope);
        }

        return cell.execute();
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
