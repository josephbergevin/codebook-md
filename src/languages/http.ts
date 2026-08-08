import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as config from "../config";
import * as codebook from "../codebook";
import * as io from "../io";
import { NotebookCell, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";

// BodyFilename is the file the request body is written to, next to the generated
// script, and referenced by curl's --data-binary flag.
export const BodyFilename = 'http_request_body.json';

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
    const { curlCommand, body } = this.convertHttpRequestToCurl(this.innerScope);

    // Form the executable code as a bash script that will execute the curl command
    this.executableCode = "#!/bin/bash\n\n";
    this.executableCode += "set -e\n\n";
    this.executableCode += `echo "${codebook.StartOutput}"\n`;
    this.executableCode += curlCommand;
    this.executableCode += `\necho "${codebook.EndOutput}"`;

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

    // Write the request body alongside the script, if the request has one. This
    // is registered here rather than inside convertHttpRequestToCurl, which runs
    // before mainExecutable exists.
    if (body !== undefined) {
      const bodyFilePath = path.join(this.config.execPath, BodyFilename);
      this.mainExecutable.addBeforeExecuteFunc(() => {
        io.writeDirAndFileSyncSafe(this.config.execPath, bodyFilePath, body);
      });
    }

    this.mainExecutable.setCommandToDisplay(curlCommand);
  }

  /**
   * Convert HTTP request format to a curl command.
   *
   * This is a pure function - it must not touch this.mainExecutable, which does
   * not exist yet when the constructor calls it.
   *
   * @param httpRequest The HTTP request in HTTP format
   * @returns The curl command, and the request body if the request has one
   */
  private convertHttpRequestToCurl(httpRequest: string): { curlCommand: string; body?: string; } {
    // Drop comment lines, but keep interior blank lines - the first of them is
    // the separator between the headers and the body, so filtering all blank
    // lines up front would make the body unreachable.
    const lines = httpRequest.split('\n').filter(line => !line.trim().startsWith('#'));
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    const fallback = { curlCommand: `${this.config.execCmd} -v "https://example.com"` };
    if (lines.length === 0) {
      return fallback;
    }

    // The first line should contain the method and URL
    // Example: GET https://example.com
    const firstLine = lines[0].trim();
    const methodUrlMatch = firstLine.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (.+)$/);

    if (!methodUrlMatch) {
      return fallback;
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

      // The first empty line signifies the transition from headers to body;
      // once in the body, empty lines are content and are kept verbatim
      if (line === '' && !inBody) {
        inBody = true;
        continue;
      }

      if (!inBody) {
        // Processing headers
        const headerMatch = line.match(/^([^:]+):(.+)$/);
        if (headerMatch) {
          const headerName = headerMatch[1].trim();
          const headerValue = headerMatch[2].trim();

          // Escape any quotes so the value survives the surrounding shell quoting
          headers.push(`-H "${headerName}: ${headerValue.replace(/"/g, '\\"')}"`);
        }
      } else {
        // Processing body - preserve the line as written
        bodyLines.push(lines[i]);
      }
    }

    // Add headers to curl command
    if (headers.length > 0) {
      curlCmd += " " + headers.join(" ");
    }

    // Add body data if it exists. The body is written to a file next to the
    // script so that quoting, newlines and JSON survive intact.
    const body = bodyLines.join('\n').trim();
    if (body === '') {
      return { curlCommand: curlCmd };
    }

    curlCmd += ` --data-binary @${BodyFilename}`;
    return { curlCommand: curlCmd, body };
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

    const cellConfig = this.contentConfig.cellConfig;
    this.execFilename = codebook.resolveSetting(cellConfig, httpConfig, 'execFilename', 'codebook_md_exec_http.sh');
    this.execFile = path.join(this.execPath, this.execFilename);
    this.execCmd = codebook.resolveSetting(cellConfig, httpConfig, 'execCmd', 'curl');
    // resolveSetting uses `??`, so an explicit `verbose: false` is honored
    this.verbose = codebook.resolveSetting(cellConfig, httpConfig, 'verbose', true);
  }
}
