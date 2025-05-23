import { ChildProcessWithoutNullStreams } from "child_process";
import { readFile, writeFileSync, existsSync } from "fs";
import * as path from "path";
import { join } from "path";
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
    this.innerScope += `\nfmt.Println("${codebook.StartOutput}")\n`;
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

    if (this.config.execTypeTest) {
      // if goConfig.execType is set and the value is 'test`, then create the file in the current package
      // create the execCode for the benchmark file
      let packageName = path.basename(this.config.execPath);
      if (packageName.includes("-")) {
        packageName = packageName.replace("-", "_");
      }
      this.executableCode = `package ${packageName}\n\n`;
      this.imports.push(`"testing"`);
      this.executableCode += `import (\n\t${this.imports.join("\n\t")}\n)\n\n`;
      this.innerScope += `\nfmt.Println("${codebook.EndOutput}")\n`;
      this.executableCode += `func TestExecNotebook(t *testing.T) {\nlog.SetOutput(os.Stdout)\n${this.innerScope}}\n`;
      this.executableCode += this.outerScope;
    } else {
      this.executableCode = `package main\n${this.imports}\n\nfunc main() {\nlog.SetOutput(os.Stdout)\n${this.innerScope} ${this.outerScope}\n}\n`;
    }

    // define dir and mainFile as empty strings
    if (this.config.execPath !== "") {
      // notify in vscode with the execPath val
      [this.config.execPath, this.config.execFile] = getDirAndExecFile(this.config.execPath);
    }

    // set the mainExecutable to the bash script
    // this.mainExecutable = new codebook.Command('go', [this.config.execCmd, this.config.execFile], this.config.execPath);

    if (this.config.execTypeTest) {
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
        [this.config.execPath, this.config.execFile] = getDirAndExecFile(this.config.execPath);
        // log out a message in vscode to indicate we're using go setting
        window.showInformationMessage('found execPath: ' + this.config.execPath, 'executing from: ' + this.config.execFile);
      }

      // Use the new ConsoleLogger for source-mapped logs
      console.log(`execFile: ${this.config.execFile}`);
      console.log(`cell contents: ${this.executableCode}`);

      // create the directory and main file
      io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, this.executableCode);

      // Initialize go.mod if it doesn't exist
      const goModPath = path.join(this.config.execPath, 'go.mod');
      if (!existsSync(goModPath)) {
        const maxRetries = 5; // Increased from 3 to 5
        const initialRetryDelay = 500; // Reduced initial delay (milliseconds)
        let attempt = 0;
        let retryDelay = initialRetryDelay;

        // Try to check file system status before attempting to write
        const checkDirectoryAccess = async (): Promise<boolean> => {
          try {
            // Attempt to write a test file to see if the directory is writable
            const testFilePath = path.join(this.config.execPath, '.test_write_access');
            writeFileSync(testFilePath, 'test');

            // If we get here, we can write to the directory
            try {
              // Clean up the test file
              io.spawnSyncSafe('rm', [testFilePath], { cwd: this.config.execPath });
            } catch (cleanupError) {
              console.warn(`Warning: Failed to clean up test file: ${cleanupError}`);
              // Not being able to clean up isn't a blocker
            }
            return true;
          } catch (error) {
            return false;
          }
        };

        while (attempt < maxRetries) {
          attempt++;

          // Check if the directory is writable before attempting to create go.mod
          const canWrite = await checkDirectoryAccess();
          if (!canWrite) {
            console.log(`Directory not writable, waiting ${retryDelay}ms before retry ${attempt}/${maxRetries}`);
            window.setStatusBarMessage(`Go module initialization: Retry ${attempt}/${maxRetries}`, 2000);

            // Wait before next retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, retryDelay));

            // Exponential backoff: double the delay for next retry, up to 4 seconds
            retryDelay = Math.min(retryDelay * 2, 4000);
            continue;
          }

          try {
            // Use writeFileSync to create a basic go.mod file immediately rather than using spawn
            const moduleName = "example.com/codebook";
            const goModContent = `module ${moduleName}\n\ngo 1.18\n`;

            // Create the file
            writeFileSync(goModPath, goModContent);
            console.log(`Created go.mod at ${goModPath} (attempt ${attempt})`);

            // Report success to the user
            window.setStatusBarMessage(`Go module initialized successfully (attempt ${attempt})`, 3000);

            // Run go mod tidy to ensure dependencies are correctly set up
            try {
              io.spawnSyncSafe('go', ['mod', 'tidy'], { cwd: this.config.execPath });
              console.log("Successfully ran go mod tidy");
              break; // Success - exit the retry loop
            } catch (tidyError) {
              console.warn(`Warning: go mod tidy execution failed (attempt ${attempt}): ${tidyError}`);
              if (attempt === maxRetries) {
                // This was our last attempt
                window.showWarningMessage(`Warning: Go module initialization succeeded but 'go mod tidy' failed after ${maxRetries} attempts. Your code may still execute correctly.`);
              }
            }

            // If we got here without errors, we succeeded in creating go.mod
            break;

          } catch (error: unknown) {
            console.error(`Error initializing go.mod (attempt ${attempt}/${maxRetries}): ${error}`);

            // Check if we should retry based on error type
            const shouldRetry =
              error &&
              typeof error === 'object' &&
              (
                // File system errors
                ('code' in error && (error.code === 'EROFS' || error.code === 'EACCES' || error.code === 'EBUSY' || error.code === 'EAGAIN')) ||
                // Message-based errors
                ('message' in error && typeof error.message === 'string' &&
                  (error.message.includes('go.mod') || error.message.includes('permission denied') ||
                    error.message.includes('read-only') || error.message.includes('file system')))
              );

            if (shouldRetry && attempt < maxRetries) {
              window.setStatusBarMessage(`Go module initialization: Retry ${attempt}/${maxRetries}`, 2000);

              // Wait before next retry with exponential backoff
              await new Promise(resolve => setTimeout(resolve, retryDelay));

              // Exponential backoff: double the delay for next retry, up to 4 seconds
              retryDelay = Math.min(retryDelay * 2, 4000);
              continue;
            }

            // If we get here, either:
            // 1. It's not a retryable error
            // 2. We've exhausted our retries
            if (attempt >= maxRetries) {
              window.showErrorMessage(`Failed to initialize Go module after ${maxRetries} attempts. Error: ${error}`);
            } else {
              window.showErrorMessage(`Failed to initialize Go module: ${error}`);
            }
            break;
          }
        }
      }

      // run goimports on the file
      if (this.config.useGoimports) {
        io.spawnSyncSafe('goimports', ['-w', this.config.execFile], { cwd: this.config.execPath });
      } else {
        io.spawnSyncSafe('gopls', ['imports', '-w', this.config.execFile], { cwd: this.config.execPath });
      }
    });

    // if we're executing with a test, then we'll need to prepend the generate message and the build tag to the file contents
    if (this.config.execTypeTest) {
      this.mainExecutable.addBeforeExecuteFunc(() => {
        // prepend the generate message and the build tag to the file contents
        // read the file contents from the this.config.execFile
        readFile(this.config.execFile, 'utf8', (err, data) => {
          if (err) {
            console.error(err);
            return;
          }
          let fileContents = data;
          fileContents = `// +build ${this.config.execTypeTestBuildTag}\n\n` + fileContents;
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
  execTypeRun: boolean;
  execTypeRunFilename: string;
  execTypeTest: boolean;
  execTypeTestFilename: string;
  execTypeTestBuildTag: string;
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
    const execType = goConfig?.get<string>('execType') ?? 'run';
    this.execPath = '';
    this.execTypeRun = execType === 'run';
    this.execTypeRunFilename = goConfig?.get<string>('execTypeRunFilename') ?? 'main.go';
    this.execTypeTest = execType === 'test';
    this.execTypeTestFilename = goConfig?.get<string>('execTypeTestFilename') ?? 'codebook_md_exec_test.go';
    this.execTypeTestBuildTag = goConfig?.get<string>('execTypeTestBuildTag') ?? 'playground';
    this.execFile = "";
    this.execFilename = "";
    this.execPkg = "";
    this.goimportsCmd = goConfig?.get<string>('goimportsCmd') ?? 'gopls imports';
    this.useGoimports = this.goimportsCmd === 'goimports';
    this.execCmd = "";
    this.execArgs = [];
    this.excludeOutputPrefixes = goConfig?.get<string[]>('excludeOutputPrefixes') ?? [];

    // loop through the codebook commands - these have been cleaned up (trimmed off the // [>] prefix)
    // use any specified config settings to override the defaults
    this.contentConfig.commands.forEach((command) => {
      // Parse configuration comments
      if (command.startsWith('.execPath:')) {
        this.execPath = command;
      } else if (command.startsWith('.execTypeRunFilename(')) {
        const match = command.match(/\.execTypeRunFilename\("([^"]+)"\)/);
        if (match) {
          this.execTypeRunFilename = match[1];
          if (this.execTypeRun) {
            this.execFilename = match[1];
            this.execFile = path.join(this.execPath, match[1]);
          }
        }
      } else if (command.startsWith('.execTypeTestFilename(')) {
        const match = command.match(/\.execTypeTestFilename\("([^"]+)"\)/);
        if (match) {
          this.execTypeTestFilename = match[1];
          if (this.execTypeTest) {
            this.execFilename = match[1];
            this.execFile = path.join(this.execPath, match[1]);
          }
        }
      } else if (command.startsWith('.execTypeTestBuildTag(')) {
        const match = command.match(/\.execTypeTestBuildTag\("([^"]+)"\)/);
        if (match) {
          this.execTypeTestBuildTag = match[1];
          if (this.execTypeTest) {
            const tagIndex = this.execArgs.findIndex(arg => arg.startsWith('-tags='));
            if (tagIndex !== -1) {
              this.execArgs[tagIndex] = `-tags=${match[1]}`;
            }
          }
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
    if (this.execTypeTest) {
      const currentFile = window.activeTextEditor?.document.fileName;
      const currentPath = path.dirname(currentFile ?? '');
      this.execPkg = path.basename(currentPath);
      this.execPath = currentPath;
      this.execFilename = this.execTypeTestFilename;
      this.execFile = path.join(this.execPath, this.execFilename);
      this.execCmd = 'test';
      this.execArgs = ['-run=TestExecNotebook', '-tags=playground', '-v'];
    } else {
      this.execPath = config.getExecPath();
      this.execFilename = this.execTypeRunFilename;
      this.execFile = path.join(this.execPath, this.execFilename);
      this.execCmd = 'run';
    }
  }
}

// getDirAndMainFile takes the string to search (main string) and returns the directory and main file path for the go code using the 
// '// [>]execPath:[/dir/to/main.go]' keyword in a comment in the given string using one of 2 formats:
// 1. absolute path to the directory and main.go file (/path/to/dir/main.go)
// 2. relative path to the directory and main.go file (./dir/main.go)
export const getDirAndExecFile = (execPath: string): [string, string] => {
  // [>]execPath:./apiplayground/main_temp.go
  // split on the colon
  const parts = execPath.split(':');

  // Use the new ConsoleLogger for source-mapped logs
  console.log(`getDirAndExecFile parts: ${parts} | execPath: ${execPath}`);

  let execFile = execPath;
  if (parts.length > 1) {
    execFile = parts[1].trim();
  }

  // if the first part is a '.', then it is a relative path
  if (execFile.startsWith('.')) {
    const currentFile = window.activeTextEditor?.document.fileName;
    const currentPath = path.dirname(currentFile ?? '');
    execFile = join(currentPath, execFile.slice(2));
  }

  // get the directory path
  const dir = path.dirname(execFile);

  // get the main file path
  return [dir, execFile];
};

// hello is a function that runs the go code to print "Hello, Go!" and returns the output
