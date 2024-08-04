import { ChildProcessWithoutNullStreams } from "child_process";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell } from "vscode";

// Cell implements the codebook.Cell interface for all unsupported languages
export class Cell implements codebook.ExecutableCell {
    innerScope: string;
    executableCode: string;
    language: string;
    mainExecutable: codebook.Command;
    postExecutables: codebook.Executable[] = [];
    config: Config;

    constructor(notebookCell: NotebookCell) {
        this.config = new Config(notebookCell);

        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = codebook.ProcessNotebookCell(notebookCell, "#", "//");

        // form the executable code
        this.executableCode = this.innerScope;

        // set the language to the languageId of the notebookCell
        this.language = notebookCell.document.languageId;

        // set the mainExecutable to a new Command with the executable code
        this.mainExecutable = new codebook.Command(`echo "Unsupported language '${this.language}'"`, [], config.getTempPath());
    }

    contentCellConfig(): codebook.CellContentConfig {
        return this.config.contentConfig;
    };

    toString(): string {
        return this.innerScope;
    }

    execute(): ChildProcessWithoutNullStreams {
        // use the mainExecutable to execute the code
        return this.mainExecutable.execute();
    }

    // afterExecution is a no-op for unsupported languages
    executables(): codebook.Executable[] {
        return [this.mainExecutable, ...this.postExecutables];
    }
}

// Config implements the configuration for unsupported languages
export class Config {
    contentConfig: codebook.CellContentConfig;

    constructor(notebookCell: NotebookCell) {
        // set the contentConfig to the CellContentConfig for the notebookCell - using all common comment characters since we 
        // don't know the language comment character(s) for unsupported languages
        this.contentConfig = new codebook.CellContentConfig(notebookCell, undefined, "#", "//", "#!/bin/bash", "--");
    }
}
