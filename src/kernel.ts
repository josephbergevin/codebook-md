/* eslint-disable @typescript-eslint/naming-convention */
import { NotebookDocument, NotebookCell, NotebookController, NotebookCellOutput, NotebookCellOutputItem, NotebookRange, NotebookEdit, WorkspaceEdit, workspace } from 'vscode';
import { ChildProcessWithoutNullStreams, spawnSync } from 'child_process';
import { Cell, CommentDecorator } from "./md";
import * as go from "./languages/go";
import * as vscode from 'vscode';
import * as util from "./exec";


export let lastRunLanguage = '';

// Kernel in this case matches Jupyter definition i.e. this is responsible for taking the frontend notebook
// and running it through different languages, then returning results in the same format.
export class Kernel {
    async executeCells(doc: NotebookDocument, cells: NotebookCell[], ctrl: NotebookController): Promise<void> {
        for (const cell of cells) {
            await this.executeCell(doc, [cell], ctrl);
        }
    }

    async executeCell(doc: NotebookDocument, cells: NotebookCell[], ctrl: NotebookController): Promise<void> {
        let decoder = new TextDecoder;
        let encoder = new TextEncoder;
        let exec = ctrl.createNotebookCellExecution(cells[0]);

        let currentCell = cells[cells.length - 1];
        // Allow for the ability to cancel execution
        let token = exec.token;
        token.onCancellationRequested(() => {
            exec.end(false, (new Date).getTime());
        });

        // Used for the cell timer counter
        exec.start((new Date).getTime());
        // TODO check lang and change comment symbols
        if (currentCell.document.getText().trimStart().startsWith("#" + CommentDecorator.skip)) {
            exec.end(true, (new Date).getTime());
            return;
        }
        exec.clearOutput(cells[0]);

        // Get all cells up to this one
        let range = new NotebookRange(0, cells[0].index + 1);
        let cellsUpToCurrent = doc.getCells(range);

        // Build a object containing languages and their cells
        let cellsStripped: Cell[] = [];
        let matchingCells = 0;
        let pythonCells = 0;
        for (const cell of cellsUpToCurrent) {
            if (cell.document.languageId === cells[0].document.languageId) {
                matchingCells++;
                cellsStripped.push({
                    index: matchingCells,
                    contents: cell.document.getText(),
                    cell: cell,
                });
            }
            if (cells[0].document.languageId === "mojo") {
                if (cell.document.languageId === "python") {
                    pythonCells += 1;
                }
            }
        }

        // Get language that was used to run this cell
        const lang = cells[0].document.languageId;

        // Check if clearing output at the end
        let clearOutput = false;

        // Run the code
        let output: ChildProcessWithoutNullStreams;

        // Now there's an output stream, kill that as well on cancel request
        token.onCancellationRequested(() => {
            output.kill();
            exec.end(false, (new Date).getTime());
        });

        const mimeType = `text/plain`;
        switch (lang) {
            case "go":
                if (util.commandNotOnPath("go", "https://go.dev/doc/install")) {
                    exec.end(false, (new Date).getTime());
                    return;
                }
                lastRunLanguage = "go";
                output = go.executeCells(cellsStripped);
                break;

            default:
                exec.end(true, (new Date).getTime());
                return;
        }

        let errorText = "";

        output.stderr.on("data", async (data: Uint8Array) => {
            errorText = data.toString();
            if (errorText) {
                exec.appendOutput([new NotebookCellOutput([NotebookCellOutputItem.text(errorText, mimeType)])]);
            }

        });

        let buf = Buffer.from([]);

        let currentCellLang = cellsStripped[cellsStripped.length - 1] as Cell;

        output.stdout.on('data', (data: Uint8Array) => {
            let arr = [buf, data];
            buf = Buffer.concat(arr);
            let outputs = decoder.decode(buf).split(/!!output-start-cell[\n,""," "]/g);
            let currentCellOutput: string;
            if (lastRunLanguage === "shell") {
                currentCellOutput = outputs[1];
            } else {
                currentCellOutput = outputs[currentCellLang.index + pythonCells];
            }
            if (!clearOutput && currentCellOutput.trim()) {
                exec.replaceOutput([new NotebookCellOutput([NotebookCellOutputItem.text(currentCellOutput)])]);
            }

        });

        output.on('close', (_) => {
            // If stdout returned anything consider it a success
            if (buf.length === 0) {
                exec.end(false, (new Date).getTime());
            } else {
                exec.end(true, (new Date).getTime());
            }

            // Loop through all the cells and increment version of image if it exists

            if (doc.getCells().length >= (cells[0].index + 1)) {
                let cell = doc.getCells(new NotebookRange(cells[0].index + 1, cells[0].index + 2))[0];
                if (cell.kind === vscode.NotebookCellKind.Markup) {
                    let text = cell.document.getText();
                    text.replace(/(.*[^`]*<img\s*src\s*=\s*".*?)(\?version=(\d+))?"(.*)/g, (match, prefix, versionQuery, versionNum, suffix) => {
                        if (match) {
                            let replaceText = "";
                            if (versionQuery) {
                                //   If ?version= is present, increment the version number
                                let newVersionNum = parseInt(versionNum, 10) + 1;
                                replaceText = `${prefix}?version=${newVersionNum}"${suffix}`;
                            } else {
                                //   If ?version= is not present, add ?version=1
                                replaceText = `${prefix}?version=1"${suffix}`;
                            }
                            let workspaceEdit = new vscode.WorkspaceEdit();
                            let fullRange = new vscode.Range(
                                0,
                                0,
                                cell.document.lineCount - 1,
                                cell.document.lineAt(cell.document.lineCount - 1).text.length
                            );
                            workspaceEdit.replace(cell.document.uri, fullRange, replaceText);
                            vscode.workspace.applyEdit(workspaceEdit);
                            vscode.window.showNotebookDocument(vscode.window.activeNotebookEditor?.notebook as NotebookDocument, {
                                viewColumn: vscode.window.activeNotebookEditor?.viewColumn,
                                selections: [new NotebookRange(cell.index, cell.index + 1)],
                                preserveFocus: true,
                            }).then(() => {
                                // Execute commands to toggle cell edit mode and then toggle it back to preview.
                                vscode.commands.executeCommand('notebook.cell.edit').then(() => {
                                    vscode.commands.executeCommand('notebook.cell.quitEdit').then(() => {
                                        // Optionally, add any additional logic that needs to run after the refresh.
                                    });
                                });
                            });
                            vscode.window.showNotebookDocument(vscode.window.activeNotebookEditor?.notebook as NotebookDocument, {
                                viewColumn: vscode.window.activeNotebookEditor?.viewColumn,
                                selections: [new NotebookRange(cell.index - 1, cell.index)],
                                preserveFocus: false,
                            });

                            // let edits: vscode.NotebookCellData[] = [];
                            // edits.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, replaceText, "markdown"));
                            // const edit = new WorkspaceEdit();
                            // const currentRange =new NotebookRange(i, i + 1)
                            // let notebook_edit = NotebookEdit.replaceCells(currentRange, edits);
                            // edit.set(cellsAll[i].notebook.uri, [notebook_edit]);
                            // workspace.applyEdit(edit);
                            // vscode.window.showNotebookDocument(vscode.window.activeNotebookEditor?.notebook as NotebookDocument, {
                            //     viewColumn: vscode.window.activeNotebookEditor?.viewColumn,
                            //     selections: [currentRange],
                            //     preserveFocus: false
                            // });
                        }

                        return "";
                    });
                }
            }
        });
    }
}
