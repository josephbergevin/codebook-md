// md provides the functions to parse the markdown files and extract the code snippets.
import { TextDecoder, TextEncoder } from 'util';
import { NotebookCellKind, NotebookCellData, window } from 'vscode';
import { workspace } from 'vscode';
import * as config from './config';


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

interface ICodeBlockStart {
    langId: string;
}

const LANG_IDS = new Map([
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['rust', 'rust'],
    ['go', 'go'],
    ['nu', 'nushell'],
    ['sh', 'bash'],
    ['shell', 'bash'],
    ['shellscript', 'bash'],
    ['shell-script', 'bash'],
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

function isGitHubPermalink(line: string): boolean {
    const workspaceRoot = config.readConfig().rootPath;
    // return true if the line starts with or contains the permalink prefix
    console.log(`Checking for permalink:`);
    console.log(`\tworkspaceRoot: ${workspaceRoot}`);
    console.log(`\tline: ${line}`);
    if (line.startsWith(permalinkPrefix)) {
        console.log(`\t\tFound permalink prefix - new link:`, permalinkToVSCodeScheme(line, permalinkPrefix, workspaceRoot));
        return true;
    } else if (line.includes(permalinkPrefix)) {
        console.log(`\t\tFound permalink included - new link:`, permalinkToVSCodeScheme(line, permalinkPrefix, workspaceRoot));
        return true;
    } else {
        console.log(`\t\tNo permalink found: ${line}`);
        return false;
    }
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
                break;
            }

            const currLine = lines[i];
            if (isCodeBlockStart(currLine)) {
                break;
            } else if (isGitHubPermalink(currLine)) {
                // turn the permalink into a workspace link using permalinkToVSCodeScheme
                const workspaceRoot = config.readConfig().rootPath;
                const workspaceLink = permalinkToVSCodeScheme(currLine, permalinkPrefix, workspaceRoot);
                cells.push({
                    language: 'markdown',
                    content: `[Link to Repo](${workspaceLink}) - ${workspaceLink}`,
                    kind: NotebookCellKind.Markup,
                    leadingWhitespace: leadingWhitespace,
                    trailingWhitespace: ""
                });
                i++;
                break;
            }

            i++;
        }

        let content = lines.slice(startSourceIdx, i).join('\n').trim();
        cells.push({
            language: 'markdown',
            content,
            kind: NotebookCellKind.Markup,
            leadingWhitespace: leadingWhitespace,
            trailingWhitespace: ""
        });
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

// permalinkToVSCodeScheme returns the vscode scheme permalink
// permalinkToVSCodeScheme takes a link to a GitHub permalink and converts it to a workspace link by:
// 1. replacing the prefix with the workspace root
// 2. removing the commit hash or branch name
// 3. converting the line number from #L<number>-#L<number> to :<number>-<number>
// Example: 
// - before: https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9
// - after: /Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9
// Example with inputs:
// - permalink = 'https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9';
// - permalinkPrefix = 'https://github.com/josephbergevin/codebook-md/blob/';
// - workspaceRoot = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
// - returns '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9'
export function permalinkToVSCodeScheme(permalink: string, permalinkPrefix: string, workspaceRoot: string): string {
    const permalinkSuffix = permalink.replace(permalinkPrefix, '');
    const permalinkParts = permalinkSuffix.split('#');
    const filePathParts = permalinkParts[0].split('/');
    const commitHashIndex = filePathParts.findIndex(part => part.length === 40); // assuming commit hash is always 40 characters long
    if (commitHashIndex !== -1) {
        filePathParts.splice(commitHashIndex, 1); // remove the commit hash
    }
    const filePath = filePathParts.join('/');
    const lineNumbers = permalinkParts[1].split('L').join('').split('-');
    return `${workspaceRoot}/${filePath}:${lineNumbers.join('-')}`;
}
