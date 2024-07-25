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
        this.config = new Config(workspace.getConfiguration('codebook-md.javascript'), notebookCell);

        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#");

        // form the executable code
        this.executableCode = this.innerScope;
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    }

    execute(): ChildProcessWithoutNullStreams {
        // create the directory and main file
        mkdirSync(this.config.execDir, { recursive: true });
        writeFileSync(this.config.execFile, this.executableCode);
        return exec.spawnCommand('node', [this.config.execFile], { cwd: this.config.execDir });
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
    afterExecutionFuncs: (() => void)[];

    constructor(javascriptConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, javascriptConfig?.get('execFilename') || 'codebook_md_exec.js');
        this.contentConfig = new codebook.CellContentConfig(notebookCell, "//");
        this.afterExecutionFuncs = [];
    }
}
