// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// import the functions from fmt.ts
import * as fmt from './fmt';

// import the functions from md.ts
import * as codebook from './codebook';

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
	const controller = notebooks.createNotebookController('codebook-md', 'codebook-md', 'codebook-md');
	controller.supportedLanguages = [
		'bash',
		'go',
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
			kernel.executeCell(doc, cells, ctrl);
		}
	};

	const notebookSettings = {
		transientOutputs: false,
		transientCellMetadata: {
			inputCollapsed: true,
			outputCollapsed: true,
		},
		// Hypothetical additional settings
		autoSave: false, // Automatically save notebook changes
		autoRunCells: false, // Automatically run all cells upon opening a notebook
		cellExecutionTimeout: 10000, // Maximum execution time for a cell in milliseconds
		showLineNumbers: true, // Show line numbers in notebook cells
		// theme: 'light', // Default theme for the notebook ('light' or 'dark')
		enableCellFolding: true, // Allow folding of code within cells
		// defaultKernel: 'Python 3', // Default kernel to use for new notebooks
		maxOutputSize: 1024, // Maximum size in KB for cell output before truncation
		enableMarkdownPreview: false, // Enable or disable Markdown preview in markdown cells
	};

	context.subscriptions.push(workspace.registerNotebookSerializer('codebook-md', new MarkdownProvider(), notebookSettings));

	// hoverProvider will fire-off for any language, but will automatically return if the document.fileName 
	// is not a markdown file
	context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, new codebook.HoverProvider()));
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
