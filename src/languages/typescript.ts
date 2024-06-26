import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import * as vscode from "vscode";
import { workspace } from "vscode";
import * as exec from "../io";

export class Cell implements codebook.Cell {
    innerScope: string; executableCode: string; config: Config;

    constructor(notebookCell: vscode.NotebookCell) {
        // get the configuration for the bash language
        this.config = new Config(workspace.getConfiguration('codebook-md.typescript'));

        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = codebook.notebookCellToInnerScope(notebookCell, "#");

        // form the executable code
        this.executableCode = this.innerScope;
    }

    execute(): ChildProcessWithoutNullStreams {
        // create the directory and main file
        mkdirSync(this.config.execDir, { recursive: true });
        writeFileSync(this.config.execFile, this.executableCode);
        return exec.spawnCommand('ts-node', [this.config.execFile], { cwd: this.config.execDir });
    }
}

export class Config {
    execDir: string; execFile: string;

    constructor(typescriptConfig: vscode.WorkspaceConfiguration | undefined) {
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, typescriptConfig?.get('execFilename') || 'codebook_md_exec.ts');
    }
}
