import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as md from "../md";
import * as vscode from "vscode";
import { workspace } from "vscode";
import * as exec from "../exec";
export let executeCell = (cell: md.Cell): ChildProcessWithoutNullStreams => {
    const typescriptCell = new Cell(cell, workspace.getConfiguration('codebook-md.typescript'));
    return typescriptCell.execute();
};

export class Cell {
    innerScope: string; executableCode: string; config: Config;

    constructor(cell: md.Cell, typescriptConfig: vscode.WorkspaceConfiguration | undefined) {
        this.config = new Config(typescriptConfig);

        let lines = cell.contents.split("\n");
        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = "";
        for (let line of lines) {
            if (line.startsWith("#")) {
                continue;
            } else if (line.trim() === "") {
                continue;
            }

            // otherwise, add the line to the innerScope
            this.innerScope += line + "\n";
        }

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
        this.execFile = path.join(this.execDir, 'script.ts');
    }
}
