import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as md from "../md";
import * as vscode from "vscode";
import { workspace } from "vscode";
import * as exec from "../exec";

export let executeCells = (cells: md.Cell[]): ChildProcessWithoutNullStreams => {
    let bash = new Cell(cells, workspace.getConfiguration('codebook-md.bash'));

    console.log("bash cell contents", bash.executableCode);

    // create the directory and main file
    mkdirSync(bash.config.execDir, { recursive: true });
    writeFileSync(bash.config.execFile, bash.executableCode);

    return exec.spawnCommand('bash', [bash.config.execFile], { cwd: bash.config.execDir });
};

export class Cell {
    innerScope: string;
    executableCode: string;
    config: Config;

    constructor(cells: md.Cell[], bashConfig: vscode.WorkspaceConfiguration | undefined) {
        this.config = new Config(bashConfig);

        const cell = cells[cells.length - 1];
        let lines = cell.contents.split("\n");
        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = "";
        for (let line of lines) {
            if (line.startsWith("#")) {
                continue;
            } else if (line.startsWith("set -e")) {
                continue;
                // or if the line is empty
            } else if (line.trim() === "") {
                continue;
            }

            // otherwise, add the line to the innerScope
            this.innerScope += line + "\n";
        }

        this.executableCode = "#!/bin/bash\n\n";
        this.executableCode += "set -e\n\n";
        this.executableCode += "echo !!output-start-cell\n\n";
        this.executableCode += this.innerScope;
    }
}

export class Config {
    execDir: string;
    execFile: string;

    constructor(bashConfig: vscode.WorkspaceConfiguration | undefined) {
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, 'script.sh');
    }
}
