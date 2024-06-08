/* eslint-disable @typescript-eslint/naming-convention */
import { NotebookDocument, NotebookCell, NotebookController, NotebookCellOutput, NotebookCellOutputItem, NotebookRange, NotebookEdit, WorkspaceEdit, workspace } from 'vscode';
import { ChildProcessWithoutNullStreams, spawnSync } from 'child_process';
import * as md from "./md";
import * as go from "./languages/go";
import * as javascript from "./languages/javascript";
import * as bash from "./languages/bash";
import * as vscode from 'vscode';
import * as util from "./exec";

// Kernel in this case matches Jupyter definition i.e. this is responsible for taking the frontend notebook
// and running it through different languages, then returning results in the same format.
export class Kernel {
    async executeCells(doc: NotebookDocument, cells: NotebookCell[], ctrl: NotebookController): Promise<void> {
        console.log(`kernel.executeCells called with ${cells.length} cells`);
        for (const cell of cells) {
            await this.executeCell(doc, [cell], ctrl);
        }
    }

    async executeCell(doc: NotebookDocument, cells: NotebookCell[], ctrl: NotebookController): Promise<void> {
        switch (cells.length) {
            case 0:
                return;

            case 1:
                // continue below
                break;

            default:
                console.error(`executeCell called with ${cells.length} cells - only 1 cell is supported at a time.`);
                return;
        }

        const notebookCell = cells[0];
        let decoder = new TextDecoder;
        let exec = ctrl.createNotebookCellExecution(notebookCell);

        // Allow for the ability to cancel execution
        let token = exec.token;
        token.onCancellationRequested(() => {
            exec.end(false, (new Date).getTime());
        });

        // start the cell timer counter
        exec.start((new Date).getTime());

        // clear the output of the cell
        exec.clearOutput(notebookCell);

        // convert the notebookCell to an md.Cell
        const cell = new md.Cell(notebookCell);

        // Run the code
        let output: ChildProcessWithoutNullStreams;

        // Now there's an output stream, kill that as well on cancel request
        token.onCancellationRequested(() => {
            output.kill();
            exec.end(false, (new Date).getTime());
        });

        // Get language that was used to run this cell
        const lang = notebookCell.document.languageId;
        const mimeType = `text/plain`;
        switch (lang) {
            case "go":
                if (util.commandNotOnPath("go", "https://go.dev/doc/install")) {
                    exec.end(false, (new Date).getTime());
                    return;
                }
                output = go.executeCell(cell);
                break;

            case "javascript":
            case "js":
                if (util.commandNotOnPath("node", "https://nodejs.org/")) {
                    exec.end(false, (new Date).getTime());
                    return;
                }
                output = javascript.executeCell(cell);
                break;

            case "typescript":
            case "ts":
                if (util.commandNotOnPath("ts-node", "https://www.npmjs.com/package/ts-node")) {
                    exec.end(false, (new Date).getTime());
                    return;
                }
                output = javascript.executeCell(cell);
                break;

            case "shell":
            case "zsh":
            case "sh":
            case "shellscript":
            case "shell-script":
            case "bash":
                if (util.commandNotOnPath("bash", "https://www.gnu.org/software/bash/")) {
                    exec.end(false, (new Date).getTime());
                    return;
                }
                output = bash.executeCell(cell);
                break;

            default:
                exec.end(true, (new Date).getTime());
                return;
        }

        let errorText = "";

        output.stderr.on("data", async (data: Uint8Array) => {
            errorText = data.toString();
            if (errorText === "") {
                errorText = "An error occurred - no error text was returned.";
                console.error("error text is empty");
            }
            exec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(errorText)])]);
            exec.end(true, (new Date).getTime());
        });

        let buf = Buffer.from([]);

        output.stdout.on('data', (data: Uint8Array) => {
            console.log(`stdout: ${data}`);
            let arr = [buf, data];
            buf = Buffer.concat(arr);
            // get the entire output of the cell
            const fullOutput = decoder.decode(buf);
            let displayOutput = fullOutput;

            // if the displayOutput contains the start cell marker, remove everything before it
            const outputStartCell = "!!output-start-cell";
            let startIndex = displayOutput.indexOf(outputStartCell);
            if (startIndex !== -1) {
                displayOutput = displayOutput.slice(startIndex + outputStartCell.length + 1);
            }

            // if the displayOutput contains the end cell marker, remove everything after it
            let endIndex = displayOutput.indexOf("!!output-end-cell");
            if (endIndex !== -1) {
                displayOutput = displayOutput.slice(0, endIndex);
            }

            // log out if the displayOutput is different from the fullOutput
            if (displayOutput !== fullOutput) {
                console.log(`displayOutput: ${displayOutput} | fullOutput: ${fullOutput}`);
            }

            exec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)])]);
        });

        output.on('close', (_) => {
            // If stdout returned anything consider it a success
            if (buf.length === 0) {
                exec.end(false, (new Date).getTime());
            } else {
                exec.end(true, (new Date).getTime());
            }

            // Clear all outputs for the entire document
            console.log(`Clearing all outputs for ${doc.cellCount} cells...`);
            doc.getCells().forEach(notebookCell => {
                exec.clearOutput(notebookCell);
            });
        });
    }
}
