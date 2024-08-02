/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    window, workspace,
    Hover, HoverProvider,
    CancellationToken,
    MarkdownString,
    NotebookCell, NotebookCellData, NotebookCellKind,
    ProviderResult, Position, Range,
    TextDocument, TextEditor, Uri,
} from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { ChildProcessWithoutNullStreams } from "child_process";
import * as path from 'path';
import * as fs from 'fs';
import * as bash from "./languages/bash";
import * as go from "./languages/go";
import * as javascript from "./languages/javascript";
import * as typescript from "./languages/typescript";
import * as python from "./languages/python";
import * as shell from "./languages/shell";
import * as sql from "./languages/sql";
import * as unsupported from "./languages/unsupported";
import * as io from './io';

export interface RawNotebookCell {
    indentation?: string;
    leadingWhitespace: string;
    trailingWhitespace: string;
    language: string;
    content: string;
    kind: NotebookCellKind;
    outputs?: [unknown];
}

// Cell is an interface that defines the methods that a cell must implement
export interface ExecutableCell {
    execute(): ChildProcessWithoutNullStreams;
    postExecutables(): Executable[];
    contentCellConfig(): CellContentConfig;
    // commentPrefixes(): string[];
    // parseImports(): string[];
    // resolveImports(): Promise<void>;
}

// Executable is an interface that defines the methods that an executable object must implement
export interface Executable {
    execute(): ChildProcessWithoutNullStreams;
    toString(): string;
    jsonStringify(): string;
}

// Command is class for a command and its arguments
export class Command implements Executable {
    command: string;
    args: string[];
    cwd: string;

    constructor(command: string, args: string[], cwd: string) {
        this.command = command;
        this.args = args;
        this.cwd = cwd;
    }

    // execute fulfills the codebook.Executable interface
    execute(): ChildProcessWithoutNullStreams {
        console.log(`executing command: ${this.command} ${this.args.join(' ')}`);
        return io.spawnCommand(this.command, this.args, { cwd: this.cwd });
    }

    // jsonStringify returns the JSON string representation of the Command object
    jsonStringify(): string {
        return JSON.stringify({
            command: this.command,
            args: this.args,
            cwd: this.cwd,
        });
    }

    // toString returns the string representation of the Command object
    toString(): string {
        return `${this.command} ${this.args.join(' ')}`;
    }
}

// parseCommands takes a string and returns an array of Command objects
export const parseCommands = (fullCmd: string, cwd: string): Command[] => {
    const commands = fullCmd.split('\n');
    return commands.map((cmd: string) => parseCommandAndArgs(cmd, cwd));
};

// parseCommandAndArgs takes a string and returns the command and arguments
// sections wrapped in quotes are considered a single argument
export function parseCommandAndArgs(fullCmd: string, cwd: string): Command {
    const parts = fullCmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const command = parts[0] || '';
    const args = parts.slice(1).map((arg: string) => arg.replace(/"/g, ''));
    return new Command(command, args, cwd);
}


// NewCell returns a new Cell object based on the language of the notebook cell - if the language
// is not supported, it returns an unsupported cell
export function NewExecutableCell(notebookCell: NotebookCell): ExecutableCell {
    const lang = notebookCell.document.languageId;
    switch (lang) {
        case "go":
            if (io.commandNotOnPath("go", "https://go.dev/doc/install")) {
                return new unsupported.Cell(notebookCell);
            }
            return new go.Cell(notebookCell);

        case "http":
            return new unsupported.Cell(notebookCell);

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
        case "sh":
        case "zsh":
            return new shell.Cell(notebookCell);

        case "shellscript":
        case "shell-script":
        case "bash":
            if (io.commandNotOnPath("bash", "https://www.gnu.org/software/bash/")) {
                return new unsupported.Cell(notebookCell);
            }
            return new bash.Cell(notebookCell);

        case "python":
        case "py":
            {
                const pythonCell = new python.Cell(notebookCell);
                if (io.commandNotOnPath(pythonCell.config.execCmd, "https://www.python.org/")) {
                    return new unsupported.Cell(notebookCell);
                }
                return pythonCell;
            }

        case "sql":
            return new sql.Cell(notebookCell);

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

export class Language {
    name: string;
    aliases: string[];
    isExecutable: boolean;

    constructor(name: string, aliases: string[], isExecutable: boolean) {
        this.name = name;
        this.aliases = aliases;
        this.isExecutable = isExecutable;
    }
}

const languages = [
    new Language("Bash", ["shell-script", "shellscript"], true),
    new Language("Go", ["golang"], true),
    new Language("JavaScript", ["js"], true),
    new Language("Python", ["py"], true),
    new Language("Shell", ["sh", "shell"], true),
    new Language("SQL", ["mysql", "postgres"], true),
    new Language("TypeScript", ["ts"], true),

    // non-executable languages
    new Language("Fish", [], false),
    new Language("Http", [], false),
    new Language("Nushell", ["nu"], false),
    new Language("Rust", [], false),
    new Language("Zsh", [], false),
];

// languagesByAbbrev is a map of language abbreviations to their corresponding Language object
const languagesByAbbrev = new Map<string, Language>();
languages.forEach(lang => {
    languagesByAbbrev.set(lang.name.toLowerCase(), lang);
    lang.aliases.forEach(alias => {
        languagesByAbbrev.set(alias.toLowerCase(), lang);
    });
});

function parseCodeBlockStart(line: string): string | null {
    const match = line.match(/( {4}|\t)?```(\S*)/);
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
    const cells: RawNotebookCell[] = [];

    if (lines.length < 2) {
        return cells;
    }
    let i = 0;

    // Each parse function starts with line i, leaves i on the line after the last line parsed
    while (i < lines.length) {
        const leadingWhitespace = i === 0 ? parseWhitespaceLines(true) : '';
        const languageSyntax = parseCodeBlockStart(lines[i]);
        if (languageSyntax) {
            parseCodeBlock(leadingWhitespace, languageSyntax);
        } else {
            parseMarkdownParagraph(leadingWhitespace);
        }
    }


    function parseWhitespaceLines(isFirst: boolean): string {
        const start = i;
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

    function parseCodeBlock(leadingWhitespace: string, languageSyntax: string): void {
        const language = languagesByAbbrev.get(languageSyntax.toLowerCase())?.name.toLowerCase() ?? languageSyntax.toLowerCase();
        const startSourceIdx = ++i;
        // eslint-disable-next-line no-constant-condition
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
        if (languageSyntax === "text") {
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
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (i >= lines.length) {
                const content = lines.slice(startSourceIdx, i).join('\n').trim();
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
                const content = lines.slice(startSourceIdx, i).join('\n').trim();
                cells.push({
                    language: 'markdown',
                    content,
                    kind: NotebookCellKind.Markup,
                    leadingWhitespace: leadingWhitespace,
                    trailingWhitespace: ""
                });
                return;
            }

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
            const languageAbbrev = languagesByAbbrev.get(cell.languageId)?.name ?? cell.languageId;
            if (languageAbbrev === cell.languageId) {
                console.log(`writeCellsToMarkdown language not found in map: ${languageAbbrev}`);
            }
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
export class CellHover implements HoverProvider {
    // provideHover returns a hover object for a given position in a document
    provideHover(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<Hover> {
        // use the token to cancel the hover request
        if (token.isCancellationRequested) {
            return;
        }

        const text = document.lineAt(position.line).text;
        // find the file location in the line
        const fileLoc = findCodeDocument(text);
        if (fileLoc) {
            return this.provideHoverForFileLoc(fileLoc, document);
        }

        // get the cell content that the current line is in
        // const cell = document.getText(document.lineAt(position).range);

        // const mdContent = new MarkdownString();
        // mdContent.isTrusted = true;

        // // add 3 buttons to the hover: format, clear output, resolve imports
        // mdContent.appendMarkdown(`- [format](command:codebook-md.formatCell)\n`);
        // mdContent.appendMarkdown(`- [clear output](command:codebook-md.clearOutput)\n`);
        // mdContent.appendMarkdown(`- [resolve imports](command:codebook-md.resolveImports)\n`);

        // return new Hover(mdContent);
        return null;
    }

    provideHoverForFileLoc(fileLoc: string, document: TextDocument): ProviderResult<Hover> {
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

        const mdContent = new MarkdownString();
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

        return new Hover(mdContent);
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
        const relPath = this.relativeFileLoc();
        if (this.lineBegin > 0) {
            return `${relPath}:${this.lineBegin}`;
        }
        return relPath;
    }

    // showTextDocument returns the promise of showing the text document in vscode
    showTextDocument(): Thenable<TextEditor> {
        return window.showTextDocument(
            Uri.file(this.fileLoc),
            { selection: new Range(this.lineBegin, 0, this.lineEnd, 0) },
        );
    }

    // openAndNavigate opens the file in vscode and navigates to the line
    async openAndNavigate(): Promise<void> {
        console.log(`Opening file: ${this.absoluteFileLoc()} at lineBegin: ${this.lineBegin} and lineEnd: ${this.lineEnd}`);
        const document = await workspace.openTextDocument(this.absoluteFileLoc()); // Use VS Code's API to open the file
        await window.showTextDocument(document, {
            preview: false,
            selection: this.lineRange(),
        });
    }

    // lineRange returns the range of the lineBegin and lineEnd
    lineRange(): Range {
        const positionBegin = new Position(this.lineBegin, 0);
        let postitionEnd = new Position(this.lineBegin, 0);
        if (this.lineEnd > this.lineBegin) {
            postitionEnd = new Position(this.lineEnd, 0);
        }
        return new Range(positionBegin, postitionEnd);
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
export function ProcessNotebookCell(cell: NotebookCell, ...prefixes: string[]): string {
    const lines = cell.document.getText().split("\n");
    let innerScope = "";
    for (const line of lines) {
        if (prefixes.some(prefix => line.startsWith(prefix))) {
            continue;
        } else if (line.trim() === "") {
            continue;
        }
        innerScope += line + "\n";
    }
    return innerScope;
}

// CellContentConfig is a class that contains the configuration for the content of a cell
export class CellContentConfig {
    notebookCell: NotebookCell | undefined; // the notebook cell

    codebookCommands: string[]; // lines from the cell that are commands - prefixed with a commentPrefix followed by [>]
    comments: string[]; // lines from the cell that are comments - prefixed with a commentPrefix
    innerScope: string; // the rest of the cell content

    execFrom: string; // the file location where the cell executable code should be executed from
    output: OutputConfig; // the output configuration for the cell

    constructor(notebookCell: NotebookCell | undefined, ...commentPrefixes: string[]) {
        if (!notebookCell) {
            this.notebookCell = undefined;
            this.codebookCommands = [];
            this.comments = [];
            this.innerScope = "";
            this.execFrom = "";
            this.output = new OutputConfig([]);
            return;
        }
        this.notebookCell = notebookCell;
        const lines = notebookCell.document.getText().split("\n");
        const commandPrefixes = commentPrefixes.map(prefix => prefix.trim() + " [>]");
        this.codebookCommands = [];
        this.comments = [];
        this.innerScope = "";
        for (const line of lines) {
            if (commandPrefixes.some(commandPrefix => line.startsWith(commandPrefix))) {
                // remove the comment prefix and [>] by splitting on [>] and taking the second part
                this.codebookCommands.push(line.split("[>]").pop() || "");
            } else if (commentPrefixes.some(prefix => line.startsWith(prefix))) {
                this.comments.push(line);
            } else {
                this.innerScope += line + "\n";
            }
        }

        this.innerScope = this.innerScope.trim();

        this.execFrom = this.codebookCommands.find(command => command.startsWith(".execFrom"))?.split(" ").pop() || "";
        this.output = new OutputConfig(this.codebookCommands);
    }

    // jsonStringify returns the JSON string representation of the CellContentConfig object, excluding the notebookCell
    jsonStringify(): string {
        return JSON.stringify({
            commands: this.codebookCommands,
            comments: this.comments,
            innerScope: this.innerScope,
            execFrom: this.execFrom,
            output: {
                showExecutableCodeInOutput: this.output.showExecutableCodeInOutput,
                showOutputOnRun: this.output.showOutputOnRun,
                prependToOutputStrings: this.output.prependToOutputStrings,
                appendToOutputStrings: this.output.appendToOutputStrings,
                replaceOutputCell: this.output.replaceOutputCell,
                showTimestamp: this.output.showTimestamp,
                timestampTimezone: this.output.timestampTimezone,
            }
        });
    }
}

// OutputConfig is a class that contains the configuration for the output of a cell
export class OutputConfig {
    showExecutableCodeInOutput: boolean; // whether to print the executable code at the top of the output cell
    showOutputOnRun: boolean; // whether to show the output on run
    replaceOutputCell: boolean; // whether to replace the output of the cell - if false, append the output
    showTimestamp: boolean; // whether to prepend the output with a timestamp
    timestampTimezone: string; // the timezone to use for the timestamp

    // these values are only configurable in the code cell config commands
    prependToOutputStrings: string[]; // the strings to prepend to the output
    appendToOutputStrings: string[]; // the strings to append to the output

    constructor(commands: string[]) {
        const outputConfig = workspace.getConfiguration('codebook-md.output');
        // initialize the output configuration with the default values
        this.showExecutableCodeInOutput = outputConfig.get('showExecutableCodeInOutput') || false;
        this.showOutputOnRun = outputConfig.get('showOutputOnRun') || false;
        this.replaceOutputCell = outputConfig.get('replaceOutputCell') || true;
        this.showTimestamp = outputConfig.get('showTimestamp') || false;
        this.timestampTimezone = validTimezone(outputConfig.get('timestampTimezone') || "");
        this.prependToOutputStrings = [];
        this.appendToOutputStrings = [];

        // filter out the output commands from the cell commands
        const outputCommands = commands.filter(command => command.startsWith(".output."));

        // if the commands don't include any in-line output config, return the default output config
        if (outputCommands.length === 0) {
            return;
        }

        outputCommands.forEach(command => {
            switch (command) {
                case ".output.showExecutableCodeInOutput(true)":
                    this.showExecutableCodeInOutput = true;
                    break;
                case ".output.showExecutableCodeInOutput(false)":
                    this.showExecutableCodeInOutput = false;
                    break;
                case ".output.showOutputOnRun(true)":
                    this.showOutputOnRun = true;
                    break;
                case ".output.showOutputOnRun(false)":
                    this.showOutputOnRun = false;
                    break;
                case ".output.replaceOutputCell(true)":
                    this.replaceOutputCell = true;
                    break;
                case ".output.replaceOutputCell(false)":
                    this.replaceOutputCell = false;
                    break;
                case ".output.showTimestamp(true)":
                    this.showTimestamp = true;
                    break;
                case ".output.showTimestamp(false)":
                    this.showTimestamp = false;
                    break;
                default:
                    // if the command is not recognized, send a warning notification
                    window.showWarningMessage(`output command unknown: ${command}`);
            }
        });
    }
}

// validTimezone returns the timezone if it's valid, otherwise it returns 'UTC'
export function validTimezone(timezone: string): string {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
        console.log(`valid timezone given: ${timezone}`);
        return timezone;
    } catch (error) {
        let validTimezone = timezone;
        switch (timezone.toUpperCase()) {
            case "MDT":
                validTimezone = 'America/Denver';
                break;
            case "MST":
                validTimezone = 'America/Phoenix';
                break;
            case "PDT":
                validTimezone = 'America/Los_Angeles';
                break;
            case "PST":
                validTimezone = 'America/Los_Angeles';
                break;
            case "EDT":
                validTimezone = 'America/New_York';
                break;
            case "EST":
                validTimezone = 'America/New_York';
                break;
            case "CDT":
                validTimezone = 'America/Chicago';
                break;
            case "CST":
                validTimezone = 'America/Chicago';
                break;
            case "UTC":
                validTimezone = 'UTC';
                break;
            case "":
                validTimezone = 'UTC';
                break;
            default:
                console.log(`invalid timezone: ${timezone}`);
                return 'UTC';
        };
        console.log(`valid timezone found: ${timezone} >> ${validTimezone}`);
        return validTimezone;
    }
}
