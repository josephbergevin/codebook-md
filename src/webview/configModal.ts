import { window, WebviewPanel, ViewColumn, Uri, ExtensionContext, env } from 'vscode';
import * as path from 'path';
import * as codebook from '../codebook';

let currentPanel: WebviewPanel | undefined = undefined;

export function openConfigModal(execCell: codebook.ExecutableCell, context?: ExtensionContext) {
  if (currentPanel) {
    currentPanel.reveal(ViewColumn.One);
  } else {
    currentPanel = window.createWebviewPanel(
      'codeBlockConfig',
      'Code Block Config',
      ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: context ? [Uri.file(path.join(context.extensionPath, 'src', 'img'))] : undefined
      }
    );

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
          case 'reset':
            // Handle resetting the configuration
            window.showInformationMessage('Configuration reset to defaults');
            return;
          case 'copyToClipboard':
            // Handle copying text to clipboard
            env.clipboard.writeText(message.text);
            window.showInformationMessage(`Copied to clipboard: ${message.text}`);
            return;
        }
      }
    );

    currentPanel.webview.html = getWebviewContent(execCell, currentPanel, context);
  }
}

function getWebviewContent(execCell: codebook.ExecutableCell, panel: WebviewPanel, context?: ExtensionContext): string {
  const cellConfig = execCell.codeBlockConfig();
  let commentPrefix = execCell.defaultCommentPrefix();
  if (commentPrefix === '') {
    commentPrefix = '//';
  }
  const availableCommands = cellConfig.availableCommands().map(cmd => `${commentPrefix} [>]${cmd}`);
  const codeBlockCommands = cellConfig.commands.map(cmd => `${commentPrefix} [>]${cmd}`);
  const languageId = cellConfig.languageId;

  // Create gear icon URI if context is available (only using this for reference in this function)
  let gearIconSrc = '';
  if (context) {
    const gearIconPath = Uri.file(path.join(context.extensionPath, 'extension', 'src', 'img', 'icon_gear.svg'));
    gearIconSrc = panel.webview.asWebviewUri(gearIconPath).toString();
  }

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
        body {
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
          padding: 20px;
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
          margin-bottom: 20px;
        }
        .header img {
          width: 24px;
          height: 24px;
          margin-right: 10px;
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
        ${gearIconSrc ? `<img src="${gearIconSrc}" alt="Settings" />` : ''}
        <h1>Code Block Config - Language: ${languageId}</h1>
      </div>
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
      </script>
    </body>
    </html>`;
}
