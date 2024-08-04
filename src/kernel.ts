/* eslint-disable @typescript-eslint/naming-convention */
import { NotebookDocument, NotebookCell, NotebookController, NotebookCellOutput, NotebookCellOutputItem, NotebookCellExecution, CancellationToken } from 'vscode';
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
        const cellExec = ctrl.createNotebookCellExecution(notebookCell);

        // Allow for the ability to cancel execution
        const token = cellExec.token;
        token.onCancellationRequested(() => {
            cellExec.end(false, (new Date).getTime());
        });

        // start the cell timer counter
        cellExec.start((new Date).getTime());

        // Get a Cell for the language that was used to run this cell
        const codebookCell = codebook.NewExecutableCell(notebookCell);
        const outputConfig = codebookCell.contentCellConfig().output;

        // if the executables length is more than 1, then we'll need to ensure the output is replaced
        // otherwise, we're allowed to append to the output
        if (codebookCell.executables().length > 1 && !outputConfig.replaceOutputCell) {
            outputConfig.replaceOutputCell = true;
            console.warn("executables length is more than 1 - overriding replaceOutputCell value - setting to true");
        }

        if (outputConfig.replaceOutputCell) {
            // clear the output of the cell
            cellExec.clearOutput(notebookCell);
        }

        // displayOutput will be the output that is displayed in the cell and will be appended
        // to as the cell runs - this is the output that will be displayed in the cell
        let displayOutput = "";

        // first, prepend the output with a timestamp, so it's at the top of the output
        if (outputConfig.showTimestamp === true) {
            const timestamp = new Date().toLocaleString('en-US', { timeZone: outputConfig.timestampTimezone });
            displayOutput += timestamp + "\n";
            console.log(`showing timestamp: ${timestamp}`);
        }

        // append the output with the strings in outputConfig.prependOutputStrings
        if (outputConfig.prependToOutputStrings.length > 0) {
            console.log(`${outputConfig.prependToOutputStrings.length} prependOutputStrings found - prepending`);
            outputConfig.prependToOutputStrings.forEach((prependString) => {
                displayOutput += prependString + "\n";
            });
        }

        // create a new cell output with an empty string
        // this will be appended to as the cell runs
        const cellOutput = new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)]);

        if (outputConfig.replaceOutputCell) {
            console.log("replacing output cell");
            cellExec.replaceOutput([cellOutput]);
        }

        for (const executable of codebookCell.executables()) {
            displayOutput = await runExecutable(token, executable, displayOutput, outputConfig.showExecutableCodeInOutput);
            displayOutput += "\n";
            await displayOutputAsync(cellExec, displayOutput, outputConfig.replaceOutputCell);
        }

        // end the cell timer counter
        cellExec.end(true, (new Date).getTime());
    }
}

async function displayOutputAsync(cellExec: NotebookCellExecution, displayOutput: string, replaceOutputCell: boolean): Promise<void> {
    return new Promise((resolve) => {
        if (replaceOutputCell) {
            cellExec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)])]);
        } else {
            cellExec.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)]));
        }
        resolve();
    });
}

async function runExecutable(token: CancellationToken, executable: codebook.Executable, displayOutput: string, showExecutableCodeInOutput: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
        if (showExecutableCodeInOutput) {
            displayOutput += executable.toString() + "\n";
        }

        // run the code and directly assign output
        const output = executable.execute();

        // now there's an output stream, kill that as well on cancel request
        token.onCancellationRequested(() => {
            output.kill();
            reject("Execution cancelled");
        });

        let errorText = "";

        output.stderr.on("data", (data: Uint8Array) => {
            errorText = data.toString();
            if (errorText === "") {
                errorText = "An error occurred - no error text was returned.";
                console.error("error text is empty");
            }
            resolve(displayOutput + errorText);
        });

        output.on("close", () => {
            resolve(displayOutput);
        });

        output.on("error", (err) => {
            reject(`Executable errored: ${err}`);
        });

        let buf = Buffer.from([]);
        const decoder = new TextDecoder;

        output.stdout.on("data", (data: Uint8Array) => {
            const arr = [buf, data];
            buf = Buffer.concat(arr);
            // get the entire output of the cell
            const fullCommandOutput = decoder.decode(buf);
            let commandOutput = fullCommandOutput;

            // if the commandOutput contains the start cell marker, remove everything before it
            const startIndex = commandOutput.indexOf(codebook.StartOutput);
            if (startIndex !== -1) {
                commandOutput = commandOutput.slice(startIndex + codebook.StartOutput.length + 1);
            }

            // if the commandOutput contains the end cell marker, remove everything after it
            const endIndex = commandOutput.indexOf(codebook.EndOutput);
            if (endIndex !== -1) {
                commandOutput = commandOutput.slice(0, endIndex);
            }

            // log out if the commandOutput is different from the fullOutput
            if (commandOutput !== fullCommandOutput) {
                console.log(`commandOutput: ${commandOutput} | fullOutput: ${fullCommandOutput}`);
            }

            resolve(displayOutput + commandOutput);
        });
    });
}
