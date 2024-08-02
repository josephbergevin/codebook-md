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

        // Get a Cell for the language that was used to run this cell
        const codebookCell = codebook.NewExecutableCell(notebookCell);
        const outputConfig = codebookCell.contentCellConfig().output;
        if (outputConfig.replaceOutputCell) {
            // clear the output of the cell
            exec.clearOutput(notebookCell);
        }

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

            // prepend the output with the strings in outputConfig.prependOutputStrings
            if (outputConfig.prependToOutputStrings.length > 0) {
                console.log(`${outputConfig.prependToOutputStrings.length} prependOutputStrings found - prepending`);
                outputConfig.prependToOutputStrings.forEach((prependString) => {
                    displayOutput = prependString + "\n" + displayOutput;
                });
            }

            // lastly, prepend the output with a timestamp, so it's at the top of the output
            if (outputConfig.showTimestamp === true) {
                const timestamp = new Date().toLocaleString('en-US', { timeZone: outputConfig.timestampTimezone });
                displayOutput = timestamp + "\n" + displayOutput;
                console.log(`showing timestamp: ${timestamp}`);
            }

            // call the postExecutables and append the output to the displayOutput
            // const postOutput = executePostExecutables(codebookCell.postExecutables());
            // displayOutput += await postOutput;

            if (outputConfig.replaceOutputCell) {
                console.log("replacing output cell");
                exec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)])]);
            } else {
                console.log("appending output cell");
                exec.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.text(displayOutput)]));
            }
        });

        output.on('close', () => {
            // If stdout returned anything consider it a success
            if (buf.length === 0) {
                exec.end(false, (new Date).getTime());
            } else {
                exec.end(true, (new Date).getTime());
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
