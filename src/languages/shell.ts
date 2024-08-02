import { ChildProcessWithoutNullStreams } from "child_process";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

export class Cell implements codebook.ExecutableCell {
    innerScope: string;
    executableCode: string;
    execCmd: codebook.Command;
    config: Config;

    constructor(notebookCell: NotebookCell | undefined) {
        // get the configuration for the shell language

        // form the innerScope with lines that don't start with # or set -e
        this.config = new Config(workspace.getConfiguration('codebook-md.shell'), notebookCell);
        this.innerScope = this.config.contentConfig.innerScope;

        this.executableCode = "";
        // use io.parseCommands to get the commands and arguments from the innerScope
        const cmds = codebook.parseCommands(this.innerScope, this.config.execDir);

        // no commands found: notify a warning and return
        if (cmds.length === 0) {
            this.execCmd = new codebook.Command("echo", ["No commands found in cell"], this.config.execDir);
            return;
        }

        // get the first command and arguments
        this.execCmd = cmds[0];

        if (cmds.length === 1) {
            // if there is only one command, return early
            return;
        }

        // if there are more commands, add them to the postExecutables
        const additionalCmds = cmds.slice(1);
        additionalCmds.forEach(cmd => {
            this.config.postExecutables.push(cmd);
        });
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    }

    execute(): ChildProcessWithoutNullStreams {
        return this.execCmd.execute();
    }

    postExecutables(): codebook.Executable[] {
        return this.config.postExecutables;
    }
}

export class Config {
    contentConfig: codebook.CellContentConfig;
    execDir: string;
    postExecutables: codebook.Executable[];

    constructor(shellConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell | undefined) {
        this.contentConfig = new codebook.CellContentConfig(notebookCell, "#");
        this.execDir = config.getTempPath();
        this.postExecutables = [];
    }
}
