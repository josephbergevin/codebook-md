import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell, WorkspaceConfiguration, window } from "vscode";
import { workspace } from "vscode";
import * as io from "../io";

export class Cell implements codebook.Cell {
    innerScope: string;
    executableCode: string;
    execCmd: string;
    execArgs: string[];
    config: Config;

    constructor(notebookCell: NotebookCell | undefined) {
        // get the configuration for the bash language

        // form the innerScope with lines that don't start with # or set -e
        if (notebookCell) {
            this.config = new Config(workspace.getConfiguration('codebook-md.bash'), notebookCell);
            // this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#", "set -e");
            this.innerScope = this.config.contentConfig.innerScope;
        } else {
            // another language is using this class to execute the call through bash
            this.config = new Config(undefined, undefined);
            this.innerScope = '';
        }

        // if the innerScope is a single line, and execSingleLineAsCommand is true, execute it as a command with args
        if (this.config.execSingleLineAsCommand && this.innerScope.split('\n').length === 1) {
            this.executableCode = "";
            // use io.parseCommandAndArgs to get the command and arguments
            const parsed = io.parseCommandAndArgs(this.innerScope);
            this.execCmd = parsed.cmd;
            this.execArgs = parsed.args;

            // post a notification that the command is being executed
            window.showInformationMessage(`Executing command: ${this.execCmd} ${this.execArgs.join(' ')}`);
        } else {
            // form the executable code as a bash script to execute from a file
            this.executableCode = "#!/bin/bash\n\n";
            this.executableCode += "set -e\n\n";
            this.executableCode += this.innerScope;

            // create the directory and main file
            mkdirSync(this.config.execDir, { recursive: true });
            writeFileSync(this.config.execFile, this.executableCode);

            this.execCmd = 'bash';
            this.execArgs = [this.config.execFile];
        }
    }

    contentCellConfig(): codebook.CellContentConfig {
        if (this.config.contentConfig) {
            return this.config.contentConfig;
        } else {
            return new codebook.CellContentConfig(undefined, "#");
        }
    }

    execute(): ChildProcessWithoutNullStreams {
        return io.spawnCommand(this.execCmd, this.execArgs, { cwd: this.config.execDir });
    }

    afterExecuteFuncs(): codebook.AfterExecuteFunc[] {
        return this.config.afterExecFuncs;
    }
}

export class Config {
    contentConfig: codebook.CellContentConfig;
    execDir: string;
    execFile: string;
    execSingleLineAsCommand: boolean;
    afterExecFuncs: codebook.AfterExecuteFunc[];

    constructor(bashConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
        this.contentConfig = new codebook.CellContentConfig(notebookCell, "#");
        this.execDir = config.getTempPath();
        this.execFile = path.join(this.execDir, bashConfig?.get('execFilename') || 'codebook_md_exec.sh');
        this.execSingleLineAsCommand = bashConfig?.get('execSingleLineAsCommand') || false;
        this.afterExecFuncs = [];
    }
}
