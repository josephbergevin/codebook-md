// md provides the functions to parse the markdown files and extract the code snippets.
import { TextDecoder, TextEncoder } from 'util';
import { NotebookCellKind, NotebookCellData, NotebookCell } from 'vscode';
import { ChildProcessWithoutNullStreams } from "child_process";
import * as vscode from 'vscode';
import * as config from './config';
import * as path from 'path';
import * as fs from 'fs';
import * as go from "./languages/go";
import * as javascript from "./languages/javascript";
import * as typescript from "./languages/typescript";
import * as bash from "./languages/bash";
import * as python from "./languages/python";
import * as unsupported from "./languages/unsupported";
import * as io from './io';

const permalinkPrefix = config.readConfig().permalinkPrefix;

export interface RawNotebookCell {
    indentation?: string;
    leadingWhitespace: string;
    trailingWhitespace: string;
    language: string;
    content: string;
    kind: NotebookCellKind;
    outputs?: [any];
}

export interface Cell {
    execute(): ChildProcessWithoutNullStreams;
    // parseImports(): string[];
    // resolveImports(): Promise<void>;
}

// NewCell returns a new Cell object based on the language of the notebook cell - if the language
// is not supported, it returns an unsupported cell
export function NewCell(notebookCell: NotebookCell): Cell {
    const lang = notebookCell.document.languageId;
    switch (lang) {
        case "go":
            if (io.commandNotOnPath("go", "https://go.dev/doc/install")) {
                return new unsupported.Cell(notebookCell);
            }
            return new go.Cell(notebookCell);

        case "javascript":
        case "js":
            if (io.commandNotOnPath("node", "https://nodejs.org/")) {
                return new unsupported.Cell(notebookCell);
            }
            return new javascript.Cell(notebookCell);

        case "typescript":
        case "ts":
            if (io.commandNotOnPath("ts-node", "https://www.npmjs.com/package/ts-node")) {
                return new unsupported.Cell(notebookCell);
            }
            return new typescript.Cell(notebookCell);

        case "shell":
        case "zsh":
        case "sh":
        case "shellscript":
        case "shell-script":
        case "bash":
            if (io.commandNotOnPath("bash", "https://www.gnu.org/software/bash/")) {
                return new unsupported.Cell(notebookCell);
            }
            return new bash.Cell(notebookCell);

        case "python":
        case "py":
            const pythonCell = new python.Cell(notebookCell);
            if (io.commandNotOnPath(pythonCell.config.execCmd, "https://www.python.org/")) {
                return new unsupported.Cell(notebookCell);
            }
            return pythonCell;

        default:
            // set the output to an error message: "Language '??' not supported"
            // exec.end(true, (new Date).getTime());
            return new unsupported.Cell(notebookCell);
    }
}

export enum CommentDecorator {
    clear = "codebook-md:clear",
    skip = "codebook-md:skip",
}

// StartOutput is a string that indicates the start of an output block
export const StartOutput = `!!output-start-cell`;

// EndOutput is a string that indicates the end of an output block
export const EndOutput = `!!output-end-cell`;

const LANGUAGE_IDS = new Map([
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['rust', 'rust'],
    ['go', 'go'],
    ['nu', 'nushell'],
    ['shell-script', 'bash'],
    ['bash', 'bash'],
    ['sh', 'bash'],
    ['shell', 'bash'],
    ['shellscript', 'bash'],
    ['fish', 'fish'],
    ['zsh', 'zsh'],
    ['openai', 'openai'],
]);

const LANGUAGE_ABBREVS = new Map(
    Array.from(LANGUAGE_IDS.keys()).map(k => [LANGUAGE_IDS.get(k), k])
);

function parseCodeBlockStart(line: string): string | null {
    const match = line.match(/(    |\t)?```(\S*)/);
    if (match) {
        return match[2];
    }
    return null;
}

function isCodeBlockStart(line: string): boolean {
    return !!parseCodeBlockStart(line);
}

function isCodeBlockEndLine(line: string): boolean {
    return !!line.match(/^\s*```/);
}

export function parseMarkdown(content: string): RawNotebookCell[] {
    const lines = content.split(/\r?\n/g);
    let cells: RawNotebookCell[] = [];

    if (lines.length < 2) {
        return cells;
    }
    let i = 0;

    // Each parse function starts with line i, leaves i on the line after the last line parsed
    while (i < lines.length) {
        const leadingWhitespace = i === 0 ? parseWhitespaceLines(true) : '';
        const lang = parseCodeBlockStart(lines[i]);
        if (lang) {
            parseCodeBlock(leadingWhitespace, lang);
        } else {
            parseMarkdownParagraph(leadingWhitespace);
        }
    }


    function parseWhitespaceLines(isFirst: boolean): string {
        let start = i;
        const nextNonWhitespaceLineOffset = lines.slice(start).findIndex(l => l !== '');
        let end: number; // will be next line or overflow
        let isLast = false;
        if (nextNonWhitespaceLineOffset < 0) {
            end = lines.length;
            isLast = true;
        } else {
            end = start + nextNonWhitespaceLineOffset;
        }
        i = end;
        const numWhitespaceLines = end - start + (isFirst || isLast ? 0 : 1);
        return '\n'.repeat(numWhitespaceLines);
    }

    function parseCodeBlock(leadingWhitespace: string, lang: string): void {
        const language = LANGUAGE_IDS.get(lang) || lang;
        const startSourceIdx = ++i;
        while (true) {
            const currLine = lines[i];
            if (i >= lines.length) {
                break;
            } else if (isCodeBlockEndLine(currLine)) {
                i++; // consume block end marker
                break;
            }
            i++;
        }
        const textEncoder = new TextEncoder();
        const content = lines.slice(startSourceIdx, i - 1)
            .join('\n');
        const trailingWhitespace = parseWhitespaceLines(false);
        if (lang === "text") {
            cells[cells.length - 1].outputs = [{ items: [{ data: textEncoder.encode(content), mime: "text/plain" }] }];
        } else {
            cells.push({
                language,
                content,
                kind: NotebookCellKind.Code,
                leadingWhitespace: leadingWhitespace,
                trailingWhitespace: trailingWhitespace,
            });
        }
    }

    function parseMarkdownParagraph(leadingWhitespace: string): void {
        const startSourceIdx = i;
        while (true) {
            if (i >= lines.length) {
                let content = lines.slice(startSourceIdx, i).join('\n').trim();
                cells.push({
                    language: 'markdown',
                    content,
                    kind: NotebookCellKind.Markup,
                    leadingWhitespace: leadingWhitespace,
                    trailingWhitespace: ""
                });
                return;
            }

            const currLine = lines[i];
            if (isCodeBlockStart(currLine)) {
                let content = lines.slice(startSourceIdx, i).join('\n').trim();
                cells.push({
                    language: 'markdown',
                    content,
                    kind: NotebookCellKind.Markup,
                    leadingWhitespace: leadingWhitespace,
                    trailingWhitespace: ""
                });
                return;
            }

            // else if (isGitHubPermalink(currLine)) {
            //     // turn the permalink into a workspace link using permalinkToVSCodeScheme
            //     const workspaceRoot = config.readConfig().rootPath;
            //     const codeDoc = permalinkToCodeDocument(currLine, permalinkPrefix, workspaceRoot);
            //     let newLink = codeDoc.toFullFileLoc();
            //     cells.push({
            //         language: 'markdown',
            //         content: `[Link to Repo](${newLink})`,
            //         kind: NotebookCellKind.Markup,
            //         leadingWhitespace: leadingWhitespace,
            //         trailingWhitespace: ""
            //     });
            //     vscode.window.showTextDocument(
            //         vscode.Uri.file(codeDoc.fileLoc),
            //         { selection: new vscode.Range(codeDoc.lineBegin, 0, codeDoc.lineEnd, 0) },
            //     );
            //     i++;
            //     return;
            // }

            i++;
        }
    }

    return cells;
}

const stringDecoder = new TextDecoder();
export function writeCellsToMarkdown(cells: ReadonlyArray<NotebookCellData>): string {
    let result = '';
    cells.forEach(cell => {
        result += "\n\n";
        if (cell.kind === NotebookCellKind.Code) {
            let outputParsed = "";
            if (cell.outputs) {
                for (const x of cell.outputs) {
                    if (x.items[0].mime.includes("text") && x.items[0].data.length) {
                        outputParsed += stringDecoder.decode(x.items[0].data);
                    }
                }
            }
            const languageAbbrev = LANGUAGE_ABBREVS.get(cell.languageId) ?? cell.languageId;
            const codePrefix = '```' + languageAbbrev + '\n';
            const contents = cell.value.split(/\r?\n/g)
                .join('\n');
            const codeSuffix = '\n```';
            result += codePrefix + contents + codeSuffix;
            if (outputParsed !== '' && outputParsed !== '\n' && outputParsed.length > 0) {
                result += '\n\n```text\n' + outputParsed;
                if (outputParsed.slice(-1) !== '\n') {
                    result += '\n';
                }
                result += '```';
            }
        } else {
            result += cell.value.trim();
        }
    });
    // Each cell adds a newline at the start to keep spacing between code blocks correct,
    // so we'll remove the first newline on the way out
    return result.substring(2);
}

function isGitHubPermalink(line: string): boolean {
    const workspaceRoot = config.readConfig().rootPath;
    // return true if the line starts with or contains the permalink prefix
    console.log(`Checking for permalink:`);
    console.log(`\tworkspaceRoot: ${workspaceRoot}`);
    console.log(`\tline: ${line}`);
    if (line.startsWith(permalinkPrefix)) {
        return true;
    } else if (line.includes(permalinkPrefix)) {
        return true;
    } else {
        console.log(`\t\tNo permalink found: ${line}`);
        return false;
    }
}

// permalinkToVSCodeScheme returns the permalink converted to a CodeDocument object
// permalinkToVSCodeScheme takes a link to a GitHub permalink and converts it to a workspace link by:
// 1. replacing the prefix with the workspace root
// 2. removing the commit hash or branch name
// 3. converting the line number from #L<number>-#L<number> to :<number>-<number>
// Example: 
// - before: https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9
// - after: /Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9
export function permalinkToCodeDocument(permalink: string, permalinkPrefix: string, workspaceRoot: string): CodeDocument {
    const permalinkSuffix = permalink.replace(permalinkPrefix, '');
    const permalinkParts = permalinkSuffix.split('#');
    const filePathParts = permalinkParts[0].split('/');
    const commitHashIndex = filePathParts.findIndex(part => part.length === 40); // assuming commit hash is always 40 characters long
    if (commitHashIndex !== -1) {
        filePathParts.splice(commitHashIndex, 1); // remove the commit hash
    }
    const filePath = filePathParts.join('/');
    const language = filePath.split('.').pop() || 'plaintext';
    const lineNumbers = permalinkParts[1].split('L').join('').split('-');
    return new CodeDocument(
        `${workspaceRoot}/${filePath}`,
        `${workspaceRoot}/${filePath}`,
        parseInt(lineNumbers[0]),
        parseInt(lineNumbers[1]),
        language,
    );
}

// HoverProvider class implements the HoverProvider interface
export class HoverProvider implements vscode.HoverProvider {
    // provideHover returns a hover object for a given position in a document
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        const text = document.lineAt(position.line).text;

        // find the file location in the line
        const fileLoc = findCodeDocument(text);
        if (fileLoc) {
            return this.provideHoverForFileLoc(fileLoc, document);
        }

        // get the cell content that the current line is in
        // const cell = document.getText(document.lineAt(position).range);

        const mdContent = new vscode.MarkdownString();
        mdContent.isTrusted = true;

        // add 3 buttons to the hover: format, clear output, resolve imports
        mdContent.appendMarkdown(`- [format](command:codebook-md.formatCell)\n`);
        mdContent.appendMarkdown(`- [clear output](command:codebook-md.clearOutput)\n`);
        mdContent.appendMarkdown(`- [resolve imports](command:codebook-md.resolveImports)\n`);

        return new vscode.Hover(mdContent);
    }

    provideHoverForFileLoc(fileLoc: string, document: vscode.TextDocument): vscode.ProviderResult<vscode.Hover> {
        const doc = parseFileLoc(fileLoc, document.uri.fsPath);
        if (!fs.existsSync(doc.fileLoc)) {
            console.error(`\tfile not found: ${doc.fileLoc}`);
            return;
        }

        // read the file content
        let fileContent = fs.readFileSync(doc.fileLoc, 'utf-8');

        // use doc.lineBegin to start from a specific line
        let lineCount = fileContent.split('\n').length;
        if (doc.lineBegin > 0) {
            const lines = fileContent.split('\n');
            fileContent = lines.slice(doc.lineBegin - 1, doc.lineEnd).join('\n');
            lineCount = doc.lineEnd - doc.lineBegin + 1;
        }

        const mdContent = new vscode.MarkdownString();
        mdContent.isTrusted = true;

        // Construct the command URI
        const currentFileLoc = document.uri.fsPath;

        // encode the command arguments in a URI friendly way
        const encodedArgs = encodeURIComponent(
            JSON.stringify([
                doc.absoluteFileLocRange(),
                currentFileLoc,
            ])
        );

        // open file link with command: codebook-md.openFileAtLine <fileLoc> <currentFileLoc>
        mdContent.appendMarkdown(`[open file](command:codebook-md.openFileAtLine?${encodedArgs})\n\n`);
        mdContent.appendCodeblock(fileContent, doc.language);

        // if the file view is big enough to have a scroll bar, provide a link to open the file
        if (lineCount > 12) {
            mdContent.appendMarkdown(`[open file](command:codebook-md.openFileAtLine?${encodedArgs})\n\n`);
        }

        return new vscode.Hover(mdContent);
    }
}

// CodeDoc is a class containing the data for a document in vscode: file loc, preview line begin, preview line end, language
export class CodeDocument {
    fileLoc: string;
    resolvePath: string;
    lineBegin: number;
    lineEnd: number;
    language: string;

    constructor(fileLoc: string, resolvePath: string, lineBegin: number, lineEnd: number, language: string) {
        if (lineEnd < lineBegin) {
            lineEnd = lineBegin;
        }
        this.fileLoc = fileLoc;
        this.resolvePath = resolvePath;
        this.lineBegin = lineBegin;
        this.lineEnd = lineEnd;
        this.language = language;
    }

    // absoluteFileLoc returns the absolute file location
    absoluteFileLoc(): string {
        return path.resolve(this.fileLoc);
    }

    // absoluteFileLocPos returns the absolute file location with the line number
    absoluteFileLocPos(): string {
        if (this.lineBegin === 0) {
            return this.absoluteFileLoc();
        }
        return `${this.absoluteFileLoc()}:${this.lineBegin}`;
    }

    // absoluteFileLocRange returns the same as absoluteFileLocPos but with the line range if > 0
    absoluteFileLocRange(): string {
        if (this.lineEnd === 0) {
            return this.absoluteFileLocPos();
        }
        return `${this.absoluteFileLoc()}:${this.lineBegin}-${this.lineEnd}`;
    }

    // relativeFileLoc returns the fileLoc relative to the current open file - also includes the lineBegin if > 0
    // always begins with a ./ or ../
    relativeFileLoc(): string {
        let relPath = path.relative(path.dirname(this.resolvePath), this.fileLoc);
        if (!relPath.startsWith('.')) {
            relPath = './' + relPath;
        }
        return relPath;
    }

    // relativeFileLocPos returns the fileLoc relative to the current open file - also includes the lineBegin if > 0
    // always begins with a ./ or ../
    relativeFileLocPos(): string {
        let relPath = this.relativeFileLoc();
        if (this.lineBegin > 0) {
            return `${relPath}:${this.lineBegin}`;
        }
        return relPath;
    }

    // showTextDocument returns the promise of showing the text document in vscode
    showTextDocument(): Thenable<vscode.TextEditor> {
        return vscode.window.showTextDocument(
            vscode.Uri.file(this.fileLoc),
            { selection: new vscode.Range(this.lineBegin, 0, this.lineEnd, 0) },
        );
    }

    // openAndNavigate opens the file in vscode and navigates to the line
    async openAndNavigate(): Promise<void> {
        console.log(`Opening file: ${this.absoluteFileLoc()} at lineBegin: ${this.lineBegin} and lineEnd: ${this.lineEnd}`);
        const document = await vscode.workspace.openTextDocument(this.absoluteFileLoc()); // Use VS Code's API to open the file
        await vscode.window.showTextDocument(document, {
            preview: false,
            selection: this.lineRange(),
        });
    }

    // lineRange returns the range of the lineBegin and lineEnd
    lineRange(): vscode.Range {
        const positionBegin = new vscode.Position(this.lineBegin, 0);
        let postitionEnd = new vscode.Position(this.lineBegin, 0);
        if (this.lineEnd > this.lineBegin) {
            postitionEnd = new vscode.Position(this.lineEnd, 0);
        }
        return new vscode.Range(positionBegin, postitionEnd);
    }
}

// findCodeDocument returns the CodeDocument object for a given line in a markdown file
export function findCodeDocument(text: string): string | null {
    const regex = /((\.\/|\.\.\/|\/|~\/)[\w/-]+(\.ts|\.sql|\.go|\.json|\.js)(:\d+(-\d+)?)?)/g;
    const match = text.match(regex);
    if (!match) {
        return null;
    }
    return match[0];
}

// newCodeDocument returns a new CodeDocument object from a given file location - if it includes a line number, it will be parsed
export function parseFileLoc(fileLoc: string, resolvePath: string): CodeDocument {
    let fullPath = fileLoc;
    if (!path.isAbsolute(fileLoc) && resolvePath) {
        fullPath = path.resolve(path.dirname(resolvePath), fileLoc);
    }

    let lineBegin = 0;
    let lineEnd = 0;
    const parts = fullPath.split(':');
    fullPath = parts[0];
    if (parts.length > 1) {
        // split the line numbers as well
        const lineParts = parts[1].split('-');
        lineBegin = parseInt(lineParts[0]);
        lineEnd = lineParts.length > 1 ? parseInt(lineParts[1]) : lineBegin;
    }

    let language = 'plaintext';
    const ext = path.extname(fullPath);
    if (ext) {
        language = ext.substring(1);
    }

    return new CodeDocument(fullPath, resolvePath, lineBegin, lineEnd, language);
}

// notebookCellToInnerScope returns the innerScope of a notebook cell, removing 
// 1. any lines that start with the given prefixes
// 2. any lines that are empty
export function notebookCellToInnerScope(cell: vscode.NotebookCell, ...prefixes: string[]): string {
    let lines = cell.document.getText().split("\n");
    let innerScope = "";
    for (let line of lines) {
        if (prefixes.some(prefix => line.startsWith(prefix))) {
            continue;
        } else if (line.trim() === "") {
            continue;
        }
        innerScope += line + "\n";
    }
    return innerScope;
}
