/* eslint-disable @typescript-eslint/naming-convention */
import { NotebookDocument, NotebookCell, NotebookController, NotebookCellOutput, NotebookCellOutputItem, NotebookCellExecution, CancellationToken } from 'vscode';
import * as codebook from "./codebook";
import { PromptHandler } from './prompt';

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

    try {
      // Process cell content and handle prompts if present
      let codebookCell: codebook.ExecutableCell;
      let processedCellContent = notebookCell.document.getText();

      // Check if the cell contains any prompts
      if (PromptHandler.hasPrompts(processedCellContent)) {
        console.log('Prompts detected in cell, processing...');

        // Show processing indicator
        const processingOutput = new NotebookCellOutput([
          NotebookCellOutputItem.text('Waiting for prompt input...')
        ]);
        cellExec.clearOutput();
        cellExec.appendOutput(processingOutput);

        try {
          // Process prompts and replace them with user input
          processedCellContent = await PromptHandler.processPrompts(processedCellContent);

          // Create a temporary cell with the processed content
          const tempCell = {
            ...notebookCell,
            document: {
              ...notebookCell.document,
              getText: () => processedCellContent
            }
          } as NotebookCell;

          // Get a Cell for the language with processed content
          codebookCell = codebook.NewExecutableCell(tempCell);
        } catch (promptError) {
          // Handle prompt cancellation or errors
          console.error(`Error processing prompts: ${promptError}`);
          cellExec.clearOutput();
          cellExec.appendOutput(new NotebookCellOutput([
            NotebookCellOutputItem.text(`Prompt cancelled: ${promptError}`)
          ]));
          cellExec.end(false, (new Date).getTime());
          return;
        }
      } else {
        // No prompts, proceed normally
        codebookCell = codebook.NewExecutableCell(notebookCell);
      }

      const outputConfig = codebookCell.codeBlockConfig().outputConfig;

      // If the executables length is more than 1, then we'll need to ensure the output is replaced
      console.log(`executables length: ${codebookCell.executables().length} | replaceOutputCell: ${outputConfig.replaceOutputCell}`);
      if (!outputConfig.replaceOutputCell && !codebookCell.allowKeepOutput()) {
        outputConfig.replaceOutputCell = true;
        console.warn("executables length is more than 1 - overriding replaceOutputCell value - setting to true");
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

      // Only clear the output if we're replacing it
      if (outputConfig.replaceOutputCell) {
        console.log("clearing previous output");
        cellExec.clearOutput();
        cellExec.replaceOutput([cellOutput]);
      }

      for (const executable of codebookCell.executables()) {
        try {
          displayOutput = await runExecutable(token, executable, displayOutput, outputConfig.showExecutableCodeInOutput, cellExec, outputConfig.replaceOutputCell);
          displayOutput += "\n";
        } catch (error) {
          console.error(`error running executable: ${error}`);
          await displayOutputAsync(cellExec, displayOutput + error, outputConfig.replaceOutputCell);
          break;
        }
      }

      // end the cell timer counter
      cellExec.end(true, (new Date).getTime());
    } catch (error) {
      console.error(`Unexpected error in cell execution: ${error}`);
      cellExec.appendOutput(new NotebookCellOutput([
        NotebookCellOutputItem.text(`Execution failed: ${error}`)
      ]));
      cellExec.end(false, (new Date).getTime());
    }
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

async function runExecutable(
  token: CancellationToken,
  executable: codebook.Executable,
  displayOutput: string,
  showExecutableCodeInOutput: boolean,
  cellExec: NotebookCellExecution,
  replaceOutputCell: boolean = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (showExecutableCodeInOutput) {
      displayOutput += executable.toString() + "\n";
      displayOutputAsync(cellExec, displayOutput, replaceOutputCell);
    }

    const output = executable.execute();

    token.onCancellationRequested(() => {
      output.kill();
      reject("Execution cancelled");
    });

    let errorText = "";
    let fullOutput = displayOutput;
    let isCapturingOutput = true; // Default to capturing all output if no StartOutput marker is found

    output.stderr.on("data", (data: Uint8Array) => {
      const text = data.toString();
      errorText += text;
      // Show stderr in real-time too
      fullOutput += text;
      displayOutputAsync(cellExec, fullOutput, replaceOutputCell);
    });

    output.stdout.on("data", (data: Uint8Array) => {
      const text = data.toString();
      const lines = text.split('\n');

      // Process each line to handle StartOutput/EndOutput markers
      for (const line of lines) {
        if (line.includes(codebook.StartOutput)) {
          isCapturingOutput = true;
          continue; // Skip the marker line
        }
        if (line.includes(codebook.EndOutput)) {
          isCapturingOutput = false;
          continue; // Skip the marker line
        }
        if (isCapturingOutput) {
          fullOutput += line + '\n';
        }
      }

      // Update output in real-time
      displayOutputAsync(cellExec, fullOutput, replaceOutputCell);
    });

    output.on("close", (code) => {
      // Add any final error text if there was a non-zero exit code
      if (code !== 0 && errorText) {
        fullOutput += errorText;
        displayOutputAsync(cellExec, fullOutput, replaceOutputCell);
      }
      resolve(fullOutput);
    });

    output.on("error", (err) => {
      console.error(`executable errored: ${err}`);
      if (err.toString().includes("spawn") || err.toString().includes("ENOENT")) {
        reject("something went wrong - please try your request again");
      } else {
        reject(`executable errored: ${err}`);
      }
    });
  });
}
