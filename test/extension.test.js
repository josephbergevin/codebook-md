"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../src/config");
const extension_1 = require("../src/extension");
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
jest.mock('../src/config', () => (Object.assign(Object.assign({}, jest.requireActual('../src/config')), { getTreeViewFolders: jest.fn().mockReturnValue([]), updateTreeViewSettings: jest.fn() })));
describe('Tree View Commands', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('addFileToTreeViewFolder adds a file to the specified folder', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const mockFolders = [
            { name: 'Docs', files: [], folders: [] },
        ];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.addFileToTreeViewFolder)('/path/to/file.md', 'Docs');
        expect(mockFolders[0].files).toHaveLength(1);
        expect((_a = mockFolders[0].files) === null || _a === void 0 ? void 0 : _a[0].name).toBe('New Name');
        expect((_b = mockFolders[0].files) === null || _b === void 0 ? void 0 : _b[0].path).toBe('path/to/file.md');
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
    test('addFolderToTreeView adds a new folder', () => __awaiter(void 0, void 0, void 0, function* () {
        const mockFolders = [];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.addFolderToTreeView)();
        expect(mockFolders).toHaveLength(1);
        expect(mockFolders[0].name).toBe('New Name');
        expect(mockFolders[0].files).toEqual([]);
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
    test('addSubFolder adds a sub-folder to the specified parent folder', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const mockFolders = [
            { name: 'Docs', files: [], folders: [] },
        ];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.addSubFolder)('Docs');
        expect(mockFolders[0].folders).toHaveLength(1);
        expect((_a = mockFolders[0].folders) === null || _a === void 0 ? void 0 : _a[0].name).toBe('New Name');
        expect((_b = mockFolders[0].folders) === null || _b === void 0 ? void 0 : _b[0].files).toEqual([]);
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
    test('renameFolderDisplay renames the specified folder', () => __awaiter(void 0, void 0, void 0, function* () {
        const mockFolders = [
            { name: 'Docs', files: [], folders: [] },
        ];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.renameFolderDisplay)('Docs', 'Docs');
        expect(mockFolders[0].name).toBe('New Name');
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
    test('removeFolderFromTreeView removes the specified folder', () => __awaiter(void 0, void 0, void 0, function* () {
        const mockFolders = [
            { name: 'Docs', files: [], folders: [] },
        ];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.removeFolderFromTreeView)('Docs');
        expect(mockFolders).toHaveLength(0);
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
    test('removeFileFromTreeView removes the specified file', () => __awaiter(void 0, void 0, void 0, function* () {
        const mockFolders = [
            { name: 'Docs', files: [{ name: 'ReadMe', path: 'path/to/file.md' }], folders: [] },
        ];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.removeFileFromTreeView)({ name: 'ReadMe', path: 'path/to/file.md' });
        expect(mockFolders[0].files).toHaveLength(0);
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
    test('renameTreeViewFile renames the specified file', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const mockFolders = [
            { name: 'Docs', files: [{ name: 'ReadMe', path: 'path/to/file.md' }], folders: [] },
        ];
        config_1.getTreeViewFolders.mockReturnValue(mockFolders);
        yield (0, extension_1.renameTreeViewFile)({ name: 'ReadMe', path: 'path/to/file.md' }, 'New Name');
        expect((_a = mockFolders[0].files) === null || _a === void 0 ? void 0 : _a[0].name).toBe('New Name');
        expect(config_1.updateTreeViewSettings).toHaveBeenCalledWith(mockFolders);
    }));
});
//# sourceMappingURL=extension.test.js.map