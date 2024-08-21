/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChildProcessWithoutNullStreams, spawn, spawnSync, execSync } from "child_process";
import { window, env, Uri } from "vscode";
import { mkdirSync, writeFileSync } from "fs";

// spawnCommand is a helper function to child_process.spawn, with error handling
export const spawnSafe = (command: string, args: string[], options: any): ChildProcessWithoutNullStreams => {
  console.log(`Running ${command} ${args.join(' ')} with options:`, options);
  try {
    return spawn(command, args, options);
  } catch (error) {
    window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }

};

// spawnCommandSync is a helper function to child_process.spawnSync, with error handling
export const spawnSyncSafe = (command: string, args: string[], options: any): string => {
  try {
    const result = spawnSync(command, args, options);
    if (result.error) {
      throw result.error;
    }
    return result.stdout.toString();
  } catch (error) {
    window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }
};

// execCommand is a helper function to child_process.execSync, with error handling
export const execSyncSafe = (command: string): string => {
  try {
    return execSync(command).toString();
  } catch (error) {
    window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }
};

// getCurrentDir is a function to get the directory of the file currently being edited by the user
export const getCurrentDir = (): string => {
  return window.activeTextEditor?.document.uri.fsPath ?? '';
};

// mkdirIfNotExistsSafe checks to see if the directory exists
// if it exists, returns early
// if it doesn't exist, creates the directory, and posts a notification to the user
// if there is an error, posts an error message to the user
export const mkdirIfNotExistsSafe = (dir: string): void => {
  // if the directory is blank or '.', return early
  if (dir === '' || dir === '.') {
    return;
  }

  try {
    mkdirSync(dir, { recursive: true });
    window.showInformationMessage(`created exec dir: '${dir}'`);
  } catch (error) {
    window.showErrorMessage(`error creating exec dir ${dir}: ${error}`);
  }
};

// writeDirAndFileSync writes a file to a directory, creating the directory if it doesn't exist
export function writeDirAndFileSyncSafe(dir: string, file: string, data: string) {
  try {
    mkdirIfNotExistsSafe(dir);
    writeFileSync(file, data);
  } catch (error) {
    console.error("error writing file: ", error);
  }
}

// commandNotOnPath checks if a command is on the system path
export const commandNotOnPath = (command: string, link: string): boolean => {
  try {
    // Use the "where" command on Windows or the "which" command on macOS/Linux
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${cmd} ${command}`, { stdio: 'ignore' });
    return false;
  } catch (error) {
    if (link) {
      window.showErrorMessage(`command: ${command} not on path. Add to path or follow link to install`, ...[`Install ${command}`]).then(() => {
        env.openExternal(Uri.parse(link));
      });
    }
    return true;
  }
};
