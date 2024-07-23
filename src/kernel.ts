/* eslint-disable @typescript-eslint/naming-convention */
import { NotebookDocument, NotebookCell, NotebookController, NotebookCellOutput, NotebookCellOutputItem } from 'vscode';
import * as codebook from "./codebook";

// Kernel in this case matches Jupyter definition i.e. this is responsible for taking the frontend notebook
// and running it through different languages, then returning results in the same format.
export class Kernel {
    async executeCells(doc: NotebookDocument, cells: NotebookCell[], ctrl: NotebookController): Promise<void> {
        console.log(`kernel.executeCells called with ${cells.length} cells`);
        for (const cell of cells) {
            await this.executeCell(doc, cell, ctrl);
        }
    }

    async executeCell(doc: NotebookDocument, notebookCell: NotebookCell, ctrl: NotebookController): Promise<void> {
        console.log(`kernel.executeCell: ${notebookCell.document.languageId} cell`);
        const exec = ctrl.createNotebookCellExecution(notebookCell);

        // Allow for the ability to cancel execution
        const token = exec.token;
        token.onCancellationRequested(() => {
            exec.end(false, (new Date).getTime());
        });

        // start the cell timer counter
        exec.start((new Date).getTime());

        // clear the output of the cell
        // TODO: add a configuration option to disable this - global or by language
        exec.clearOutput(notebookCell);

        // Get a Cell for the language that was used to run this cell
        const codebookCell = codebook.NewCell(notebookCell);

        // Run the code and directly assign output
        const output = codebookCell.execute();

        // Now there's an output stream, kill that as well on cancel request
        token.onCancellationRequested(() => {
            output.kill();
            exec.end(false, Date.now()); // Simplified timestamp retrieval
        });

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

        const decoder = new TextDecoder;
        output.stdout.on('data', (data: Uint8Array) => {
            console.log(`stdout: ${data}`);
            const arr = [buf, data];
            buf = Buffer.concat(arr);
            // get the entire output of the cell
            const fullOutput = decoder.decode(buf);
            let displayOutput = fullOutput;

            // if the displayOutput contains the start cell marker, remove everything before it
            const startIndex = displayOutput.indexOf(codebook.StartOutput);
            if (startIndex !== -1) {
                displayOutput = displayOutput.slice(startIndex + codebook.StartOutput.length + 1);
            }

            // if the displayOutput contains the end cell marker, remove everything after it
            const endIndex = displayOutput.indexOf(codebook.EndOutput);
            if (endIndex !== -1) {
                displayOutput = displayOutput.slice(0, endIndex);
            }

            // log out if the displayOutput is different from the fullOutput
            if (displayOutput !== fullOutput) {
                console.log(`displayOutput: ${displayOutput} | fullOutput: ${fullOutput}`);
            }

            exec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)])]);
        });

        output.on('close', () => {
            // If stdout returned anything consider it a success
            if (buf.length === 0) {
                exec.end(false, (new Date).getTime());
            } else {
                exec.end(true, (new Date).getTime());
            }
        });

        // Run the afterExecution function
        codebookCell.afterExecution();
    }
}
