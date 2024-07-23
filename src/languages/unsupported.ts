import { ChildProcessWithoutNullStreams } from "child_process";
import * as config from "../config";
import * as codebook from "../codebook";
import { NotebookCell } from "vscode";
import * as exec from "../io";

// Cell implements the codebook.Cell interface for all unsupported languages
export class Cell implements codebook.Cell {
    innerScope: string;
    executableCode: string;
    language: string;

    constructor(notebookCell: NotebookCell) {
        // form the innerScope with lines that don't start with # or set -e
        this.innerScope = codebook.NotebookCellToInnerScope(notebookCell, "#", "//");

        // form the executable code
        this.executableCode = this.innerScope;

        // set the language to the languageId of the notebookCell
        this.language = notebookCell.document.languageId;
    }

    execute(): ChildProcessWithoutNullStreams {
        // return an error message: "Unsupported language" as ChildProcessWithoutNullStreams
        return exec.spawnCommand(`echo "Unsupported language '${this.language}'"`, [], { cwd: config.getTempPath() });
    }

    // afterExecution is a no-op for unsupported languages
    afterExecution(): void { };
}
