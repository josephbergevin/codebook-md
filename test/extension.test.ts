import { getTreeViewFolders, updateTreeViewSettings, TreeViewFolderEntry } from '../src/config';
import { addFileToTreeViewFolder, addFolderToTreeView, addSubFolder, renameFolderDisplay, removeFolderFromTreeView, removeFileFromTreeView, renameTreeViewFile } from '../src/extension';

// Mock the vscode module
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    }),
  },
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInputBox: jest.fn().mockResolvedValue('New Name'),
    showQuickPick: jest.fn().mockResolvedValue({ label: 'Docs', description: 'Docs' }),
    showOpenDialog: jest.fn().mockResolvedValue([{ fsPath: '/path/to/file.md' }]),
  },
  Uri: {
    file: jest.fn(),
  },
  commands: {
    executeCommand: jest.fn(),
  },
  EventEmitter: jest.fn().mockImplementation(() => ({
    event: jest.fn(),
    fire: jest.fn(),
  })),
  TreeItem: jest.fn(),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: jest.fn(),
}));

// Mock the config module
jest.mock('../src/config', () => ({
  ...jest.requireActual('../src/config'),
  getTreeViewFolders: jest.fn().mockReturnValue([]),
  updateTreeViewSettings: jest.fn(),
}));

describe('Tree View Commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('addFileToTreeViewFolder adds a file to the specified folder', async () => {
    const mockFolders: TreeViewFolderEntry[] = [
      { name: 'Docs', files: [], folders: [] },
    ];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await addFileToTreeViewFolder('/path/to/file.md', 'Docs');

    expect(mockFolders[0].files).toHaveLength(1);
    expect(mockFolders[0].files?.[0].name).toBe('New Name');
    expect(mockFolders[0].files?.[0].path).toBe('path/to/file.md');
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });

  test('addFolderToTreeView adds a new folder', async () => {
    const mockFolders: TreeViewFolderEntry[] = [];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await addFolderToTreeView();

    expect(mockFolders).toHaveLength(1);
    expect(mockFolders[0].name).toBe('New Name');
    expect(mockFolders[0].files).toEqual([]);
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });

  test('addSubFolder adds a sub-folder to the specified parent folder', async () => {
    const mockFolders: TreeViewFolderEntry[] = [
      { name: 'Docs', files: [], folders: [] },
    ];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await addSubFolder('Docs');

    expect(mockFolders[0].folders).toHaveLength(1);
    expect(mockFolders[0].folders?.[0].name).toBe('New Name');
    expect(mockFolders[0].folders?.[0].files).toEqual([]);
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });

  test('renameFolderDisplay renames the specified folder', async () => {
    const mockFolders: TreeViewFolderEntry[] = [
      { name: 'Docs', files: [], folders: [] },
    ];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await renameFolderDisplay('Docs', 'Docs');

    expect(mockFolders[0].name).toBe('New Name');
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });

  test('removeFolderFromTreeView removes the specified folder', async () => {
    const mockFolders: TreeViewFolderEntry[] = [
      { name: 'Docs', files: [], folders: [] },
    ];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await removeFolderFromTreeView('Docs');

    expect(mockFolders).toHaveLength(0);
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });

  test('removeFileFromTreeView removes the specified file', async () => {
    const mockFolders: TreeViewFolderEntry[] = [
      { name: 'Docs', files: [{ name: 'ReadMe', path: 'path/to/file.md' }], folders: [] },
    ];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await removeFileFromTreeView({ name: 'ReadMe', path: 'path/to/file.md' });

    expect(mockFolders[0].files).toHaveLength(0);
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });

  test('renameTreeViewFile renames the specified file', async () => {
    const mockFolders: TreeViewFolderEntry[] = [
      { name: 'Docs', files: [{ name: 'ReadMe', path: 'path/to/file.md' }], folders: [] },
    ];
    (getTreeViewFolders as jest.Mock).mockReturnValue(mockFolders);

    await renameTreeViewFile({ name: 'ReadMe', path: 'path/to/file.md' }, 'New Name');

    expect(mockFolders[0].files?.[0].name).toBe('New Name');
    expect(updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
  });
});
