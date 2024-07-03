import {
	languages, commands, window, notebooks, workspace,
	ExtensionContext, StatusBarAlignment, ProviderResult, Command,
	NotebookSerializer, NotebookData, NotebookCellData, CancellationToken,
	TreeDataProvider, TreeItem, TreeItemCollapsibleState
} from 'vscode';

import * as codebook from './codebook';

// import { parseMarkdown, writeCellsToMarkdown, RawNotebookCell } from './markdownParser';
import { Kernel } from './kernel';

import * as fs from 'fs';

const kernel = new Kernel();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	const controller = notebooks.createNotebookController('codebook-md', 'codebook-md', 'codebook-md');
	controller.supportedLanguages = [
		'bash',
		'go',
		'http',
		'javascript',
		'json',
		'plaintext',
		'python',
		'rust',
		'sh',
		'shell',
		'shell-script',
		'shellscript',
		'sql',
		'typescript',
		'zsh',
	];
	controller.executeHandler = (cells, doc, ctrl) => {
		if (cells.length > 1) {
			kernel.executeCells(doc, cells, ctrl);
		} else {
			kernel.executeCell(doc, cells[0], ctrl);
		}
	};

	const notebookSettings = {
		transientOutputs: true,
		transientCellMetadata: {
			inputCollapsed: true,
			outputCollapsed: true,
		}
	};

	context.subscriptions.push(workspace.registerNotebookSerializer('codebook-md', new MarkdownProvider(), notebookSettings));

	// hoverProvider will fire-off for any language, but will automatically return if the document.fileName 
	// is not a markdown file
	context.subscriptions.push(languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, new codebook.CellHover()));

	// add the codebook-md.openFileAtLine command
	let disposable = commands.registerCommand('codebook-md.openFileAtLine', async (fileLoc: string, currentFileLoc: string) => {
		console.log(`called codebook-md.openFileAtLine | fileLoc: ${fileLoc} | currentFileLoc: ${currentFileLoc}`);
		const doc = codebook.parseFileLoc(fileLoc, currentFileLoc);
		if (!fs.existsSync(doc.fileLoc)) {
			console.error(`\tfile not found: ${doc.fileLoc}`);
			return;
		}

		console.log(`Opening file ${doc.relativeFileLoc} at line ${doc.lineBegin}`);
		doc.openAndNavigate();
	});

	context.subscriptions.push(disposable);

	// add "CodebookMD" to the status bar that opens the settings for the extension
	const statusBarIcon = window.createStatusBarItem(StatusBarAlignment.Right, 100);
	statusBarIcon.text = 'CodebookMD';
	statusBarIcon.command = 'codebook-md.openSettings';
	statusBarIcon.show();

	context.subscriptions.push(statusBarIcon);

	// add the codebook-md.openSettings command
	disposable = commands.registerCommand('codebook-md.openSettings', async () => {
		console.log('called codebook-md.openSettings');
		commands.executeCommand('workbench.action.openSettings', '@ext:josephbergevin.codebook-md');
	});

	context.subscriptions.push(disposable);

	// Register the TreeDataProvider for your view
	const treeDataProvider = new MyTreeDataProvider();
	window.createTreeView('codebook-md-view', { treeDataProvider });

	// Register the command to open the tree view
	commands.registerCommand('codebook-md.openTreeView', () => {
		commands.executeCommand('workbench.view.extension.codebook-md-activitybar');
	});
}

// MyTreeDataProvider implements TreeDataProvider and provides the data for the tree view
// For now, we'll just return a simple tree with a few hard-coded elements
class MyTreeDataProvider implements TreeDataProvider<MyTreeItem> {
	// Implement the TreeDataProvider methods like getTreeItem and getChildren
	getTreeItem(element: MyTreeItem): TreeItem | Thenable<TreeItem> {
		return element;
	}

	getChildren(element?: MyTreeItem): ProviderResult<MyTreeItem[]> {
		if (element) {
			// Return children of the given element
			return [];
		} else {
			// Return root level elements, each 
			// 1. collapsible
			// 2. with a child element that is not collapsible, but is a link
			const openSettingsCommand: Command = {
				command: 'workbench.action.openSettings',
				title: 'Open Settings',
				arguments: ['@ext:josephbergevin.codebook-md']
			};

			return [
				new MyTreeItem('Welcome to Codebook MD!', TreeItemCollapsibleState.Collapsed),
				new MyTreeItem('Open CodebookMD Settings', TreeItemCollapsibleState.None, openSettingsCommand),
			];
		}
	}
}

// MyTreeItem implements TreeItem and provides the data for each element in the tree view
class MyTreeItem extends TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
		public readonly command?: Command // Add this line
	) {
		super(label, collapsibleState);
		this.command = command; // And this line
	}

	iconPath = {
		light: 'resources/light.svg',
		dark: 'resources/dark.svg'
	};

	contextValue = 'myTreeItem';
}

// This method is called when your extension is deactivated
export function deactivate() { }

class MarkdownProvider implements NotebookSerializer {
	deserializeNotebook(data: Uint8Array, token: CancellationToken): NotebookData | Thenable<NotebookData> {
		// use the token to cancel long running operations
		if (token.isCancellationRequested) {
			return Promise.resolve({ cells: [] });
		}
		const content = Buffer.from(data).toString('utf8');
		const cellRawData = codebook.parseMarkdown(content);
		const cells = cellRawData.map(rawToNotebookCellData);
		return {
			cells
		};
	}

	serializeNotebook(data: NotebookData, token: CancellationToken): Uint8Array | Thenable<Uint8Array> {
		// use the token to cancel long running operations
		if (token.isCancellationRequested) {
			return Promise.resolve(new Uint8Array());
		}
		return Buffer.from(codebook.writeCellsToMarkdown(data.cells));
	}
}

export function rawToNotebookCellData(data: codebook.RawNotebookCell): NotebookCellData {
	return <NotebookCellData>{
		kind: data.kind,
		languageId: data.language,
		metadata: { leadingWhitespace: data.leadingWhitespace, trailingWhitespace: data.trailingWhitespace, indentation: data.indentation },
		outputs: data.outputs || [],
		value: data.content,
	};
}
