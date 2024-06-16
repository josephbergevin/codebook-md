// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';

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
	const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'vscode-notebook-cell' }, {
		provideHover(document, position, token) {
			const text = document.lineAt(position.line).text;
			// console.log(`provideHover: ${document.uri.fsPath}\n\tposition: ${position.line}\n\ttext: ${text}`);

			const fileLoc = codebook.findCodeDocument(text);
			if (!fileLoc) {
				// no file link found in the line
				return;
			}

			const doc = codebook.parseFileLoc(fileLoc, document.uri.fsPath);
			if (!fs.existsSync(doc.fileLoc)) {
				console.error(`\tfile not found: ${doc.fileLoc}`);
				return;
			}

			// console.log(`\treading file: ${doc.fileLoc}`);
			// console.log(`\tfullFileLocPos: ${doc.fullFileLocPos()}`);
			let fileContent = fs.readFileSync(doc.fileLoc, 'utf-8');

			// use doc.lineBegin to start from a specific line
			let lineCount = fileContent.split('\n').length;
			if (doc.lineBegin > 0) {
				const lines = fileContent.split('\n');
				fileContent = lines.slice(doc.lineBegin - 1, doc.lineEnd).join('\n');
				lineCount = doc.lineEnd - doc.lineBegin + 1;
			}

			const markdownContent = new vscode.MarkdownString();
			// provide double-click to open the file
			markdownContent.appendMarkdown(`\n[Open file](${doc.fullFileLocPos()})`);
			markdownContent.appendCodeblock(fileContent, doc.language);
			// if the file view is big enough to have a scroll bar, provide a link to open the file
			if (lineCount > 12) {
				markdownContent.appendMarkdown(`\n[Open file](${doc.fullFileLocPos()})`);
			}

			return new vscode.Hover(markdownContent);
		}
	});

	context.subscriptions.push(hoverProvider);
}

function getWebviewContent(content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>File Preview</title>
</head>
<body>
    <pre>${content}</pre>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() { }

class MarkdownProvider implements NotebookSerializer {
	deserializeNotebook(data: Uint8Array, _token: CancellationToken): NotebookData | Thenable<NotebookData> {
		const content = Buffer.from(data)
			.toString('utf8');

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
