// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// import the functions from fmt.ts
import * as fmt from './fmt';

// import the functions from md.ts
import * as md from './md';

// import { parseMarkdown, writeCellsToMarkdown, RawNotebookCell } from './markdownParser';
import { Kernel } from './kernel';
import {
	notebooks, workspace,
	CancellationToken, NotebookSerializer, NotebookData, NotebookCellData
} from 'vscode';

const kernel = new Kernel();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codebook-md" is now active!');
	// post a message to the vscode OUTPUT
	vscode.window.showInformationMessage('Codebook, MD is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('codebook-md.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage(fmt.helloWorldMessage('Codebook, MD'));
	});

	context.subscriptions.push(disposable);

	const controller = notebooks.createNotebookController('codebook-md', 'codebook-md', 'codebook-md');
	controller.supportedLanguages = [
		'go',
		'javascript',
		'typescript',
		'shellscript',
		'bash',
		'zsh',
		'json',
		'plaintext',
		'sql'
	];
	controller.executeHandler = (cells, doc, ctrl) => {
		if (cells.length > 1) {
			kernel.executeCells(doc, cells, ctrl);
		} else {
			kernel.executeCell(doc, cells, ctrl);
		}
	};

	const notebookSettings = {
		transientOutputs: false,
		transientCellMetadata: {
			inputCollapsed: true,
			outputCollapsed: true,
		}
	};

	context.subscriptions.push(workspace.registerNotebookSerializer('codebook-md', new MarkdownProvider(), notebookSettings));
}

// This method is called when your extension is deactivated
export function deactivate() { }

class MarkdownProvider implements NotebookSerializer {
	deserializeNotebook(data: Uint8Array, _token: CancellationToken): NotebookData | Thenable<NotebookData> {
		const content = Buffer.from(data)
			.toString('utf8');

		const cellRawData = md.parseMarkdown(content);
		const cells = cellRawData.map(rawToNotebookCellData);

		return {
			cells
		};
	}

	serializeNotebook(data: NotebookData, _token: CancellationToken): Uint8Array | Thenable<Uint8Array> {
		const stringOutput = md.writeCellsToMarkdown(data.cells);
		return Buffer.from(stringOutput);
	}
}

export function rawToNotebookCellData(data: md.RawNotebookCell): NotebookCellData {
	return <NotebookCellData>{
		kind: data.kind,
		languageId: data.language,
		metadata: { leadingWhitespace: data.leadingWhitespace, trailingWhitespace: data.trailingWhitespace, indentation: data.indentation },
		outputs: data.outputs || [],
		value: data.content,
	};
}
