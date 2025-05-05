import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import * as io from "../io";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";
import * as fs from "fs";

export class Cell implements codebook.ExecutableCell {
  innerScope: string;
  executableCode: string;

  execCmd: string;
  execArgs: string[];
  mainExecutable: codebook.Command;
  postExecutables: codebook.Executable[] = [];
  config: Config;

  constructor(notebookCell: NotebookCell) {
    // get the configuration for the HTTP language
    this.config = new Config(workspace.getConfiguration('codebook-md.http'), notebookCell);

    // form the innerScope, skipping lines that start with the http comment character #
    const fullInnerScope = this.config.contentConfig.innerScope.trim();
    this.innerScope = fullInnerScope;

    // Parse the HTTP request to convert it to a curl command
    const curlCommand = this.convertHttpRequestToCurl(this.innerScope);

    // Form the executable code as a bash script that will execute the curl command
    this.executableCode = "#!/bin/bash\n\n";
    this.executableCode += "set -e\n\n";
    this.executableCode += curlCommand;

    // Set the execCmd and execArgs to execute the bash script
    this.execCmd = 'bash';
    this.execArgs = [this.config.execFile];

    // Set the mainExecutable to the bash script
    this.mainExecutable = new codebook.Command(this.execCmd, this.execArgs, this.config.execPath);
    this.mainExecutable.addBeforeExecuteFunc(() => {
      // Create the directory and main file
      // Run in a try-catch block to avoid errors if the directory already exists
      io.writeDirAndFileSyncSafe(this.config.execPath, this.config.execFile, this.executableCode);
    });
    this.mainExecutable.setCommandToDisplay(curlCommand);
  }

  /**
   * Convert HTTP request format to a curl command
   * @param httpRequest The HTTP request in HTTP format
   * @returns A curl command string
   */
  private convertHttpRequestToCurl(httpRequest: string): string {
    // Split the request into lines and remove comment lines
    const lines = httpRequest.split('\n')
      .filter(line => !line.trim().startsWith('#') && line.trim() !== '');

    if (lines.length === 0) {
      return `${this.config.execCmd} -v "https://example.com"`;
    }

    // The first line should contain the method and URL
    // Example: GET https://example.com
    const firstLine = lines[0].trim();
    const methodUrlMatch = firstLine.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (.+)$/);

    if (!methodUrlMatch) {
      return `${this.config.execCmd} -v "https://example.com"`;
    }

    const method = methodUrlMatch[1];
    const url = methodUrlMatch[2];

    // Initial curl command
    let curlCmd = `${this.config.execCmd} -X ${method} "${url}"`;

    // Add verbose flag if configured
    if (this.config.verbose) {
      curlCmd += " -v";
    }

    // Process headers and body
    let inBody = false;
    const headers: string[] = [];
    const bodyLines: string[] = [];

    // Process remaining lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Empty line signifies transition from headers to body
      if (line === '') {
        inBody = true;
        continue;
      }

      if (!inBody) {
        // Processing headers
        const headerMatch = line.match(/^([^:]+):(.+)$/);
        if (headerMatch) {
          const headerName = headerMatch[1].trim();
          const headerValue = headerMatch[2].trim();

          // Special handling for Authorization header to properly escape
          if (headerName.toLowerCase() === 'authorization') {
            headers.push(`-H "${headerName}: ${headerValue.replace(/"/g, '\\"')}"`);
          } else {
            headers.push(`-H "${headerName}: ${headerValue}"`);
          }
        }
      } else {
        // Processing body
        bodyLines.push(line);
      }
    }

    // Add headers to curl command
    if (headers.length > 0) {
      curlCmd += " " + headers.join(" ");
    }

    // Add body data if it exists
    if (bodyLines.length > 0) {
      const bodyData = bodyLines.join('\n');

      // Write the body to a temporary file to handle complex body data
      const bodyFileName = 'http_request_body.json';
      const bodyFilePath = path.join(this.config.execPath, bodyFileName);

      // Add a step to create this file in the BeforeExecute function
      this.mainExecutable.addBeforeExecuteFunc(() => {
        fs.writeFileSync(bodyFilePath, bodyData);
      });

      curlCmd += ` --data-binary @${bodyFileName}`;
    }

    return curlCmd;
  }

  codeBlockConfig(): codebook.CodeBlockConfig {
    return this.config.contentConfig;
  }

  toString(): string {
    return this.innerScope;
  }

  execute(): ChildProcessWithoutNullStreams {
    // Use the mainExecutable to execute the bash script
    return this.mainExecutable.execute();
  }

  executables(): codebook.Executable[] {
    return [this.mainExecutable, ...this.postExecutables];
  }

  allowKeepOutput(): boolean {
    return this.executables().length <= 1;
  }

  commentPrefixes(): string[] {
    return ["#"];
  }

  defaultCommentPrefix(): string {
    return "#";
  }
}

export class Config {
  contentConfig: codebook.CodeBlockConfig;
  execPath: string;
  execFile: string;
  execFilename: string;
  execCmd: string;
  verbose: boolean;

  constructor(httpConfig: WorkspaceConfiguration | undefined, notebookCell: NotebookCell) {
    this.contentConfig = new codebook.CodeBlockConfig(notebookCell, workspace.getConfiguration('codebook-md.http.output'), "#");
    this.execPath = config.getExecPath();
    this.execFilename = httpConfig?.get('execFilename') || 'codebook_md_exec_http.sh';
    this.execFile = path.join(this.execPath, this.execFilename);
    this.execCmd = httpConfig?.get('execCmd') || 'curl';
    this.verbose = httpConfig?.get('verbose') || true;
  }
}
