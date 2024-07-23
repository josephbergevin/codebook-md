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

    constructor(notebookCell: NotebookCell | undefined) {
        // get the configuration for the bash language
        this.config = new Config(workspace.getConfiguration('codebook-md.bash'));

        // form the innerScope with lines that don't start with # or set -e
        if (notebookCell) {
            this.innerScope = codebook.NotebookCellToInnerScope(notebookCell, "#", "set -e");
        } else {
            this.innerScope = '';
        }

        // form the executable code
        this.executableCode = "#!/bin/bash\n\n";
        this.executableCode += "set -e\n\n";
        this.executableCode += this.innerScope;
    }

    execute(): ChildProcessWithoutNullStreams {
        // create the directory and main file
        mkdirSync(this.config.execDir, { recursive: true });
        writeFileSync(this.config.execFile, this.executableCode);
        return exec.spawnCommand('bash', [this.config.execFile], { cwd: this.config.execDir });
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
    afterExecutionFuncs: (() => void)[];

    constructor(bashConfig: WorkspaceConfiguration | undefined) {
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, bashConfig?.get('execFilename') || 'codebook_md_exec.sh');
        this.afterExecutionFuncs = [];
    }
}
