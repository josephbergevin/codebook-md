import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";
import * as io from "../io";

export class Cell implements codebook.ExecutableCell {
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

    executableCodeToDisplay(): string {
        return this.innerScope;
    }

    execute(): ChildProcessWithoutNullStreams {
        // create the directory and main file
        mkdirSync(this.config.execDir, { recursive: true });
        writeFileSync(this.config.execFile, this.executableCode);
        return io.spawnCommand('node', [this.config.execFile], { cwd: this.config.execDir });
    }

    postExecutables(): codebook.Executable[] {
        return this.config.postExecutables;
    }
}

export class Config {
    contentConfig: codebook.CellContentConfig;
    execDir: string;
    execFile: string;
    postExecutables: codebook.Executable[];

    constructor(javascriptConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, javascriptConfig?.get('execFilename') || 'codebook_md_exec.js');
        this.contentConfig = new codebook.CellContentConfig(notebookCell, "//");
        this.postExecutables = [];
    }
}
