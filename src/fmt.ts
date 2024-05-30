// format returns the formatted string
export function toUpper(str: string) {
    return str.toUpperCase();
}

// helloWorldMessage returns the hello world message
export function helloWorldMessage(extensionName: string) {
    return `Hello World from ${extensionName}!`;
}

// permalinkToVSCodeScheme returns the vscode scheme permalink
// permalinkToVSCodeScheme takes a link to a GitHub permalink and converts it to a workspace link by:
// 1. replacing the prefix with the workspace root
// 2. removing the commit hash or branch name
// 3. converting the line number from #L<number>-#L<number> to :<number>-<number>
// Example: 
// - before: https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9-L13
// - after: /Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9-13
// Example with inputs:
// - permalink = 'https://github.com/josephbergevin/codebook-md/blob/520c1c66dcc6e1c5edf7fffe643bc8c463d02ee2/src/extension.ts#L9-L13';
// - permalinkPrefix = 'https://github.com/josephbergevin/codebook-md/blob/';
// - workspaceRoot = '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md';
// - returns '/Users/tijoe/go/src/github.com/josephbergevin/codebook-md/src/extension.ts:9-13'
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
