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

        // append the executableCodeToDisplay to the displayOutput
        if (outputConfig.showExecutableCodeInOutput === true) {
            displayOutput += codebookCell.executableCodeToDisplay() + "\n";
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

        // Run the code and directly assign output
        const output = codebookCell.execute();

        // Now there's an output stream, kill that as well on cancel request
        token.onCancellationRequested(() => {
            output.kill();
            cellExec.end(false, Date.now()); // Simplified timestamp retrieval
        });

        let errorText = "";

        output.stderr.on("data", async (data: Uint8Array) => {
            errorText = data.toString();
            if (errorText === "") {
                errorText = "An error occurred - no error text was returned.";
                console.error("error text is empty");
            }
            cellExec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(errorText)])]);
            cellExec.end(true, (new Date).getTime());
        });

        let buf = Buffer.from([]);
        const decoder = new TextDecoder;
        output.stdout.on('data', (data: Uint8Array) => {
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

            // call the postExecutables and append the output to the commandOutput
            // const postOutput = executePostExecutables(codebookCell.postExecutables());
            // commandOutput += await postOutput;

            // append the commandOutput to the existing cellOutput
            if (outputConfig.replaceOutputCell) {
                cellExec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput + commandOutput)])]);
            } else {
                cellExec.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput + commandOutput)]));
            }
        });

        output.on('close', () => {
            // If stdout returned anything consider it a success
            if (buf.length === 0) {
                cellExec.end(false, (new Date).getTime());
            } else {
                cellExec.end(true, (new Date).getTime());
            }
        });
    }
}

// executePostExecutables will execute the postExecutables and return the output as a string
export async function executePostExecutables(postExecutables: codebook.Executable[]): Promise<string> {
    if (postExecutables.length === 0) {
        return "";
    }

    let output = "";

    for (const executable of postExecutables) {
        await new Promise<void>((resolve, reject) => {
            // start with the command and arguments
            output += executable.toString() + "\n";

            const exec = executable.execute();
            exec.stdout.on('data', (data: Uint8Array) => {
                output += dataToString(data);
            });

            exec.stderr.on('data', (data: Uint8Array) => {
                output += dataToString(data);
            });

            exec.on('close', () => {
                resolve();
            });

            exec.on('error', (err) => {
                reject(err);
            });
        });
    }

    return output;
}

// dataToString will convert the Uint8Array data to a string
export function dataToString(data: Uint8Array): string {
    let buf = Buffer.from([]);
    const decoder = new TextDecoder;
    const arr = [buf, data];
    buf = Buffer.concat(arr);
    // get the entire output of the cell
    const cmdOutput = decoder.decode(buf);
    console.log(`cmdOutput: ${cmdOutput}`);
    return cmdOutput;
}
