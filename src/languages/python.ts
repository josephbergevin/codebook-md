import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";
import * as exec from "../io";

export class Cell implements codebook.Cell {
    innerScope: string;
    executableCode: string;
    config: Config;

    constructor(notebookCell: NotebookCell) {
        // get the configuration for the bash language
        this.config = new Config(workspace.getConfiguration('codebook-md.python'));

        // form the innerScope, skipping lines that start with the python comment character #
        this.innerScope = codebook.notebookCellToInnerScope(notebookCell, "#");

        // form the executable code
        this.executableCode = this.innerScope;
    }

    execute(): ChildProcessWithoutNullStreams {
        // create the directory and main file
        mkdirSync(this.config.execDir, { recursive: true });
        writeFileSync(this.config.execFile, this.executableCode);
        return exec.spawnCommand(this.config.execCmd, [this.config.execFile], { cwd: this.config.execDir });
    }
}

export class Config {
    execDir: string;
    execFile: string;
    execCmd: string;

    constructor(pythonConfig: WorkspaceConfiguration | undefined) {
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, pythonConfig?.get('execFilename') || 'codebook_md_exec.py');
        this.execCmd = pythonConfig?.get('execCmd') || 'python3';
    }
}
