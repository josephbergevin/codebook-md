// md provides the functions to parse the markdown files and extract the code snippets.
import { TextDecoder, TextEncoder } from 'util';
import { NotebookCellKind, NotebookCellData, NotebookCell } from 'vscode';
import * as vscode from 'vscode';
import * as config from './config';
import * as path from 'path';


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
    index: number;
    contents: string;
    cell: NotebookCell;
}

export enum CommentDecorator {
    clear = "codebook-md:clear",
    skip = "codebook-md:skip",
}

interface ICodeBlockStart {
    langId: string;
}

const LANG_IDS = new Map([
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

const LANG_ABBREVS = new Map(
    Array.from(LANG_IDS.keys()).map(k => [LANG_IDS.get(k), k])
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
        const language = LANG_IDS.get(lang) || lang;
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
    for (let i = 0; i < cells.length; i++) {
        result += "\n\n";
        const cell = cells[i];
        if (cell.kind === NotebookCellKind.Code) {
            let outputParsed = "";
            if (cell.outputs) {
                for (const x of cell.outputs) {
                    if (x.items[0].mime.includes("text") && x.items[0].data.length) {
                        outputParsed += stringDecoder.decode(x.items[0].data);
                    }
                }
            }
            const languageAbbrev = LANG_ABBREVS.get(cell.languageId) ?? cell.languageId;
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
    }
    // Each cell adds a newline at the start to keep spacing between code blocks correct
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
        parseInt(lineNumbers[0]),
        parseInt(lineNumbers[1]),
        language,
    );
}

// CodeDoc is a class containing the data for a document in vscode: file loc, preview line begin, preview line end, language
export class CodeDocument {
    fileLoc: string;
    lineBegin: number;
    lineEnd: number;
    language: string;

    constructor(fileLoc: string, lineBegin: number, lineEnd: number, language: string) {
        if (lineEnd < lineBegin) {
            lineEnd = lineBegin;
        }
        this.fileLoc = fileLoc;
        this.lineBegin = lineBegin;
        this.lineEnd = lineEnd;
        this.language = language;
    }

    // returns the fileLoc - also includes the lineBegin if > 0
    toFullFileLocPos(): string {
        if (this.lineBegin > 0) {
            return `${this.fileLoc}:${this.lineBegin}`;
        }
        return this.fileLoc;
    }

    // showTextDocument returns the promise of showing the text document in vscode
    showTextDocument(): Thenable<vscode.TextEditor> {
        return vscode.window.showTextDocument(
            vscode.Uri.file(this.fileLoc),
            { selection: new vscode.Range(this.lineBegin, 0, this.lineEnd, 0) },
        );
    }
}

// findCodeDocument returns the CodeDocument object for a given line in a markdown file
export function findCodeDocument(text: string): string | null {
    const regex = /((\.\/|\.\.\/|\/|~\/)[\w/-]+(\.ts|\.sql|\.go)(:\d+(-\d+)?)?)/g;
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
    console.log(`Full path: ${fullPath}`);

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

    return new CodeDocument(fullPath, lineBegin, lineEnd, language);
}
