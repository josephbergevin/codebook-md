import * as folders from '../folders';

jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// Mock path module
jest.mock('path', () => ({
  dirname: jest.fn(),
}));

// Mock config module
jest.mock('../config', () => ({
  getCodebookConfigFilePath: jest.fn(() => 'test-config-path'),
}));

describe('folders.ts Test Suite', () => {
  // Existing tests
  describe('suggestedDisplayName', () => {
    it('should properly format filenames', () => {
      const testCases = [
        {
          input: 'hello-world.md',
          expected: 'Hello World'
        },
        {
          input: 'snake_case_file.md',
          expected: 'Snake Case File'
        },
        {
          input: 'multiple.dots.in.filename.md',
          expected: 'Multiple Dots In Filename'
        },
        {
          input: 'Mixed-case_and.separators.md',
          expected: 'Mixed Case And Separators'
        },
        {
          input: 'alreadyPascalCase.md',
          expected: 'Already Pascal Case'
        }
      ];

      for (const testCase of testCases) {
        expect(folders.suggestedDisplayName(testCase.input)).toBe(testCase.expected);
      }
    });
  });

  // New tests for findTargetFolderByEntityId
  describe('findTargetFolderByEntityId', () => {
    let folderGroup: folders.FolderGroup;
    let rootFolder1: folders.FolderGroupFolder;
    let rootFolder2: folders.FolderGroupFolder;
    let nestedFolder1: folders.FolderGroupFolder;
    let nestedFolder2: folders.FolderGroupFolder;
    let deeplyNestedFolder: folders.FolderGroupFolder;

    // Mock console methods to verify logging
    const originalConsoleError = console.error;
    const mockConsoleError = jest.fn();

    beforeEach(() => {
      // Create a new folder group for each test
      folderGroup = new folders.FolderGroup('Test Group', 'test-source', 'Test Description', []);

      // Create test folders at root level
      rootFolder1 = new folders.FolderGroupFolder('Root Folder 1', '');
      rootFolder2 = new folders.FolderGroupFolder('Root Folder 2', '');

      // Create nested folders
      nestedFolder1 = new folders.FolderGroupFolder('Nested Folder 1', '');
      nestedFolder2 = new folders.FolderGroupFolder('Nested Folder 2', '');
      deeplyNestedFolder = new folders.FolderGroupFolder('Deeply Nested Folder', '');

      // Set up folder hierarchy
      nestedFolder1.folders = [deeplyNestedFolder];
      rootFolder1.folders = [nestedFolder1, nestedFolder2];

      // Add root folders to the folder group
      folderGroup.folders = [rootFolder1, rootFolder2];

      // Mock console.error
      console.error = mockConsoleError;
      mockConsoleError.mockReset();
    });

    afterEach(() => {
      // Restore console methods
      console.error = originalConsoleError;
    });

    it('should find a folder at the root level', () => {
      // Root level folder (index 1-based, so "1" refers to the first folder)
      const targetFolder = folderGroup.findTargetFolderByEntityId('1');

      expect(targetFolder).toBeDefined();
      expect(targetFolder).toBe(rootFolder1);
    });

    it('should find a folder at the nested level', () => {
      // Nested folder (1.1 means first child of first root folder, 1-based)
      const targetFolder = folderGroup.findTargetFolderByEntityId('1.1');

      expect(targetFolder).toBeDefined();
      expect(targetFolder).toBe(nestedFolder1);
    });

    it('should find a folder at a deeply nested level', () => {
      // Deeply nested folder (1.1.1 means first child of first child of first root folder)
      const targetFolder = folderGroup.findTargetFolderByEntityId('1.1.1');

      expect(targetFolder).toBeDefined();
      expect(targetFolder).toBe(deeplyNestedFolder);
    });

    it('should return undefined for invalid folder path format', () => {
      const targetFolder = folderGroup.findTargetFolderByEntityId('');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid entityId format')
      );
    });

    it('should return undefined for non-existent folder index', () => {
      // Using index that exceeds the array bounds
      const targetFolder = folderGroup.findTargetFolderByEntityId('9');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find folder')
      );
    });

    it('should return undefined for folder index out of bounds in nested path', () => {
      // Valid root but invalid nested index
      const targetFolder = folderGroup.findTargetFolderByEntityId('1.9');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find folder')
      );
    });

    it('should handle non-numeric folder indices', () => {
      // Non-numeric indices should be NaN after parseInt
      const targetFolder = folderGroup.findTargetFolderByEntityId('abc');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find folder')
      );
    });

    it('should return undefined for partially valid path with invalid end', () => {
      // First part exists (rootFolder1) but second part doesn't
      const targetFolder = folderGroup.findTargetFolderByEntityId('1.3');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find folder')
      );
    });

    it('should handle folder path with correct structure but missing folders', () => {
      // Create a group with empty folders array
      const emptyFolderGroup = new folders.FolderGroup('Empty Group', 'test-source', 'Empty Description', []);
      const targetFolder = emptyFolderGroup.findTargetFolderByEntityId('1');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find folder')
      );
    });

    it('should handle folders with undefined nested folders array', () => {
      // Create a folder with undefined folders array
      const folderWithoutNestedFolders = new folders.FolderGroupFolder('No Nested Folders', '');
      folderGroup.folders = [folderWithoutNestedFolders];

      // Try to access a nested folder
      const targetFolder = folderGroup.findTargetFolderByEntityId('1.1');

      expect(targetFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to find folder')
      );
    });
  });

  // New tests for findTargetParentFolderByEntityId
  describe('findTargetParentFolderByEntityId', () => {
    let folderGroup: folders.FolderGroup;
    let rootFolder1: folders.FolderGroupFolder;
    let rootFolder2: folders.FolderGroupFolder;
    let nestedFolder1: folders.FolderGroupFolder;
    let nestedFolder2: folders.FolderGroupFolder;
    let deeplyNestedFolder: folders.FolderGroupFolder;

    // Mock console methods to verify logging
    const originalConsoleError = console.error;
    const mockConsoleError = jest.fn();

    beforeEach(() => {
      // Create a new folder group for each test
      folderGroup = new folders.FolderGroup('Test Group', 'test-source', 'Test Description', []);

      // Create test folders at root level
      rootFolder1 = new folders.FolderGroupFolder('Root Folder 1', '');
      rootFolder2 = new folders.FolderGroupFolder('Root Folder 2', '');

      // Create nested folders
      nestedFolder1 = new folders.FolderGroupFolder('Nested Folder 1', '');
      nestedFolder2 = new folders.FolderGroupFolder('Nested Folder 2', '');
      deeplyNestedFolder = new folders.FolderGroupFolder('Deeply Nested Folder', '');

      // Set up folder hierarchy
      nestedFolder1.folders = [deeplyNestedFolder];
      rootFolder1.folders = [nestedFolder1, nestedFolder2];

      // Add root folders to the folder group
      folderGroup.folders = [rootFolder1, rootFolder2];

      // Mock console.error
      console.error = mockConsoleError;
      mockConsoleError.mockReset();
    });

    afterEach(() => {
      // Restore console methods
      console.error = originalConsoleError;
    });

    it('should return undefined for a root level folder', () => {
      // Root level folder has no parent folder in the hierarchy
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('1');

      expect(parentFolder).toBeUndefined();
    });

    it('should find the parent folder of a nested folder', () => {
      // For folder path 1.1, the parent is the folder at path 1
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('1.1');

      expect(parentFolder).toBeDefined();
      expect(parentFolder).toBe(rootFolder1);
    });

    it('should find the parent folder of a deeply nested folder', () => {
      // For folder path 1.1.1, the parent is the folder at path 1.1
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('1.1.1');

      expect(parentFolder).toBeDefined();
      expect(parentFolder).toBe(nestedFolder1);
    });

    it('should handle multi-level nesting correctly', () => {
      // Create a more complex nested structure for testing
      const extraNestedFolder = new folders.FolderGroupFolder('Extra Nested', '');
      deeplyNestedFolder.folders = [extraNestedFolder];

      // For folder path 1.1.1.1, the parent is the folder at path 1.1.1
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('1.1.1.1');

      expect(parentFolder).toBeDefined();
      expect(parentFolder).toBe(deeplyNestedFolder);
    });

    it('should return undefined for invalid folder path format', () => {
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('');

      expect(parentFolder).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid entityId format')
      );
    });

    it('should return undefined for non-existent parent path', () => {
      // Path 9.1 doesn't exist, so there's no parent folder to find
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('9.1');

      expect(parentFolder).toBeUndefined();
    });

    it('should handle paths with invalid segments', () => {
      // Path with non-numeric segment
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('abc.1');

      expect(parentFolder).toBeUndefined();
    });

    it('should not find a parent folder when target folder does not exist', () => {
      // Path 1.9.1 - the segment 9 doesn't exist
      const parentFolder = folderGroup.findTargetParentFolderByEntityId('1.9.1');

      expect(parentFolder).toBeUndefined();
    });

    it('should use findTargetFolderByEntityId to locate the parent folder', () => {
      // Spy on findTargetFolderByEntityId to verify it's being called
      const spy = jest.spyOn(folderGroup, 'findTargetFolderByEntityId');

      // Call the method under test
      folderGroup.findTargetParentFolderByEntityId('1.1.1');

      // Verify findTargetFolderByEntityId was called with the parent path
      expect(spy).toHaveBeenCalledWith('1.1');

      // Clean up
      spy.mockRestore();
    });
  });
});
