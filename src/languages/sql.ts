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
        this.config = new Config(workspace.getConfiguration('codebook-md.sql'));

        // form the innerScope, skipping lines that start with the sql comment character #
        this.innerScope = codebook.NotebookCellToInnerScope(notebookCell, "--");

        // form the executable code
        this.config.execOptions.push("-e " + '"' + this.innerScope.trim() + '"');
        this.executableCode = this.config.execCmd + " " + this.config.execOptions.join(" ");
    }

    execute(): ChildProcessWithoutNullStreams {
        // call the executable cli command using bash.Cell.execute
        // create a new bash cell with a null notebook cell, then add the executable code to it
        const cell = new bash.Cell(undefined);
        console.log("executing (from bash): " + this.executableCode);
        cell.executableCode += this.executableCode;
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
    execDir: string;
    execFile: string;
    execFilename: string;
    execCmd: string;
    execOptions: string[];
    database: string;
    host: string;
    port: string;
    user: string;
    password: string;
    afterExecutionFuncs: (() => void)[];

    constructor(sqlConfig: WorkspaceConfiguration | undefined) {
        this.execDir = config.getTempPath();
        this.execFilename = sqlConfig?.get('execFilename') || 'codebook_md_exec.sql';
        this.execFile = path.join(this.execDir, this.execFilename);
        this.execCmd = sqlConfig?.get('execCmd') || '';
        this.execOptions = sqlConfig?.get('execOptions') || [];
        this.host = sqlConfig?.get('host') || '';
        this.port = sqlConfig?.get('port') || '';
        this.user = sqlConfig?.get('user') || '';
        this.password = sqlConfig?.get('password') || '';
        this.database = sqlConfig?.get('database') || '';

        // add the host, port, user, and password to the execCmdOptions
        if (this.database !== '') {
            this.execOptions.push(this.database);
        }
        if (this.host !== '') {
            this.execOptions.push("--host=" + this.host);
        }
        if (this.port !== '') {
            this.execOptions.push("-P " + this.port);
        }
        if (this.user !== '') {
            this.execOptions.push("-u " + this.user);
        }

        // add the afterExecution functions
        this.afterExecutionFuncs = [];
    }
}
