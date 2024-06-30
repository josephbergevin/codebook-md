// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// import the functions from md.ts
import * as codebook from './codebook';

// import { parseMarkdown, writeCellsToMarkdown, RawNotebookCell } from './markdownParser';
import { Kernel } from './kernel';
import {
	notebooks, workspace,
	CancellationToken, NotebookSerializer, NotebookData, NotebookCellData
} from 'vscode';
import * as fs from 'fs';

const kernel = new Kernel();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
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
		},
		transientDocumentMetadata: {

		}
	};

	context.subscriptions.push(workspace.registerNotebookSerializer('codebook-md', new MarkdownProvider(), notebookSettings));

	// hoverProvider will fire-off for any language, but will automatically return if the document.fileName 
	// is not a markdown file
	context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, new codebook.HoverProvider()));

	// add the codebook-md.openFileAtLine command
	let disposable = vscode.commands.registerCommand('codebook-md.openFileAtLine', async (fileLoc: string, currentFileLoc: string) => {
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
	const statusBarIcon = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarIcon.text = 'CodebookMD';
	statusBarIcon.command = 'codebook-md.openSettings';
	statusBarIcon.show();

	context.subscriptions.push(statusBarIcon);

	// add the codebook-md.openSettings command
	disposable = vscode.commands.registerCommand('codebook-md.openSettings', async () => {
		console.log('called codebook-md.openSettings');
		vscode.commands.executeCommand('workbench.action.openSettings', '@ext:josephbergevin.codebook-md');
	});

	context.subscriptions.push(disposable);

	// Register the TreeDataProvider for your view
	const treeDataProvider = new MyTreeDataProvider();
	vscode.window.createTreeView('codebook-md-view', { treeDataProvider });

	// Register the command to open the tree view
	vscode.commands.registerCommand('codebook-md.openTreeView', () => {
		vscode.commands.executeCommand('workbench.view.extension.codebook-md-activitybar');
	});
}

// MyTreeDataProvider implements vscode.TreeDataProvider and provides the data for the tree view
// For now, we'll just return a simple tree with a few hard-coded elements
class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
	// Implement the TreeDataProvider methods like getTreeItem and getChildren
	getTreeItem(element: MyTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	getChildren(element?: MyTreeItem): vscode.ProviderResult<MyTreeItem[]> {
		if (element) {
			// Return children of the given element
			return [];
		} else {
			// Return root level elements, each 
			// 1. collapsible
			// 2. with a child element that is not collapsible, but is a link
			const openSettingsCommand: vscode.Command = {
				command: 'workbench.action.openSettings',
				title: 'Open Settings',
				arguments: ['@ext:josephbergevin.codebook-md']
			};

			return [
				new MyTreeItem('Welcome to Codebook MD!', vscode.TreeItemCollapsibleState.Collapsed),
				new MyTreeItem('Open CodebookMD Settings', vscode.TreeItemCollapsibleState.None, openSettingsCommand),
			];
		}
	}
}

// MyTreeItem implements vscode.TreeItem and provides the data for each element in the tree view
class MyTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
		public readonly command?: vscode.Command // Add this line
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
	deserializeNotebook(data: Uint8Array, _token: CancellationToken): NotebookData | Thenable<NotebookData> {
		const content = Buffer.from(data).toString('utf8');
		const cellRawData = codebook.parseMarkdown(content);
		const cells = cellRawData.map(rawToNotebookCellData);
		return {
			cells
		};
	}

	serializeNotebook(data: NotebookData, _token: CancellationToken): Uint8Array | Thenable<Uint8Array> {
		const stringOutput = codebook.writeCellsToMarkdown(data.cells);
		return Buffer.from(stringOutput);
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
