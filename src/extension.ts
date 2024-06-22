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
import * as fs from 'fs';

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
