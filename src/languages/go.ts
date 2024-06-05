import { ChildProcessWithoutNullStreams } from "child_process";
import { mkdirSync, readFile, writeFileSync } from "fs";
import * as path from "path";
import * as config from "../config";
import * as md from "../md";
import * as vscode from "vscode";
import { workspace } from "vscode";
import { join } from "path";
import * as exec from "../exec";

export let executeCells = (cells: md.Cell[]): ChildProcessWithoutNullStreams => {
    let go = new Cell(cells, workspace.getConfiguration('codebook-md.go'));

    // define dir and mainFile as empty strings
    if (go.config.execFrom !== "") {
        // notify in vscode with the execFrom val
        [go.config.execDir, go.config.execFile] = getDirAndExecFile(go.config.execFrom);
        // log out a message in vscode to indicate we're using go setting
        vscode.window.showInformationMessage('found execFrom: ' + go.config.execFrom, 'executing from: ' + go.config.execFile);
    }

    console.log("execFile", go.config.execFile);
    console.log("cell contents", go.executableCode);

    // create the directory and main file
    mkdirSync(go.config.execDir, { recursive: true });
    writeFileSync(go.config.execFile, go.executableCode);

    // run goimports on the file
    if (go.config.useGoimports) {
        exec.spawnCommandSync('goimports', ['-w', go.config.execFile], { cwd: go.config.execDir });
    } else {
        exec.spawnCommandSync('gopls', ['imports', '-w', go.config.execFile], { cwd: go.config.execDir });
    }

    if (go.config.execTypeTest) {
        // prepend the generate message and the build tag to the file contents
        // read the file contents from the go.config.execFile
        readFile(go.config.execFile, 'utf8', (err, data) => {
            if (err) {
                console.error(err);
                return;
            }
            let fileContents = data;
            fileContents = `// +build ${go.config.execTypeTestBuildTag}\n\n` + fileContents;
            writeFileSync(go.config.execFile, fileContents);
        });

        // if we're executing with a test, then we won't use the execFile in the command
        return exec.spawnCommand('go', [go.config.execCmd, ...go.config.execArgs], { cwd: go.config.execDir });
    }
    return exec.spawnCommand('go', [go.config.execCmd, ...go.config.execArgs, go.config.execFile], { cwd: go.config.execDir });
};

// Cell is a class that contains the configuration settings for executing go code from Cells
export class Cell {
    imports: string[];
    importNumber: number;
    outerScope: string;
    innerScope: string;
    containsMain: boolean;
    parsingImports: boolean;
    parsingFunc: boolean;
    funcRegex: RegExp;
    funcRecRegex: RegExp;
    executableCode: string;
    config: Config;

    constructor(cells: md.Cell[], goConfig: vscode.WorkspaceConfiguration | undefined) {
        this.imports = [];
        this.importNumber = 0;
        this.outerScope = "";
        this.innerScope = "";
        this.containsMain = false;
        this.parsingImports = false;
        this.parsingFunc = false;
        this.funcRegex = /func\s+(\w+)\s*\(/;
        this.funcRecRegex = /func\s+\((\w+)\)\s*\w/;
        this.executableCode = "";
        this.config = new Config(goConfig);

        let parsingIter = 0;
        for (const cell of cells) {
            this.innerScope += `\nfmt.Println("!!output-start-cell")\n`;
            let lines = cell.contents.split("\n");
            for (let line of lines) {
                line = line.trim();
                let funcResult = line.match(this.funcRegex);
                let funcRecResult = line.match(this.funcRecRegex);
                if (funcResult) {
                    if (funcResult[1] === "main") {
                        this.containsMain = true;
                        continue;
                    } else {
                        this.parsingFunc = true;
                    }
                }
                if (funcRecResult) {
                    this.parsingFunc = true;
                }
                if (line.startsWith("type")) {
                    this.parsingFunc = true;
                }

                if (line.startsWith("import (")) {
                    this.parsingImports = true;
                } else if (this.parsingImports) {
                    if (line === ")") {
                        this.parsingImports = false;
                    } else if (line === "") {
                        continue;
                    } else {
                        this.importNumber++;
                        // append line to the imports array
                        this.imports.push(line);
                    }
                } else if (line.startsWith("import")) {
                    this.importNumber++;
                    this.imports.push(line);
                } else if (line.startsWith("// exec_from:")) {
                    // set the execFrom value to the line so we can use it later
                    this.config.execFrom = line;
                    continue;
                } else if (this.parsingFunc) {
                    this.outerScope += line;
                    this.outerScope += "\n";
                } else {
                    this.innerScope += line;
                    this.innerScope += "\n";
                }

                if (this.parsingFunc) {
                    if (line[0] === "}") {
                        if (parsingIter === 1) {
                            parsingIter = 0;
                            this.parsingFunc = false;
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
            if (this.containsMain) {
                this.innerScope = this.innerScope.trim().slice(0, -1);
                this.containsMain = false;
            }
        };

        if (this.config.execTypeTest) {
            // if goConfig.execType is set and the value is 'test`, then create the file in the current package
            // create the execCode for the benchmark file
            this.executableCode = `package ${path.basename(this.config.execDir)}\n\n`;
            this.imports.push(`"testing"`);
            this.executableCode += `import (\n\t${this.imports.join("\n\t")}\n)\n\n`;
            this.innerScope += `\nfmt.Println("!!output-start-cell")\n`;
            this.executableCode += `func TestExecNotebook(t *testing.T) {\nlog.SetOutput(os.Stdout)\n${this.innerScope}}\n`;
            this.executableCode += this.outerScope;
        } else {
            this.executableCode = `package main\n${this.imports}\n\nfunc main() {\nlog.SetOutput(os.Stdout)\n${this.innerScope} ${this.outerScope}\n}\n`;
        }

        // define dir and mainFile as empty strings
        if (this.config.execFrom !== "") {
            // notify in vscode with the execFrom val
            [this.config.execDir, this.config.execFile] = getDirAndExecFile(this.config.execFrom);
        }
    }
}

export class Config {
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

    constructor(goConfig: vscode.WorkspaceConfiguration | undefined) {
        const execType = goConfig?.get<string>('execType') ?? 'run';
        this.execFrom = '';
        this.execTypeRun = execType === 'run';
        this.execTypeRunFilename = goConfig?.get<string>('execTypeRunFilename') ?? 'main.go'; // defalut value is in package.json
        this.execTypeTest = execType === 'test';
        this.execTypeTestFilename = goConfig?.get<string>('execTypeTestFilename') ?? 'md_notebook_exec_test.go'; // defalut value is in package.json
        this.execTypeTestBuildTag = goConfig?.get<string>('execTypeTestBuildTag') ?? 'playground'; // defalut value is in package.json
        this.execDir = "";
        this.execFile = "";
        this.execFilename = "";
        this.execPkg = "";
        const goimportsCmd = goConfig?.get<string>('goimportsCmd') ?? 'gopls imports';
        this.useGoimports = goimportsCmd === 'goimports';
        this.execCmd = "";
        this.execArgs = [];
        if (this.execTypeTest) {
            // if goConfig.execType is set and the value is 'test`, then create the file in the current package
            // set the execDir to the current directory
            const currentFile = vscode.window.activeTextEditor?.document.fileName;
            const currentPath = path.dirname(currentFile ?? '');
            this.execPkg = path.basename(currentPath);
            this.execDir = currentPath;
            this.execFilename = this.execTypeTestFilename;
            this.execFile = path.join(this.execDir, this.execFilename);
            this.execCmd = 'test';
            this.execArgs = ['-run=TestExecNotebook', '-tags=playground'];
        } else {
            this.execDir = config.getTempPath();
            this.execFilename = this.execTypeRunFilename;
            this.execFile = path.join(this.execDir, this.execFilename);
            this.execCmd = 'run';
        }
    }
}

// getDirAndMainFile takes the string to search (main string) and returns the directory and main file path for the go code using the 
// '// exec_from:[/dir/to/main.go]' keyword in a comment in the given string using one of 2 formats:
// 1. absolute path to the directory and main.go file (/path/to/dir/main.go)
// 2. relative path to the directory and main.go file (./dir/main.go)
export let getDirAndExecFile = (execFrom: string): [string, string] => {
    // exec_from:./apiplayground/main_temp.go
    // split on the colon
    let parts = execFrom.split(':');
    console.log(`getDirAndExecFile parts: ${parts} | execFrom: ${execFrom}`);
    let execFile = execFrom;
    if (parts.length > 1) {
        execFile = parts[1].trim();
    }

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
