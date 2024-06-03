import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, readFile, writeFileSync } from "fs";
import * as path from "path";
import { NotebookCell, NotebookCellExecution, NotebookCellOutput, NotebookCellOutputItem } from "vscode";
import * as config from "../config";
import { Cell } from "../types";
import * as vscode from "vscode";
import { workspace } from "vscode";
import { join } from "path";
import * as exec from "../exec";

const goConfig = () => workspace.getConfiguration('codebook-md.go');

export let processCellsGo = (cells: Cell[]): ChildProcessWithoutNullStreams => {
    let go = processCellsToExecGoConfig(cells);

    console.log("execFile", go.execFile);
    console.log("cell contents", go.execCode);

    // create the directory and main file
    mkdirSync(go.execDir, { recursive: true });
    writeFileSync(go.execFile, go.execCode);

    // run goimports on the file
    if (go.useGoimports) {
        exec.spawnCommandSync('goimports', ['-w', go.execFile], { cwd: go.execDir });
    } else {
        exec.spawnCommandSync('gopls', ['imports', '-w', go.execFile], { cwd: go.execDir });
    }

    if (go.execTypeTest) {
        // prepend the generate message and the build tag to the file contents
        // read the file contents from the go.execFile
        readFile(go.execFile, 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                return;
            }
            let fileContents = data;
            fileContents = `// +build ${go.execTypeTestBuildTag}\n\n` + fileContents;
            writeFileSync(go.execFile, fileContents);
        });

        // if we're executing with a test, then we won't use the execFile in the command
        return exec.spawnCommand('go', [go.execCmd, ...go.execArgs], { cwd: go.execDir });
    }
    return exec.spawnCommand('go', [go.execCmd, ...go.execArgs, go.execFile], { cwd: go.execDir });
};

// ExecGoConfig is a class that contains the configuration settings for executing go code from Cells
export class ExecGoConfig {
    imports: string[];
    importNumber: number;
    outerScope: string;
    innerScope: string;
    containsMain: boolean;
    parsingImports: boolean;
    parsingFunc: boolean;
    funcRegex: RegExp;
    funcRecRegex: RegExp;
    execCode: string;
    execFrom: string;
    execTypeRun: boolean;
    execTypeRunFilename: string;
    execTypeTest: boolean;
    execTypeTestFilename: string;
    execTypeTestBuildTag: string;
    execDir: string;
    execFile: string;
    execFilename: string;
    execPkg: string;
    useGoimports: boolean;
    execCmd: string;
    execArgs: string[];

    constructor() {
        this.imports = [];
        this.importNumber = 0;
        this.outerScope = "";
        this.innerScope = "";
        this.containsMain = false;
        this.parsingImports = false;
        this.parsingFunc = false;
        this.funcRegex = /func\s+(\w+)\s*\(/;
        this.funcRecRegex = /func\s+\((\w+)\)\s*\w/;
        this.execCode = "";
        this.execFrom = "";
        this.execTypeRun = true;
        this.execTypeRunFilename = "";
        this.execTypeTest = false;
        this.execTypeTestFilename = "";
        this.execTypeTestBuildTag = "";
        this.execDir = "";
        this.execFile = "";
        this.execFilename = "";
        this.execPkg = "";
        this.useGoimports = false;
        this.execCmd = "";
        this.execArgs = [];
    }
}

// processCellsToExecGoConfig takes the cells and returns the configuration settings for executing go code from Cells
export let processCellsToExecGoConfig = (cells: Cell[]): ExecGoConfig => {
    let execType = goConfig().get<string>('execType') ?? 'run';
    let goimportsCmd = goConfig().get<string>('goimportsCmd') ?? 'gopls imports';
    let go: ExecGoConfig = {
        imports: [],
        importNumber: 0,
        outerScope: "",
        innerScope: "",
        containsMain: false,
        parsingImports: false,
        parsingFunc: false,
        funcRegex: /func\s+(\w+)\s*\(/,
        funcRecRegex: /func\s+\((\w+)\)\s*\w/,
        execFrom: "",
        execTypeRun: execType === 'run',
        execTypeRunFilename: goConfig().get<string>('execTypeRunFilename') ?? 'main.go', // defalut value is in package.json
        execTypeTest: execType === 'test',
        execTypeTestFilename: goConfig().get<string>('execTypeTestFilename') ?? 'md_notebook_exec_test.go', // defalut value is in package.json
        execTypeTestBuildTag: goConfig().get<string>('execTypeTestBuildTag') ?? 'playground', // defalut value is in package.json
        execCode: "",
        execDir: "",
        execFile: "",
        execFilename: "",
        execPkg: "",
        useGoimports: goimportsCmd === 'goimports',
        execCmd: "",
        execArgs: [],
    };

    let parsingIter = 0;
    for (const cell of cells) {
        go.innerScope += `\nfmt.Println("!!output-start-cell")\n`;
        let lines = cell.contents.split("\n");
        for (let line of lines) {
            line = line.trim();
            let funcResult = line.match(go.funcRegex);
            let funcRecResult = line.match(go.funcRecRegex);
            if (funcResult) {
                if (funcResult[1] === "main") {
                    go.containsMain = true;
                    continue;
                } else {
                    go.parsingFunc = true;
                }
            }
            if (funcRecResult) {
                go.parsingFunc = true;
            }
            if (line.startsWith("type")) {
                go.parsingFunc = true;
            }

            if (line.startsWith("import (")) {
                go.parsingImports = true;
            } else if (go.parsingImports) {
                if (line === ")") {
                    go.parsingImports = false;
                } else if (line === "") {
                    continue;
                } else {
                    go.importNumber++;
                    // append line to the imports array
                    go.imports.push(line);
                }
            } else if (line.startsWith("import")) {
                go.importNumber++;
                go.imports.push(line);
            } else if (line.startsWith("// exec_from:")) {
                go.execFrom = line;
                continue;
            } else if (go.parsingFunc) {
                go.outerScope += line;
                go.outerScope += "\n";
            } else {
                go.innerScope += line;
                go.innerScope += "\n";
            }

            if (go.parsingFunc) {
                if (line[0] === "}") {
                    if (parsingIter === 1) {
                        parsingIter = 0;
                        go.parsingFunc = false;
                    } else {
                        parsingIter--;
                    }
                }
                if (line[line.length - 1] === "{") {
                    parsingIter++;
                }
            }
        }
        // Drop the closing curly brace if there was a main function
        if (go.containsMain) {
            go.innerScope = go.innerScope.trim().slice(0, -1);
            go.containsMain = false;
        }
    };

    if (go.execTypeTest) {
        // if goConfig.execType is set and the value is 'test`, then create the file in the current package
        // set the execDir to the current directory
        const currentFile = vscode.window.activeTextEditor?.document.fileName;
        const currentPath = path.dirname(currentFile ?? '');
        go.execPkg = path.basename(currentPath);
        go.execDir = currentPath;
        go.execFilename = go.execTypeTestFilename;
        go.execFile = path.join(go.execDir, go.execFilename);

        // create the execCode for the benchmark file
        go.execCode = `package ${path.basename(go.execDir)}\n\n`;
        go.imports.push(`"testing"`);
        go.execCode += `import (\n\t${go.imports.join("\n\t")}\n)\n\n`;
        go.innerScope += `\nfmt.Println("!!output-start-cell")\n`;
        go.execCode += `func TestExecNotebook(t *testing.T) {\nlog.SetOutput(os.Stdout)\n${go.innerScope}}\n`;
        go.execCode += go.outerScope;

        go.execCmd = 'test';
        go.execArgs = ['-run=TestExecNotebook', '-tags=playground'];
    } else {
        go.execCode = `package main\n${go.imports}\n\nfunc main() {\nlog.SetOutput(os.Stdout)\n${go.innerScope} ${go.outerScope}\n}\n`;
        go.execDir = config.getTempPath();
        go.execFilename = go.execTypeRunFilename;
        go.execFile = path.join(go.execDir, go.execFilename);
        go.execCmd = 'run';
    }

    // define dir and mainFile as empty strings
    if (go.execFrom) {
        // notify in vscode with the execFrom val
        [go.execDir, go.execFile] = getDirAndExecFile(go.execFrom);
        // log out a message in vscode to indicate we're using this setting
        vscode.window.showInformationMessage('found execFrom: ' + go.execFrom, 'executing from: ' + go.execFile);
    }

    return go;
};

// getDirAndMainFile takes the string to search (main string) and returns the directory and main file path for the go code using the 
// '// exec_from:[/dir/to/main.go]' keyword in a comment in the given string using one of 2 formats:
// 1. absolute path to the directory and main.go file (/path/to/dir/main.go)
// 2. relative path to the directory and main.go file (./dir/main.go)
export let getDirAndExecFile = (execFrom: string): [string, string] => {
    // exec_from:./apiplayground/main_temp.go
    // split on the colon
    let parts = execFrom.split(':');
    let execFile = parts[1].trim();

    // if the first part is a '.', then it is a relative path
    if (execFile.startsWith('.')) {
        const currentFile = vscode.window.activeTextEditor?.document.fileName;
        const currentPath = path.dirname(currentFile ?? '');
        execFile = join(currentPath, execFile.slice(2));
    }

    // get the directory path
    let dir = path.dirname(execFile);

    // get the main file path
    return [dir, execFile];
};

export let fixImportsGo = (exec: NotebookCellExecution, cell: NotebookCell): Promise<number> => {
    return new Promise((resolve, reject) => {
        let encoder = new TextEncoder();
        console.log("tidying");
        // let tempDir = config.getTempPath();
        // let goMod = "module github.com/codebook-md/temp\ngo 1.21\n";
        // let goModFile = path.join(tempDir, 'go.mod');
        // writeFileSync(goModFile, goMod);
        // let tidy = exec.spawnCommand('go', ['mod', 'tidy'], { cwd: tempDir });
        // tidy.stderr.on("data", (tidyData: Uint8Array) => {
        //     console.log("data", tidyData);
        //     const x = new NotebookCellOutputItem(tidyData, "text/plain");
        //     exec.appendOutput([new NotebookCellOutput([x])], cell);
        // });
        // tidy.stdout.on("data", (tidyData: Uint8Array) => {
        //     console.log("data", tidyData);
        //     const x = new NotebookCellOutputItem(tidyData, "text/plain");
        //     exec.appendOutput([new NotebookCellOutput([x])], cell);
        // });
        // tidy.on("close", async (_) => {
        //     exec.clearOutput(cell);
        //     let finished = encoder.encode("Go has finished tidying modules, rerun cells now...");
        //     const x = new NotebookCellOutputItem(finished, "text/plain");
        //     exec.appendOutput([new NotebookCellOutput([x])], cell);
        //     exec.end(false, (new Date).getTime());
        //     resolve(0);
        // });
    });
};
