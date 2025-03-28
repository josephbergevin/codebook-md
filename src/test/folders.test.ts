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

describe('config.ts Test Suite', () => {
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

  describe('moveTreeViewItemDown', () => {
    let folderGroup: folders.FolderGroup;

    beforeEach(() => {
      // Set up a test folder structure
      folderGroup = new folders.FolderGroup('Test', 'test/settings.json', [
        new folders.FolderGroupFolder('Folder1'),
        new folders.FolderGroupFolder('Folder2'),
        new folders.FolderGroupFolder('Folder3')
      ]);

      // Add some files to Folder1
      const folder1 = folderGroup.folders[0];
      folder1.files = [
        new folders.FolderGroupFile('File1', 'path1'),
        new folders.FolderGroupFile('File2', 'path2'),
        new folders.FolderGroupFile('File3', 'path3')
      ];

      // Add nested folders to Folder2
      const folder2 = folderGroup.folders[1];
      folder2.folders = [
        new folders.FolderGroupFolder('Nested1'),
        new folders.FolderGroupFolder('Nested2')
      ];
    });

    it('should move a root-level folder down', () => {
      const moved = folderGroup.moveTreeViewItemDown('0');
      expect(moved).toBe(true);
      expect(folderGroup.folders[0].name).toBe('Folder2');
      expect(folderGroup.folders[1].name).toBe('Folder1');
    });

    it('should not move the last root-level folder down', () => {
      const moved = folderGroup.moveTreeViewItemDown('2');
      expect(moved).toBe(false);
      expect(folderGroup.folders[2].name).toBe('Folder3');
    });

    it('should move a file down within its folder', () => {
      const moved = folderGroup.moveTreeViewItemDown('0[0]');
      expect(moved).toBe(true);
      const folder1 = folderGroup.folders[0];
      expect(folder1.files[0].name).toBe('File2');
      expect(folder1.files[1].name).toBe('File1');
    });

    it('should not move the last file down', () => {
      const moved = folderGroup.moveTreeViewItemDown('0[2]');
      expect(moved).toBe(false);
      const folder1 = folderGroup.folders[0];
      expect(folder1.files[2].name).toBe('File3');
    });

    it('should move a nested folder down', () => {
      const moved = folderGroup.moveTreeViewItemDown('1.0');
      expect(moved).toBe(true);
      const folder2 = folderGroup.folders[1];
      expect(folder2.folders[0].name).toBe('Nested2');
      expect(folder2.folders[1].name).toBe('Nested1');
    });

    it('should not move a folder down with invalid object id', () => {
      const moved = folderGroup.moveTreeViewItemDown('invalid.id');
      expect(moved).toBe(false);
    });

    it('should not move a file down with invalid object id', () => {
      const moved = folderGroup.moveTreeViewItemDown('0[invalid]');
      expect(moved).toBe(false);
    });
  });

  describe('moveTreeViewItemUp', () => {
    let folderGroup: folders.FolderGroup;

    beforeEach(() => {
      // Set up a test folder structure
      folderGroup = new folders.FolderGroup('Test', 'test/settings.json', [
        new folders.FolderGroupFolder('Folder1'),
        new folders.FolderGroupFolder('Folder2'),
        new folders.FolderGroupFolder('Folder3')
      ]);

      // Add some files to Folder1
      const folder1 = folderGroup.folders[0];
      folder1.files = [
        new folders.FolderGroupFile('File1', 'path1'),
        new folders.FolderGroupFile('File2', 'path2'),
        new folders.FolderGroupFile('File3', 'path3')
      ];

      // Add nested folders to Folder2
      const folder2 = folderGroup.folders[1];
      folder2.folders = [
        new folders.FolderGroupFolder('Nested1'),
        new folders.FolderGroupFolder('Nested2')
      ];
    });

    it('should move a root-level folder up', () => {
      const moved = folderGroup.moveTreeViewItemUp('1');
      expect(moved).toBe(true);
      expect(folderGroup.folders[0].name).toBe('Folder2');
      expect(folderGroup.folders[1].name).toBe('Folder1');
    });

    it('should not move the first root-level folder up', () => {
      const moved = folderGroup.moveTreeViewItemUp('0');
      expect(moved).toBe(false);
      expect(folderGroup.folders[0].name).toBe('Folder1');
    });

    it('should move a file up within its folder', () => {
      const moved = folderGroup.moveTreeViewItemUp('0[1]');
      expect(moved).toBe(true);
      const folder1 = folderGroup.folders[0];
      expect(folder1.files[0].name).toBe('File2');
      expect(folder1.files[1].name).toBe('File1');
    });

    it('should not move the first file up', () => {
      const moved = folderGroup.moveTreeViewItemUp('0[0]');
      expect(moved).toBe(false);
      const folder1 = folderGroup.folders[0];
      expect(folder1.files[0].name).toBe('File1');
    });

    it('should move a nested folder up', () => {
      const moved = folderGroup.moveTreeViewItemUp('1.1');
      expect(moved).toBe(true);
      const folder2 = folderGroup.folders[1];
      expect(folder2.folders[0].name).toBe('Nested2');
      expect(folder2.folders[1].name).toBe('Nested1');
    });

    it('should not move a folder up with invalid object id', () => {
      const moved = folderGroup.moveTreeViewItemUp('invalid.id');
      expect(moved).toBe(false);
    });

    it('should not move a file up with invalid object id', () => {
      const moved = folderGroup.moveTreeViewItemUp('0[invalid]');
      expect(moved).toBe(false);
    });

    it('should not move first nested folder up', () => {
      const moved = folderGroup.moveTreeViewItemUp('1.0');
      expect(moved).toBe(false);
      const folder2 = folderGroup.folders[1];
      expect(folder2.folders[0].name).toBe('Nested1');
    });
  });

  describe('findTargetFolderByObjectId', () => {
    let folderGroup: folders.FolderGroup;

    beforeEach(() => {
      // Set up a test folder structure
      folderGroup = new folders.FolderGroup('Test', 'test/settings.json', [
        new folders.FolderGroupFolder('Folder1'),
        new folders.FolderGroupFolder('Folder2'),
        new folders.FolderGroupFolder('Folder3')
      ]);

      // Add some files to Folder1
      const folder1 = folderGroup.folders[0];
      folder1.files = [
        new folders.FolderGroupFile('File1', 'path1'),
        new folders.FolderGroupFile('File2', 'path2')
      ];

      // Add nested folders to Folder2
      const folder2 = folderGroup.folders[1];
      folder2.folders = [
        new folders.FolderGroupFolder('Nested1'),
        new folders.FolderGroupFolder('Nested2')
      ];

      // Add deeply nested folder
      folder2.folders[0].folders = [
        new folders.FolderGroupFolder('DeepNested')
      ];
    });

    it('should find root-level folder', () => {
      const folder = folderGroup.findTargetFolderByObjectId('0');
      expect(folder).toBeDefined();
      expect(folder?.name).toBe('Folder1');
    });

    it('should find nested folder', () => {
      const folder = folderGroup.findTargetFolderByObjectId('1.0');
      expect(folder).toBeDefined();
      expect(folder?.name).toBe('Nested1');
    });

    it('should find deeply nested folder', () => {
      const folder = folderGroup.findTargetFolderByObjectId('1.0.0');
      expect(folder).toBeDefined();
      expect(folder?.name).toBe('DeepNested');
    });

    it('should find folder containing a file', () => {
      const folder = folderGroup.findTargetFolderByObjectId('0[1]');
      expect(folder).toBeDefined();
      expect(folder?.name).toBe('Folder1');
      expect(folder?.files[1].name).toBe('File2');
    });

    it('should return undefined for invalid object id format', () => {
      const folder = folderGroup.findTargetFolderByObjectId('invalid.id');
      expect(folder).toBeUndefined();
    });

    it('should return undefined for out of bounds folder index', () => {
      const folder = folderGroup.findTargetFolderByObjectId('5');
      expect(folder).toBeUndefined();
    });

    it('should return undefined for out of bounds nested folder index', () => {
      const folder = folderGroup.findTargetFolderByObjectId('1.5');
      expect(folder).toBeUndefined();
    });

    it('should return undefined for non-existent nested path', () => {
      const folder = folderGroup.findTargetFolderByObjectId('0.0.0');
      expect(folder).toBeUndefined();
    });

    it('should handle empty object id', () => {
      const folder = folderGroup.findTargetFolderByObjectId('');
      expect(folder).toBeUndefined();
    });
  });

  describe('findTargetParentFolderByObjectId', () => {
    let folderGroup: folders.FolderGroup;

    beforeEach(() => {
      // Set up a test folder structure
      folderGroup = new folders.FolderGroup('Test', 'test/settings.json', [
        new folders.FolderGroupFolder('Folder1'),
        new folders.FolderGroupFolder('Folder2'),
        new folders.FolderGroupFolder('Folder3')
      ]);

      // Add some files to Folder1
      const folder1 = folderGroup.folders[0];
      folder1.files = [
        new folders.FolderGroupFile('File1', 'path1'),
        new folders.FolderGroupFile('File2', 'path2')
      ];

      // Add nested folders to Folder2
      const folder2 = folderGroup.folders[1];
      folder2.folders = [
        new folders.FolderGroupFolder('Nested1'),
        new folders.FolderGroupFolder('Nested2')
      ];

      // Add deeply nested folder
      folder2.folders[0].folders = [
        new folders.FolderGroupFolder('DeepNested')
      ];
    });

    it('should return undefined for root-level folder', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('0');
      expect(parent).toBeUndefined();
    });

    it('should return undefined for root-level folder with file', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('0[0]');
      expect(parent).toBeUndefined();
    });

    it('should find parent of nested folder', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('1.0');
      expect(parent).toBeDefined();
      expect(parent?.name).toBe('Folder2');
    });

    it('should find parent of deeply nested folder', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('1.0.0');
      expect(parent).toBeDefined();
      expect(parent?.name).toBe('Nested1');
    });

    it('should return undefined for invalid object id format', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('invalid.id');
      expect(parent).toBeUndefined();
    });

    it('should return undefined for out of bounds folder index', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('5.0');
      expect(parent).toBeUndefined();
    });

    it('should return undefined for out of bounds nested folder index', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('1.5.0');
      expect(parent).toBeUndefined();
    });

    it('should return undefined for empty object id', () => {
      const parent = folderGroup.findTargetParentFolderByObjectId('');
      expect(parent).toBeUndefined();
    });

    it('should return parent folder for file in nested folder', () => {
      // First add a file to Nested1
      const folder2 = folderGroup.folders[1];
      folder2.folders[0].files = [
        new folders.FolderGroupFile('NestedFile', 'nested/path')
      ];

      const parent = folderGroup.findTargetParentFolderByObjectId('1.0[0]');
      expect(parent).toBeDefined();
      expect(parent?.name).toBe('Nested1');
    });
  });

  describe('objectIdFileIndex', () => {
    it('should return file index for valid file objectId', () => {
      expect(folders.objectIdFileIndex('0[1]')).toBe(1);
      expect(folders.objectIdFileIndex('1.2[3]')).toBe(3);
      expect(folders.objectIdFileIndex('0.1.2[4]')).toBe(4);
    });

    it('should return -1 for folder objectId', () => {
      expect(folders.objectIdFileIndex('0')).toBe(-1);
      expect(folders.objectIdFileIndex('1.2')).toBe(-1);
      expect(folders.objectIdFileIndex('0.1.2')).toBe(-1);
    });

    it('should return -1 for invalid file index format', () => {
      expect(folders.objectIdFileIndex('0[a]')).toBe(-1);
      expect(folders.objectIdFileIndex('1.2[abc]')).toBe(-1);
      expect(folders.objectIdFileIndex('0[]')).toBe(-1);
    });

    it('should return -1 for empty string', () => {
      expect(folders.objectIdFileIndex('')).toBe(-1);
    });

    it('should return -1 for malformed brackets', () => {
      expect(folders.objectIdFileIndex('0]1[')).toBe(-1);
      expect(folders.objectIdFileIndex('0[[1]]')).toBe(-1);
      expect(folders.objectIdFileIndex('0[1')).toBe(-1);
      expect(folders.objectIdFileIndex('0]1')).toBe(-1);
    });

    it('should handle large file indices', () => {
      expect(folders.objectIdFileIndex('0[999]')).toBe(999);
      expect(folders.objectIdFileIndex('1.2[1000000]')).toBe(1000000);
    });

    it('should return -1 for negative file indices', () => {
      expect(folders.objectIdFileIndex('0[-1]')).toBe(-1);
      expect(folders.objectIdFileIndex('1.2[-42]')).toBe(-1);
    });
  });
});
