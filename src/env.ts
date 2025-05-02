import { workspace } from 'vscode';

/**
 * Gets environment variables from VS Code settings and merges them with process.env
 * This allows access to environment variables set in settings.json through terminal.integrated.env.*
 * 
 * @returns An object containing the merged environment variables
 */
export function getMergedEnvironmentVariables(): { [key: string]: string | undefined; } {
  // Clone the current process.env to avoid modifying it directly
  const mergedEnv: { [key: string]: string | undefined; } = { ...process.env };

  // Determine the current platform
  const platform = process.platform;
  let platformKey: string;

  // Map process.platform to the corresponding settings key
  switch (platform) {
    case 'darwin':
      platformKey = 'osx';
      break;
    case 'win32':
      platformKey = 'windows';
      break;
    case 'linux':
      platformKey = 'linux';
      break;
    default:
      platformKey = '';
  }

  if (platformKey) {
    // Check for platform-specific environment variables in VS Code settings
    const terminalConfig = workspace.getConfiguration('terminal.integrated.env');
    const platformEnv = terminalConfig.get<{ [key: string]: string; }>(platformKey);

    // Merge platform-specific environment variables if they exist
    if (platformEnv) {
      console.log(`Found terminal.integrated.env.${platformKey} settings`);
      Object.keys(platformEnv).forEach(key => {
        mergedEnv[key] = platformEnv[key];
      });
    }
  }

  return mergedEnv;
}
