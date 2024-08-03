import { ChildProcessWithoutNullStreams } from "child_process";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell } from "vscode";
import * as io from "../io";

// Cell implements the codebook.Cell interface for all unsupported languages
export class Cell implements codebook.ExecutableCell {
    innerScope: string;
    executableCode: string;
    language: string;
    config: Config;

    constructor(notebookCell: NotebookCell) {
        this.config = new Config(notebookCell);

        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#", "//");

        // form the executable code
        this.executableCode = this.innerScope;

        // set the language to the languageId of the notebookCell
        this.language = notebookCell.document.languageId;
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    };

    executableCodeToDisplay(): string {
        return this.innerScope;
    }

    execute(): ChildProcessWithoutNullStreams {
        // return an error message: "Unsupported language" as ChildProcessWithoutNullStreams
        return io.spawnCommand(`echo "Unsupported language '${this.language}'"`, [], { cwd: config.getTempPath() });
    }

    // afterExecution is a no-op for unsupported languages
    postExecutables(): codebook.Executable[] {
        return this.config.postExecutables;
    }
}

// Config implements the configuration for unsupported languages
export class Config {
    contentConfig: codebook.CellContentConfig;
    postExecutables: codebook.Executable[];

    constructor(notebookCell: NotebookCell) {
        // set the contentConfig to the CellContentConfig for the notebookCell - using all common comment characters since we 
        // don't know the language comment character(s) for unsupported languages
        this.contentConfig = new codebook.CellContentConfig(notebookCell, "#", "//", "#!/bin/bash", "--");

        // initialize the postExecutables array
        this.postExecutables = [];
    }
}
