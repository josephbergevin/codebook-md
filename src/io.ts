import { ChildProcessWithoutNullStreams, spawn, spawnSync, execSync } from "child_process";
import vscode from "vscode";

// spawnCommand is a helper function to child_process.spawn, with error handling
export const spawnCommand = (command: string, args: string[], options: any): ChildProcessWithoutNullStreams => {
  console.log(`Running ${command} ${args.join(' ')} with options:`, options);
  try {
    return spawn(command, args, options);
  } catch (error) {
    vscode.window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }

};

// spawnCommandSync is a helper function to child_process.spawnSync, with error handling
export const spawnCommandSync = (command: string, args: string[], options: any): string => {
  try {
    const result = spawnSync(command, args, options);
    if (result.error) {
      throw result.error;
    }
    return result.stdout.toString();
  } catch (error) {
    vscode.window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }
};

// execCommand is a helper function to child_process.execSync, with error handling
export const execCommand = (command: string): string => {
  try {
    return execSync(command).toString();
  } catch (error) {
    vscode.window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }
};

// execCommandSync is a helper function to child_process.exec, with error handling
export const execCommandSync = (command: string): string => {
  try {
    return execSync(command).toString();
  } catch (error) {
    vscode.window.showErrorMessage(`Error running ${command}: ${error}`);
    throw error;
  }
};

// commandNotOnPath checks if a command is on the system path
export const commandNotOnPath = (command: string, link: string): boolean => {
  try {
    // Use the "where" command on Windows or the "which" command on macOS/Linux
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${cmd} ${command}`, { stdio: 'ignore' });
    return false;
  } catch (error) {
    if (link) {
      vscode.window.showErrorMessage(`command: ${command} not on path. Add to path or follow link to install`, ...[`Install ${command}`]).then((_) => {
        vscode.env.openExternal(vscode.Uri.parse(link));
      });
    }
    return true;
  }
};
