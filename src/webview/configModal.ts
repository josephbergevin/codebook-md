import { window, WebviewPanel, ViewColumn, Uri, ExtensionContext, env, commands } from 'vscode';
import * as path from 'path';
import * as codebook from '../codebook';

let currentPanel: WebviewPanel | undefined = undefined;

export function openConfigModal(execCell: codebook.ExecutableCell, context?: ExtensionContext): void {
  // Get active editor's column to position our modal adjacent to it
  const activeColumn = window.activeTextEditor?.viewColumn || ViewColumn.One;
  // Use the next column (or wrap around to One if at Three)
  const modalColumn = activeColumn === ViewColumn.Three ?
    ViewColumn.One :
    (activeColumn + 1) as ViewColumn;

  if (currentPanel) {
    // If panel exists, reveal it in the appropriate column
    currentPanel.reveal(modalColumn, true); // Second parameter makes it preserve focus on the editor
  } else {
    // Create a compact modal-like panel
    currentPanel = window.createWebviewPanel(
      'codeBlockConfig',
      'Code Block Config',
      {
        viewColumn: modalColumn,
        preserveFocus: true // Keep focus on the editor
      },
      {
        enableScripts: true,
        localResourceRoots: context ? [Uri.file(path.join(context.extensionPath, 'src', 'img'))] : undefined,
        retainContextWhenHidden: true // Keep the webview's state when hidden
      }
    );

    // Make the panel behave more like a modal by setting a fixed size
    currentPanel.webview.options = {
      ...currentPanel.webview.options,
      enableForms: true
    };

    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
      },
      null,
      []
    );

    currentPanel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'save':
            // Handle saving the configuration
            window.showInformationMessage('Configuration saved');
            return;
          case 'close':
            // Close the panel when requested from the webview
            if (currentPanel) {
              currentPanel.dispose();
            }
            return;
          case 'reset':
            // Handle resetting the configuration
            window.showInformationMessage('Configuration reset to defaults');
            return;
          case 'copyToClipboard':
            // Handle copying text to clipboard
            env.clipboard.writeText(message.text);
            window.showInformationMessage(`Copied to clipboard: ${message.text}`);
            return;
          case 'openDocumentation':
            // Open documentation view with focus on specific section
            commands.executeCommand('codebook-md.openDocumentation', message.section);
            return;
        }
      }
    );

    currentPanel.webview.html = getWebviewContent(execCell);
  }
}

/**
 * Generate the HTML content for the code block configuration modal
 * 
 * @param execCell The executable cell to configure
 * @returns HTML content for the webview
 */
function getWebviewContent(execCell: codebook.ExecutableCell): string {
  const cellConfig = execCell.codeBlockConfig();
  let commentPrefix = execCell.defaultCommentPrefix();
  if (commentPrefix === '') {
    commentPrefix = '//';
  }
  const availableCommands = cellConfig.availableCommands().map(cmd => `${commentPrefix} [>]${cmd}`);
  const codeBlockCommands = cellConfig.commands.map(cmd => `${commentPrefix} [>]${cmd}`);
  const languageId = cellConfig.languageId;

  // Create available commands HTML
  const availableCommandsHTML = availableCommands.map(cmd => {
    return `
      <div class="command-item" data-command="${cmd}">
        <button type="button" class="command-button add-button" onclick="moveToCodeBlockCommands('${cmd}')" title="Add to Code Block Commands">+</button>
        <button type="button" class="copy-button" onclick="copyToClipboard('${cmd}')" title="Copy Command">📋</button>
        <span class="command-name">${cmd}</span>
      </div>
    `;
  }).join('');

  // Create code block commands HTML
  const codeBlockCommandsHTML = codeBlockCommands.map(cmd => {
    return `
      <div class="command-item" data-command="${cmd}">
        <button type="button" class="command-button remove-button" onclick="moveToAvailableCommands('${cmd}')" title="Remove from Code Block Commands">-</button>
        <button type="button" class="copy-button" onclick="copyToClipboard('${cmd}')" title="Copy Command">📋</button>
        <span class="command-name">${cmd}</span>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Code Block Config</title>
      <style>
        @import url("https://cdn.jsdelivr.net/npm/vscode-codicons@0.0.17/dist/codicon.css");
        body {
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
          padding: 16px;
          /* Set max dimensions to make it more modal-like */
          max-width: 500px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .codicon {
          font-size: 16px;
          margin-right: 8px;
        }
        .help-link {
          display: inline-flex;
          align-items: center;
          color: var(--vscode-textLink-foreground);
          text-decoration: none;
          cursor: pointer;
          margin-bottom: 12px;
        }
        .help-link:hover {
          color: var(--vscode-textLink-activeForeground);
          text-decoration: underline;
        }
        .help-link .codicon {
          margin-right: 4px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
        }
        input, select {
          width: 100%;
          padding: 5px;
          border-radius: 3px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
        }
        button {
          padding: 8px 16px;
          margin-right: 10px;
          border: none;
          border-radius: 3px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          cursor: pointer;
        }
        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .copy-button {
          padding: 2px 8px;
          min-width: 28px;
          text-align: center;
          margin-right: 8px;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          padding-bottom: 8px;
        }
        .header-left {
          display: flex;
          align-items: center;
        }
        .header img {
          width: 20px;
          height: 20px;
          margin-right: 8px;
        }
        .header h1 {
          font-size: 1.2em;
          margin: 0;
        }
        .close-button {
          background: transparent;
          border: none;
          color: var(--vscode-foreground);
          cursor: pointer;
          font-size: 1.2em;
          padding: 4px 8px;
          margin: 0;
        }
        .close-button:hover {
          background: var(--vscode-toolbar-hoverBackground);
          border-radius: 3px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 16px;
          padding-top: 10px;
          border-top: 1px solid var(--vscode-panel-border);
        }
        .command-list {
          border: 1px solid var(--vscode-input-border);
          border-radius: 3px;
          max-height: 200px;
          overflow-y: auto;
          background: var(--vscode-input-background);
          margin-bottom: 10px;
        }
        .command-item {
          padding: 8px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid var(--vscode-input-border);
        }
        .command-item:last-child {
          border-bottom: none;
        }
        .command-button {
          padding: 2px 8px;
          margin-right: 8px;
          min-width: 28px;
          text-align: center;
        }
        .add-button {
          background-color: #28a745;
        }
        .remove-button {
          background-color: #dc3545;
        }
        .command-name {
          flex-grow: 1;
        }
        .list-container {
          display: flex;
          flex-direction: column;
        }
        .list-title {
          margin-bottom: 5px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <span class="codicon codicon-gear"></span>
          <h1>Code Block Config - Language: ${languageId}</h1>
        </div>
        <button type="button" class="close-button" onclick="closeModal()" title="Close">×</button>
      </div>
      
      <div class="help-link" onclick="openDocumentation('executable-code')">
        <span class="codicon codicon-question"></span>
        <span>Learn more about executable code blocks</span>
      </div>
      
      ${languageId === 'go' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-go')">
        <span class="codicon codicon-symbol-property"></span>
        <span>Go-specific configuration options</span>
      </div>
      ` : ''}
      
      ${languageId === 'sql' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-sql')">
        <span class="codicon codicon-symbol-property"></span>
        <span>SQL-specific configuration options</span>
      </div>
      ` : ''}
      
      ${languageId === 'javascript' || languageId === 'typescript' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-javascript')">
        <span class="codicon codicon-symbol-property"></span>
        <span>${languageId === 'javascript' ? 'JavaScript' : 'TypeScript'}-specific configuration options</span>
      </div>
      ` : ''}
      
      ${languageId === 'python' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-python')">
        <span class="codicon codicon-symbol-property"></span>
        <span>Python-specific configuration options</span>
      </div>
      ` : ''}
      
      ${languageId === 'bash' || languageId === 'shellscript' || languageId === 'shell' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-bash')">
        <span class="codicon codicon-symbol-property"></span>
        <span>Shell/Bash-specific configuration options</span>
      </div>
      ` : ''}
      
      <form id="configForm">
        <div class="form-group">
          <label for="languageId">Language ID</label>
          <input type="text" id="languageId" value="${languageId}" readonly />
        </div>

        <div class="form-group">
          <div class="list-container">
            <div class="list-title">Available Commands</div>
            <div class="command-list" id="availableCommandsList">
              ${availableCommandsHTML}
            </div>
          </div>
        </div>

        <div class="form-group">
          <div class="list-container">
            <div class="list-title">Code Block Commands (already found in this code-block)</div>
            <div class="command-list" id="codeBlockCommandsList">
              ${codeBlockCommandsHTML}
            </div>
          </div>
        </div>
      </form>
      
      <div class="modal-actions">
        <button type="button" onclick="closeModal()">Close</button>
      </div>
      
      <script>
        const vscode = acquireVsCodeApi();
        
        // Track commands in both lists
        let availableCommands = ${JSON.stringify(availableCommands)};
        let codeBlockCommands = ${JSON.stringify(codeBlockCommands)};

        function copyToClipboard(text) {
          // Use the VSCode API to copy to clipboard
          vscode.postMessage({
            command: 'copyToClipboard',
            text: text
          });
        }

        function moveToCodeBlockCommands(command) {
          // Only move if it's not already in codeBlockCommands
          if (!codeBlockCommands.includes(command)) {
            // Remove from available
            availableCommands = availableCommands.filter(cmd => cmd !== command);
            // Add to codeBlock
            codeBlockCommands.push(command);
            // Update UI
            updateCommandLists();
          }
        }

        function moveToAvailableCommands(command) {
          // Only move if it's not already in availableCommands
          if (!availableCommands.includes(command)) {
            // Remove from codeBlock
            codeBlockCommands = codeBlockCommands.filter(cmd => cmd !== command);
            // Add to available
            availableCommands.push(command);
            // Update UI
            updateCommandLists();
          }
        }

        function updateCommandLists() {
          // Update available commands list
          const availableList = document.getElementById('availableCommandsList');
          availableList.innerHTML = availableCommands.map(command => {
            return \`
              <div class="command-item" data-command="\${command}">
                <button type="button" class="command-button add-button" onclick="moveToCodeBlockCommands('\${command}')" title="Add to Code Block Commands">+</button>
                <button type="button" class="copy-button" onclick="copyToClipboard('\${command}')" title="Copy Command">📋</button>
                <span class="command-name">\${command}</span>
              </div>
            \`;
          }).join('');

          // Update code block commands list
          const codeBlockList = document.getElementById('codeBlockCommandsList');
          codeBlockList.innerHTML = codeBlockCommands.map(command => {
            return \`
              <div class="command-item" data-command="\${command}">
                <button type="button" class="command-button remove-button" onclick="moveToAvailableCommands('\${command}')" title="Remove from Code Block Commands">-</button>
                <button type="button" class="copy-button" onclick="copyToClipboard('\${command}')" title="Copy Command">📋</button>
                <span class="command-name">\${command}</span>
              </div>
            \`;
          }).join('');
        }
        
        function closeModal() {
          // Send a message to the extension to close this panel
          vscode.postMessage({
            command: 'close'
          });
        }
        
        function openDocumentation(section) {
          // Send a message to open the documentation at a specific section
          vscode.postMessage({
            command: 'openDocumentation',
            section: section
          });
        }
      </script>
    </body>
    </html>`;
}
