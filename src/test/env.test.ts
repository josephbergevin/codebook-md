// filepath: /Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/test/env.test.ts
import { getMergedEnvironmentVariables } from '../env';
import { workspace } from 'vscode';

// Mock vscode API
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn(),
  },
}));

describe('Environment Variable Functions', () => {
  // Store original process.env and platform
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  // Reset mocks and restore process.env after each test
  afterEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };

    // Reset Object.defineProperty for process.platform
    if (Object.defineProperty) {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform
      });
    }
  });

  it('should return process.env when no VS Code settings exist', () => {
    // Mock getConfiguration to return empty settings
    const mockGet = jest.fn().mockReturnValue(undefined);
    const mockGetConfiguration = jest.fn().mockReturnValue({
      get: mockGet
    });
    (workspace.getConfiguration as jest.Mock).mockImplementation(mockGetConfiguration);

    // Set a test environment variable
    process.env.TEST_VAR = 'test_value';

    // Call the function
    const result = getMergedEnvironmentVariables();

    // Verify the result includes the process.env variables
    expect(result).toHaveProperty('TEST_VAR', 'test_value');

    // Verify workspace.getConfiguration was called with the correct parameter
    expect(workspace.getConfiguration).toHaveBeenCalledWith('terminal.integrated.env');
  });

  it('should merge platform-specific environment variables for macOS', () => {
    // Mock process.platform as 'darwin' (macOS)
    if (Object.defineProperty) {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });
    }

    // Mock the VS Code settings for macOS environment variables
    const mockVSCodeEnvVars = {
      VSCODE_VAR: 'vscode_value',
      PATH: '/custom/path'
    };

    const mockGet = jest.fn().mockReturnValue(mockVSCodeEnvVars);
    const mockGetConfiguration = jest.fn().mockReturnValue({
      get: mockGet
    });
    (workspace.getConfiguration as jest.Mock).mockImplementation(mockGetConfiguration);

    // Set a test environment variable
    process.env.TEST_VAR = 'test_value';
    process.env.PATH = '/original/path';

    // Call the function
    const result = getMergedEnvironmentVariables();

    // Verify the result includes both process.env variables and VS Code settings
    expect(result).toHaveProperty('TEST_VAR', 'test_value');
    expect(result).toHaveProperty('VSCODE_VAR', 'vscode_value');
    expect(result).toHaveProperty('PATH', '/custom/path'); // VS Code setting should override process.env

    // Verify workspace.getConfiguration was called with the correct parameter
    expect(workspace.getConfiguration).toHaveBeenCalledWith('terminal.integrated.env');
    expect(mockGet).toHaveBeenCalledWith('osx');
  });

  it('should merge platform-specific environment variables for Windows', () => {
    // Mock process.platform as 'win32' (Windows)
    if (Object.defineProperty) {
      Object.defineProperty(process, 'platform', {
        value: 'win32'
      });
    }

    // Mock the VS Code settings for Windows environment variables
    const mockVSCodeEnvVars = {
      WINDOWS_VAR: 'windows_value'
    };

    const mockGet = jest.fn().mockReturnValue(mockVSCodeEnvVars);
    const mockGetConfiguration = jest.fn().mockReturnValue({
      get: mockGet
    });
    (workspace.getConfiguration as jest.Mock).mockImplementation(mockGetConfiguration);

    // Call the function
    const result = getMergedEnvironmentVariables();

    // Verify the result includes the VS Code setting
    expect(result).toHaveProperty('WINDOWS_VAR', 'windows_value');

    // Verify workspace.getConfiguration was called with the correct parameter
    expect(workspace.getConfiguration).toHaveBeenCalledWith('terminal.integrated.env');
    expect(mockGet).toHaveBeenCalledWith('windows');
  });

  it('should merge platform-specific environment variables for Linux', () => {
    // Mock process.platform as 'linux'
    if (Object.defineProperty) {
      Object.defineProperty(process, 'platform', {
        value: 'linux'
      });
    }

    // Mock the VS Code settings for Linux environment variables
    const mockVSCodeEnvVars = {
      LINUX_VAR: 'linux_value'
    };

    const mockGet = jest.fn().mockReturnValue(mockVSCodeEnvVars);
    const mockGetConfiguration = jest.fn().mockReturnValue({
      get: mockGet
    });
    (workspace.getConfiguration as jest.Mock).mockImplementation(mockGetConfiguration);

    // Call the function
    const result = getMergedEnvironmentVariables();

    // Verify the result includes the VS Code setting
    expect(result).toHaveProperty('LINUX_VAR', 'linux_value');

    // Verify workspace.getConfiguration was called with the correct parameter
    expect(workspace.getConfiguration).toHaveBeenCalledWith('terminal.integrated.env');
    expect(mockGet).toHaveBeenCalledWith('linux');
  });

  it('should handle null or empty environment variables from VS Code settings', () => {
    // Mock process.platform as 'darwin' (macOS)
    if (Object.defineProperty) {
      Object.defineProperty(process, 'platform', {
        value: 'darwin'
      });
    }

    // Mock empty VS Code settings
    const mockGet = jest.fn().mockReturnValue({});
    const mockGetConfiguration = jest.fn().mockReturnValue({
      get: mockGet
    });
    (workspace.getConfiguration as jest.Mock).mockImplementation(mockGetConfiguration);

    // Set a test environment variable
    process.env.TEST_VAR = 'test_value';

    // Call the function
    const result = getMergedEnvironmentVariables();

    // Verify the result maintains the process.env variables
    expect(result).toHaveProperty('TEST_VAR', 'test_value');

    // Verify workspace.getConfiguration was called
    expect(workspace.getConfiguration).toHaveBeenCalledWith('terminal.integrated.env');
  });
});
