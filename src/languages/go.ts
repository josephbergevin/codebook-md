import { ChildProcessWithoutNullStreams } from "child_process";
import { readFile, writeFileSync } from "fs";
import * as path from "path";
import { workspace, window, WorkspaceConfiguration, NotebookCell } from "vscode";
import * as codebook from "../codebook";
import * as config from "../config";
import * as io from "../io";

// Cell is a class that contains the configuration settings for executing go code from Cells
export class Cell implements codebook.ExecutableCell {
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
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell) {
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
    this.config = new Config(workspace.getConfiguration('codebook-md.go'), notebookCell);

    let parsingIter = 0;
    // We'll add output markers later based on execType
    const lines = notebookCell.document.getText().split("\n");
    for (let line of lines) {
      line = line.trim();
      const funcResult = line.match(this.funcRegex);
      const funcRecResult = line.match(this.funcRecRegex);
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
      } else if (line.startsWith("// [>].execPath:")) {
        // set the execPath value to the line so we can use it later
        this.config.execPath = line;
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

    if (this.config.execType === 'test') {
      // if execType is 'test', create the file in the current package
      // create the execCode for the benchmark file
      const packageName = formatGoPackageName(this.config.execTypeTestConfig.execPath || this.config.execPath);
      this.executableCode = `package ${packageName}\n\n`;
      this.imports.push(`"testing"`);
      this.executableCode += `import (\n\t${this.imports.join("\n\t")}\n)\n\n`;

      // For test mode, we add output markers for capturing output properly
      const formattedInnerScope = `fmt.Println("${codebook.StartOutput}")\n${this.innerScope}\nfmt.Println("${codebook.EndOutput}")`;

      this.executableCode += `func TestExecNotebook(t *testing.T) {\nlog.SetOutput(os.Stdout)\n${formattedInnerScope}\n}\n`;
      this.executableCode += this.outerScope;
    } else {
      // For run mode, we add output markers for capturing output properly
      const formattedInnerScope = `fmt.Println("${codebook.StartOutput}")\n${this.innerScope}\nfmt.Println("${codebook.EndOutput}")`;
      this.executableCode = `package main\n${this.imports}\n\nfunc main() {\nlog.SetOutput(os.Stdout)\n${formattedInnerScope}\n${this.outerScope}\n}\n`;
    }

    // define dir and mainFile as empty strings
    if (this.config.execPath !== "") {
      // notify in vscode with the execPath val
      [this.config.execPath, this.config.execFile] = getDirAndExecFile(this.config.execPath, this.config.execFilename);
    }

    // set the mainExecutable to the bash script
    // this.mainExecutable = new codebook.Command('go', [this.config.execCmd, this.config.execFile], this.config.execPath);

    if (this.config.execType === 'test') {
      // if we're executing with a test, then we won't use the execFile in the command
      this.mainExecutable = new codebook.Command('go', [this.config.execCmd, ...this.config.execArgs], this.config.execPath);
    } else {
      this.mainExecutable = new codebook.Command('go', [this.config.execCmd, ...this.config.execArgs, this.config.execFile], this.config.execPath);
    }

    // add the beforeExecuteFunc to the mainExecutable
    this.mainExecutable.addBeforeExecuteFunc(async () => {
      // define dir and mainFile as empty strings
      if (this.config.execPath !== "") {
        // notify in vscode with the execPath val
        [this.config.execPath, this.config.execFile] = getDirAndExecFile(this.config.execPath, this.config.execFilename);
        // log out a message in vscode to indicate we're using go setting
        window.showInformationMessage('found execPath: ' + this.config.execPath, 'executing from: ' + this.config.execFile);
      }

      // Use the new ConsoleLogger for source-mapped logs
      console.log(`execFile: ${this.config.execFile}`);
      console.log(`cell contents: ${this.executableCode}`);

      // create the directory and main file
      io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, this.executableCode);

      // run goimports on the file
      if (this.config.useGoimports) {
        io.spawnSyncSafe('goimports', ['-w', this.config.execFile], { cwd: this.config.execPath });
      } else {
        io.spawnSyncSafe('gopls', ['imports', '-w', this.config.execFile], { cwd: this.config.execPath });
      }
    });

    // if we're executing with a test, then we'll need to prepend the generate message and the build tag to the file contents
    if (this.config.execType === 'test') {
      this.mainExecutable.addBeforeExecuteFunc(() => {
        // prepend the generate message and the build tag to the file contents
        // read the file contents from the this.config.execFile
        readFile(this.config.execFile, 'utf8', (err, data) => {
          if (err) {
            console.error(err);
            return;
          }
          let fileContents = data;
          fileContents = `// +build ${this.config.execTypeTestConfig.buildTag}\n\n` + fileContents;
          writeFileSync(this.config.execFile, fileContents);
        });
      });
    }

    // Add output filtering if prefixes are configured
    if (this.config.excludeOutputPrefixes.length > 0) {
      this.mainExecutable.addOutputTransformer((output: string) => {
        let filteredOutput = output;
        for (const prefix of this.config.excludeOutputPrefixes) {
          filteredOutput = filteredOutput.split('\n')
            .filter(line => !line.startsWith(prefix))
            .join('\n');
        }
        return filteredOutput;
      });
    }
  }

  allowKeepOutput(): boolean {
    return this.executables().length <= 1;
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
    return this.config.contentConfig;
  }

  toString(): string {
    return this.innerScope;
  }

  execute(): ChildProcessWithoutNullStreams {
    return this.mainExecutable.execute();
  }

  executables(): codebook.Executable[] {
    return [this.mainExecutable, ...this.postExecutables];
  }

  // parseImports parses the imports for the go code in the cell, returning the imports as a sclie of strings
  parseImports(): string[] {
    const imports: string[] = [];
    const lines = this.executableCode.split("\n");
    for (const line of lines) {
      if (line.startsWith("import (")) {
        this.parsingImports = true;
      } else if (this.parsingImports) {
        if (line === ")") {
          this.parsingImports = false;
        } else if (line === "") {
          continue;
        } else {
          imports.push(line);
        }
      } else if (line.startsWith(`import "`)) {
        imports.push(line);
      }
    }
    return imports;
  }

  commentPrefixes(): string[] {
    return ["//"];
  }

  defaultCommentPrefix(): string {
    return "//";
  }
}

// Config is a class that contains the configuration settings for executing go code from Cells
export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  execPathTest?: string; // Field for test-specific exec path
  execType: string;
  execTypeRunConfig: { execPath: string; filename: string; };
  execTypeTestConfig: { execPath: string; filename: string; buildTag: string; };
  execFile: string;
  execFilename: string;
  execPkg: string;
  useGoimports: boolean;
  goimportsCmd: string;
  execCmd: string;
  execArgs: string[];
  excludeOutputPrefixes: string[];

  constructor(goConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.go.output'), "//");

    // Get the execution type configuration
    this.execType = goConfig?.get<string>('execType') ?? 'run';

    // Get the run configuration
    const runConfig = goConfig?.get<{ execPath: string; filename: string; }>('execTypeRunConfig') ?? {
      execPath: ".",
      filename: "main.go"
    };
    this.execTypeRunConfig = runConfig;

    // Get the test configuration
    const testConfig = goConfig?.get<{ execPath: string; filename: string; buildTag: string; }>('execTypeTestConfig') ?? {
      execPath: ".",
      filename: "codebook_md_exec_test.go",
      buildTag: "playground"
    };
    this.execTypeTestConfig = testConfig;

    this.execPath = '';
    this.execFile = "";
    this.execFilename = "";
    this.execPkg = "";
    this.goimportsCmd = goConfig?.get<string>('goimportsCmd') ?? 'gopls imports';
    this.useGoimports = this.goimportsCmd === 'goimports';
    this.execCmd = "";
    this.execArgs = [];
    this.excludeOutputPrefixes = goConfig?.get<string[]>('excludeOutputPrefixes') ?? [];

    // Load cell-specific config from metadata if available
    const cellSpecificConfig = this.contentConfig.cellConfig as Partial<Config>;

    // loop through the codebook commands - these have been cleaned up (trimmed off the // [>] prefix)
    // use any specified config settings to override the defaults
    this.contentConfig.commands.forEach((command) => {
      // Parse configuration comments
      if (command.startsWith('.execPath:')) {
        this.execPath = command; // This might be overridden by cellSpecificConfig or execType logic
      } else if (command.startsWith('.execTypeRunFilename(')) {
        const match = command.match(/\.execTypeRunFilename\("([^"]+)"\)/);
        if (match) {
          this.execTypeRunConfig.filename = match[1];
          if (this.execType === 'run') {
            this.execFilename = match[1];
            this.execFile = path.join(this.execPath, match[1]);
          }
        }
      } else if (command.startsWith('.execTypeTestFilename(')) {
        const match = command.match(/\.execTypeTestFilename\("([^"]+)"\)/);
        if (match) {
          this.execTypeTestConfig.filename = match[1];
          if (this.execType === 'test') {
            this.execFilename = match[1];
            this.execFile = path.join(this.execPath, match[1]);
          }
        }
      } else if (command.startsWith('.execTypeTestBuildTag(')) {
        const match = command.match(/\.execTypeTestBuildTag\("([^"]+)"\)/);
        if (match) {
          this.execTypeTestConfig.buildTag = match[1];
          if (this.execType === 'test') {
            const tagIndex = this.execArgs.findIndex(arg => arg.startsWith('-tags='));
            if (tagIndex !== -1) {
              this.execArgs[tagIndex] = `-tags=${match[1]}`;
            }
          }
        }
      } else if (command.startsWith('.execType(')) {
        const match = command.match(/\.execType\("([^"]+)"\)/);
        if (match && (match[1] === 'run' || match[1] === 'test')) {
          this.execType = match[1];
        }
      } else if (command.startsWith('.goimportsCmd(')) {
        const match = command.match(/\.goimportsCmd\("([^"]+)"\)/);
        if (match) {
          this.goimportsCmd = match[1];
          this.useGoimports = match[1] === 'goimports';
        }
      } else if (command.startsWith('.excludeOutputPrefixes(')) {
        try {
          const match = command.match(/\.excludeOutputPrefixes\((.*)\)/);
          if (match) {
            this.excludeOutputPrefixes = JSON.parse(match[1]);
          }
        } catch (error) {
          console.error('Failed to parse excludeOutputPrefixes:', error);
        }
      }
    });

    // Apply cell-specific config from metadata, which can override defaults or comment-based settings
    if (cellSpecificConfig) {
      if (cellSpecificConfig.execPathTest) {
        this.execPathTest = cellSpecificConfig.execPathTest;
      }
      // If execType is provided in cell config, use it
      if (cellSpecificConfig.execType) {
        this.execType = cellSpecificConfig.execType as string;
      }
    }

    if (this.execType === 'test') {
      const currentFile = window.activeTextEditor?.document.fileName;
      const currentPath = path.dirname(currentFile ?? '');
      // Use our new, improved package name formatter with the full path
      this.execPkg = formatGoPackageName(this.execPathTest || this.execTypeTestConfig.execPath || currentPath);
      // Use execPathTest from cell config if available, otherwise use execTypeTestConfig.execPath or default to currentPath
      this.execPath = this.execPathTest && this.execPathTest.trim() !== '' ?
        this.execPathTest :
        (this.execTypeTestConfig.execPath && this.execTypeTestConfig.execPath !== '.' ?
          this.execTypeTestConfig.execPath :
          currentPath);
      this.execFilename = this.execTypeTestConfig.filename;
      this.execFile = path.join(this.execPath, this.execFilename);
      this.execCmd = 'test';
      this.execArgs = ['-run=TestExecNotebook', `-tags=${this.execTypeTestConfig.buildTag}`, '-v'];
    } else {
      // Use execTypeRunConfig.execPath if not '.', otherwise use general config
      this.execPath = this.execTypeRunConfig.execPath && this.execTypeRunConfig.execPath !== '.' ?
        this.execTypeRunConfig.execPath :
        config.getExecPath();
      this.execFilename = this.execTypeRunConfig.filename;
      this.execFile = path.join(this.execPath, this.execFilename);
      this.execCmd = 'run';
    }
  }
}

// formatGoPackageName takes a path string and formats the folder name to be a valid Go package name
// by extracting the actual directory name from any type of path and ensuring it's a valid Go identifier
export const formatGoPackageName = (pathStr: string): string => {
  console.log(`Determining package name from path: ${pathStr}`);

  // Get the current editor's path as default
  const currentFile = window.activeTextEditor?.document.fileName;
  const currentPath = path.dirname(currentFile ?? '');
  console.log(`Current editor directory: ${currentPath}`);

  // Handle different path scenarios
  let targetPath: string;

  if (pathStr === '.') {
    // Current directory
    targetPath = currentPath;
    console.log(`Path is '.', using current path: ${targetPath}`);
  } else if (pathStr.startsWith('./') || pathStr.startsWith('../')) {
    // Relative path
    targetPath = path.resolve(currentPath, pathStr);
    console.log(`Relative path detected, resolved to: ${targetPath}`);
  } else if (path.isAbsolute(pathStr)) {
    // Absolute path
    targetPath = pathStr;
    console.log(`Absolute path detected: ${targetPath}`);
  } else {
    // Simple directory name or unknown format
    targetPath = path.resolve(currentPath, pathStr);
    console.log(`Unknown path format, resolved to: ${targetPath}`);
  }

  // If the path points to a file, get its containing directory
  if (path.extname(targetPath) !== '') {
    const oldPath = targetPath;
    targetPath = path.dirname(targetPath);
    console.log(`Path pointed to a file (${oldPath}), using directory: ${targetPath}`);
  }

  // Extract just the folder name (not full path)
  let packageName = path.basename(targetPath);
  console.log(`Using folder name for package: ${packageName}`);

  // Remove all dashes and underscores for Go package name compliance
  const originalName = packageName;
  packageName = packageName.replace(/[-_]/g, "");
  if (originalName !== packageName) {
    console.log(`Removed dashes/underscores: ${originalName} → ${packageName}`);
  }

  // Go package names must be valid identifiers, so ensure it starts with a letter
  if (!/^[a-zA-Z]/.test(packageName)) {
    packageName = "gotest" + packageName;
    console.log(`Added 'gotest' prefix to ensure valid identifier: ${packageName}`);
  }

  console.log(`Final package name: ${packageName}`);
  return packageName;
};

// getDirAndExecFile takes the string to search (main string) and returns the directory and main file path for the go code
// using the '// [>]execPath:[/dir/to/main.go]' keyword in a comment in the given string using one of 2 formats:
// 1. absolute path to the directory and main.go file (/path/to/dir/main.go)
// 2. relative path to the directory and main.go file (./dir/main.go)
export const getDirAndExecFile = (execPathFromConfig: string, execFilename: string): [string, string] => {
  console.log(`getDirAndExecFile execPathFromConfig: ${execPathFromConfig}, execFilename: ${execFilename}`);

  // Split on the colon if it's a config string with format ".execPath:path"
  const parts = execPathFromConfig.split(':');
  let pathToResolve = execPathFromConfig;
  if (parts.length > 1) {
    pathToResolve = parts[1].trim();
    console.log(`Found path specification: ${pathToResolve}`);
  }

  // Get the current editor's path as default
  const currentFile = window.activeTextEditor?.document.fileName;
  const currentPath = path.dirname(currentFile ?? '');
  console.log(`Current editor directory: ${currentPath}`);

  // Handle different path scenarios
  let targetPath: string;

  if (pathToResolve === '.') {
    // Current directory
    targetPath = currentPath;
    console.log(`Path is '.', using current path: ${targetPath}`);
  } else if (pathToResolve.startsWith('./') || pathToResolve.startsWith('../')) {
    // Relative path
    targetPath = path.resolve(currentPath, pathToResolve);
    console.log(`Relative path detected, resolved to: ${targetPath}`);
  } else if (path.isAbsolute(pathToResolve)) {
    // Absolute path
    targetPath = pathToResolve;
    console.log(`Absolute path detected: ${targetPath}`);
  } else {
    // Simple directory name or unknown format
    targetPath = path.resolve(currentPath, pathToResolve);
    console.log(`Unknown path format, resolved to: ${targetPath}`);
  }

  let dir: string;
  let execFile: string;

  // Check if the path points to a file or directory
  if (path.extname(targetPath) !== '') {
    // It's a file path
    dir = path.dirname(targetPath);
    execFile = targetPath;
    console.log(`Path points to a file. Directory: ${dir}, File: ${execFile}`);
  } else {
    // It's a directory path
    dir = targetPath;
    execFile = path.join(dir, execFilename);
    console.log(`Path points to a directory. Directory: ${dir}, File: ${execFile}`);
  }

  console.log(`Final paths - Directory: ${dir}, File: ${execFile}`);
  return [dir, execFile];
};

// hello is a function that runs the go code to print "Hello, Go!" and returns the output
