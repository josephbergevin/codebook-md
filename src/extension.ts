// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
	// vscode.workspace.updateWorkspaceFolders(0, null, { uri: vscode.Uri.file('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md') });

	// add a folder ('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md') to the workspace
	// vscode.workspace.updateWorkspaceFolders(0, null, { uri: vscode.Uri.file('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md') });

	// open a folder ('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md') in the workspace
	// vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file('/Users/tijoe/go/src/github.com/josephbergevin/codebook-md'));

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

	context.subscriptions.push(
		vscode.commands.registerCommand('codebook-md.showPreview', async () => {
			const panel = vscode.window.createWebviewPanel(
				'filePreview',
				'File Preview',
				vscode.ViewColumn.One,
				{}
			);

			const codeDoc = new md.CodeDocument(
				'/Users/tijoe/example.ts',
				9,
				15,
				'ts',
			);

			const filePath = vscode.Uri.file(codeDoc.fileLoc);
			const fileContent = await vscode.workspace.fs.readFile(filePath);
			const fileText = Buffer.from(fileContent).toString('utf8');

			const previewContent = fileText.split('\n').slice(codeDoc.lineBegin, codeDoc.lineEnd + 1).join('\n');

			panel.webview.html = getWebviewContent(previewContent);
		})
	);

	// hoverProvider will fire-off for any language, but will automatically return if the document.fileName 
	// is not a markdown file
	const hoverProvider = vscode.languages.registerHoverProvider(['*'], {
		provideHover(document, position, token) {
			if (!document.fileName.endsWith('.md')) {
				return;
			}

			const text = document.lineAt(position.line).text;
			const fileLoc = md.findCodeDocument(text);
			if (!fileLoc) {
				console.warn(`No match found for '${text}'`);
				return;
			}

			const doc = md.parseFileLoc(fileLoc, document.uri.fsPath);
			if (!fs.existsSync(doc.fileLoc)) {
				console.error(`File not found: ${doc.fileLoc}`);
				return;
			}

			console.log(`Reading file: ${doc.fileLoc}`);
			let fileContent = fs.readFileSync(doc.fileLoc, 'utf-8');

			// use doc.lineBegin to start from a specific line
			if (doc.lineBegin > 0) {
				const lines = fileContent.split('\n');
				fileContent = lines.slice(doc.lineBegin - 1, doc.lineEnd).join('\n');
			}

			const markdownContent = new vscode.MarkdownString();
			markdownContent.appendCodeblock(fileContent, doc.language);

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
