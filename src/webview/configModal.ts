import { window, WebviewPanel, ViewColumn, Uri, ExtensionContext, env, commands, NotebookCell, workspace } from 'vscode';
import * as path from 'path';
import * as codebook from '../codebook';
import { getCellConfig } from '../codebook';
import { saveCellConfig, getLanguageConfigOptions, getOutputConfigOptions } from '../cellConfig';

let currentPanel: WebviewPanel | undefined = undefined;

export async function openConfigModal(execCell: codebook.ExecutableCell, notebookCell?: NotebookCell, context?: ExtensionContext): Promise<void> {
  // Get active editor's column to position our modal adjacent to it
  const activeColumn = window.activeTextEditor?.viewColumn || ViewColumn.One;
  // Use the next column (or wrap around to One if at Three)
  const modalColumn = activeColumn === ViewColumn.Three ?
    ViewColumn.One :
    (activeColumn + 1) as ViewColumn;

  // If we have a notebook cell, try to load existing configuration
  let existingCellConfig: Record<string, unknown> | undefined = undefined;
  if (notebookCell) {
    try {
      existingCellConfig = await getCellConfig(notebookCell);
      if (existingCellConfig) {
        console.log('Loaded existing cell config:', existingCellConfig);
      }
    } catch (error) {
      console.error('Error loading cell config:', error);
    }
  }

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
      async message => {
        switch (message.command) {
          case 'saveConfig': {
            // Handle saving the cell configuration to notebook metadata
            const cellData = message.cell;
            const config = message.config;

            console.log('Received save config request:', { cellData, config });

            if (cellData && config) {
              try {
                // Find the actual notebook cell using the data sent from the webview
                if (!cellData.notebookUri) {
                  window.showErrorMessage('No notebook URI provided');
                  console.error('No notebookUri in cellData:', cellData);
                  return;
                }

                // Get the notebook document from the URI
                const uri = Uri.parse(cellData.notebookUri);
                console.log('Opening notebook document at URI:', uri.toString());

                let notebooks;
                try {
                  notebooks = await workspace.openNotebookDocument(uri);
                } catch (notebookError) {
                  console.error('Failed to open notebook document:', notebookError);
                  window.showErrorMessage(`Failed to open notebook: ${notebookError instanceof Error ? notebookError.message : String(notebookError)}`);
                  return;
                }

                if (!notebooks) {
                  console.error('No notebook document returned from openNotebookDocument');
                  window.showErrorMessage('Could not open notebook document');
                  return;
                }

                // Get the notebook cell using the index
                if (cellData.index === undefined) {
                  window.showErrorMessage('No cell index provided');
                  console.error('Cell index is undefined in cellData:', cellData);
                  return;
                }

                if (cellData.index < 0 || cellData.index >= notebooks.cellCount) {
                  window.showErrorMessage(`Invalid cell index: ${cellData.index}. Notebook has ${notebooks.cellCount} cells.`);
                  console.error(`Cell index ${cellData.index} is out of bounds (0-${notebooks.cellCount - 1})`);
                  return;
                }

                const notebookCell = notebooks.cellAt(cellData.index);

                // Validate notebook cell before proceeding
                if (!notebookCell || !notebookCell.notebook) {
                  console.error('Invalid notebook cell or notebook object', notebookCell);
                  window.showErrorMessage('Cannot save: Invalid notebook cell');
                  return;
                }

                // Log the cell info for debugging
                console.log(`Saving config for cell ${notebookCell.index} in notebook ${notebookCell.notebook.uri.toString()}`);

                // Now save the configuration
                const success = await saveCellConfig(notebookCell, config);
                if (success) {
                  // Count how many settings were saved
                  const outputProperty = 'output' as keyof typeof config;
                  const hasOutput = config[outputProperty] !== undefined;
                  const languageSettingsCount = Object.keys(config).length - (hasOutput ? 1 : 0);
                  const outputConfig = hasOutput ? config[outputProperty] as Record<string, unknown> : {};
                  const outputSettingsCount = Object.keys(outputConfig).length;
                  const totalSettings = languageSettingsCount + outputSettingsCount;

                  window.showInformationMessage(`Cell configuration saved with ${totalSettings} settings`);

                  // Close panel on successful save (optional behavior)
                  // Uncomment if you want panel to close automatically after saving
                  /*
                  if (currentPanel) {
                    currentPanel.dispose();
                  }
                  */
                } else {
                  // Enhanced error message for save failure
                  window.showErrorMessage(`Failed to save cell configuration. Check the VS Code logs for details.`);
                  console.error('Failed to save cell config:', {
                    cellIndex: notebookCell.index,
                    languageId: notebookCell.document.languageId,
                    notebookUri: notebookCell.notebook.uri.toString()
                  });
                }
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                window.showErrorMessage(`Error saving configuration: ${errorMessage}`);
                console.error('Error saving configuration:', error);
              }
            } else {
              window.showErrorMessage('Invalid cell or configuration data');
            }
            return;
          }
          case 'save': {
            // Legacy handler
            window.showInformationMessage('Configuration saved');
            return;
          }
          case 'close': {
            // Close the panel when requested from the webview
            if (currentPanel) {
              currentPanel.dispose();
            }
            return;
          }
          case 'reset': {
            // Handle resetting the configuration
            window.showInformationMessage('Configuration reset to defaults');
            return;
          }
          case 'copyToClipboard': {
            // Handle copying text to clipboard
            env.clipboard.writeText(message.text);
            window.showInformationMessage(`Copied to clipboard: ${message.text}`);
            return;
          }
          case 'openDocumentation': {
            // Open documentation view with focus on specific section
            commands.executeCommand('codebook-md.openDocumentation', message.section);
            return;
          }
          case 'openSettings': {
            // Open VS Code settings with codebook-md filter
            commands.executeCommand('workbench.action.openSettings', 'codebook-md');
            return;
          }
        }
      }
    );

    currentPanel.webview.html = getWebviewContent(execCell, notebookCell, existingCellConfig);
  }
}

/**
 * Generate the HTML content for the code block configuration modal
 * 
 * @param execCell The executable cell to configure
 * @returns HTML content for the webview
 */
/**
 * Generate HTML content for the configuration modal
 * 
 * @param execCell The executable cell
 * @param notebookCell The notebook cell (optional)
 * @param existingCellConfig The existing cell configuration from metadata (optional)
 * @returns HTML content for the webview
 */
function getWebviewContent(execCell: codebook.ExecutableCell, notebookCell?: NotebookCell, existingCellConfig?: Record<string, unknown>): string {
  const codeBlockConfig = execCell.codeBlockConfig();
  let commentPrefix = execCell.defaultCommentPrefix();
  if (commentPrefix === '') {
    commentPrefix = '//';
  }
  const availableCommands = codeBlockConfig.availableCommands().map(cmd => `${commentPrefix} [>]${cmd}`);
  const codeBlockCommands = codeBlockConfig.commands.map(cmd => `${commentPrefix} [>]${cmd}`);
  const languageId = codeBlockConfig.languageId;

  // Use the cell configuration from existingCellConfig if provided, otherwise fall back to codeBlockConfig
  const currentCellConfig = existingCellConfig || codeBlockConfig.cellConfig;

  // Debug the config
  console.log('Using cell config:', currentCellConfig);

  // Get language-specific config options
  const languageOptions = getLanguageConfigOptions(languageId);

  // Get output config options
  const outputOptions = getOutputConfigOptions();

  // Get existing output configuration from the cell's outputConfig
  const existingOutputConfig = codeBlockConfig.outputConfig;

  // Create form fields for language-specific options
  let languageOptionsHTML = '';
  if (Object.keys(languageOptions).length > 0) {
    languageOptionsHTML = `
      <div class="form-section">
        <h3>Language-specific Configuration</h3>
        ${Object.entries(languageOptions).map(([key, option]: [string, { type: string; description: string; default: string | boolean | number; options?: string[]; }]) => {
      // First check the cell-specific config directly
      const currentValue = currentCellConfig && currentCellConfig[key] !== undefined ?
        currentCellConfig[key] : option.default;

      if (option.type === 'boolean') {
        return `
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" name="${key}" id="${key}">
                  ${option.description}
                </label>
              </div>
            `;
      } else if (option.type === 'select' && option.options) {
        return `
              <div class="form-group">
                <label for="${key}">${option.description}</label>
                <select name="${key}" id="${key}">
                  ${option.options.map((opt: string) =>
          `<option value="${opt}" ${opt === currentValue ? 'selected' : ''}>${opt}</option>`
        ).join('')}
                </select>
              </div>
            `;
      } else {
        return `
              <div class="form-group">
                <label for="${key}">${option.description}</label>
                <input type="text" name="${key}" id="${key}" value="${currentValue || ''}">
              </div>
            `;
      }
    }).join('')}
      </div>
    `;
  }

  // Create form fields for output options
  const outputOptionsHTML = `
    <div class="form-section">
      <h3>Output Configuration</h3>
      ${Object.entries(outputOptions).map(([key, option]: [string, { type: string; description: string; default: string | boolean | number; }]) => {
    // First check the existingOutputConfig (which already has all the priorities sorted out)
    // Then fallback to cellConfig's output section, then fallback to the default
    let currentValue;

    // Check specific properties of existingOutputConfig based on the key
    if (existingOutputConfig) {
      switch (key) {
        case 'showExecutableCodeInOutput':
          currentValue = existingOutputConfig.showExecutableCodeInOutput;
          break;
        case 'showOutputOnRun':
          currentValue = existingOutputConfig.showOutputOnRun;
          break;
        case 'replaceOutputCell':
          currentValue = existingOutputConfig.replaceOutputCell;
          break;
        case 'showTimestamp':
          currentValue = existingOutputConfig.showTimestamp;
          break;
        case 'timestampTimezone':
          currentValue = existingOutputConfig.timestampTimezone;
          break;
        default:
          // For other keys, use the next fallback
          currentValue = undefined;
      }
    } else if (currentCellConfig && currentCellConfig.output && currentCellConfig.output[key] !== undefined) {
      currentValue = currentCellConfig.output[key];
    } else {
      currentValue = option.default;
    }

    if (option.type === 'boolean') {
      return `
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" name="output.${key}" id="output.${key}">
                ${option.description}
              </label>
            </div>
          `;
    } else {
      return `
            <div class="form-group">
              <label for="output.${key}">${option.description}</label>
              <input type="text" name="output.${key}" id="output.${key}" value="${currentValue || ''}">
            </div>
          `;
    }
  }).join('')}
    </div>
  `;

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
        input[type="checkbox"] {
          width: auto;
          margin-right: 10px;
          position: relative;
          top: 0;
          vertical-align: middle;
          cursor: pointer;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          cursor: pointer;
          margin-bottom: 0;
          user-select: none;
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
        details summary {
          padding: 8px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border-radius: 3px;
          cursor: pointer;
          font-weight: bold;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
        }
        details summary:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        details summary::marker {
          color: var(--vscode-button-secondaryForeground);
        }
        details summary .summary-icon {
          margin-right: 8px;
        }
        .form-section {
          margin-bottom: 20px;
          padding: 10px;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 3px;
        }
        .form-section h3 {
          margin-top: 0;
          margin-bottom: 10px;
          font-size: 1em;
          color: var(--vscode-editor-foreground);
        }
        .config-section {
          margin-bottom: 20px;
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
      
      <div class="help-link" onclick="openVSCodeSettings()">
        <span class="codicon codicon-settings-gear"></span>
        <span>Open VS Code settings for CodebookMD</span>
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
      
      ${languageId === 'http' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-http')">
        <span class="codicon codicon-symbol-property"></span>
        <span>HTTP-specific configuration options</span>
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
        
        <!-- Configuration options section -->
        <div class="config-section">
          ${outputOptionsHTML}
          ${languageOptionsHTML}
        </div>

        <div class="form-group">
          <div class="list-container">
            <details>
              <summary>
                <span class="codicon codicon-list-unordered"></span>
                <span>Available Commands</span>
              </summary>
              <div class="command-list" id="availableCommandsList">
                ${availableCommandsHTML}
              </div>
            </details>
          </div>
        </div>

        <div class="form-group">
          <div class="list-container">
            <details>
              <summary>
                <span class="codicon codicon-code"></span>
                <span>Code Block Commands (already found in this code-block)</span>
              </summary>
              <div class="command-list" id="codeBlockCommandsList">
                ${codeBlockCommandsHTML}
              </div>
            </details>
          </div>
        </div>
      </form>
      
      <div class="modal-actions">
        <button type="button" onclick="saveConfig()">Save Configuration</button>
        <button type="button" onclick="closeModal()">Close</button>
      </div>
       <script>
        const vscode = acquireVsCodeApi();
        const notebookCellData = ${notebookCell ? JSON.stringify({
    index: notebookCell.index,
    languageId: notebookCell.document.languageId,
    notebookUri: notebookCell.notebook?.uri.toString()
  }, null, 2) : 'null'};
        
        // Make language and output options available to the client script
        const languageOptions = ${JSON.stringify(languageOptions)};
        const outputOptions = ${JSON.stringify(outputOptions)};

        // Pass the existing configuration to the client as a JSON string
        const existingOutputConfigData = {
          showExecutableCodeInOutput: ${existingOutputConfig ? existingOutputConfig.showExecutableCodeInOutput : false},
          showOutputOnRun: ${existingOutputConfig ? existingOutputConfig.showOutputOnRun : false},
          replaceOutputCell: ${existingOutputConfig ? existingOutputConfig.replaceOutputCell : true},
          showTimestamp: ${existingOutputConfig ? existingOutputConfig.showTimestamp : false},
          timestampTimezone: "${existingOutputConfig ? existingOutputConfig.timestampTimezone : 'UTC'}"
        };
        
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
        
        // Initialize form values with existing config when the form loads
        function initFormFromConfig() {
          const form = document.getElementById('configForm');
          
          // Initialize output config options directly using the existingOutputConfigData
          if (form) {
            // Initialize output config options
            // For showExecutableCodeInOutput
            const showExecField = form.elements['output.showExecutableCodeInOutput'];
            if (showExecField && showExecField.type === 'checkbox') {
              showExecField.checked = existingOutputConfigData.showExecutableCodeInOutput;
            }
            
            // For showOutputOnRun
            const showOutputField = form.elements['output.showOutputOnRun'];
            if (showOutputField && showOutputField.type === 'checkbox') {
              showOutputField.checked = existingOutputConfigData.showOutputOnRun;
            }
            
            // For replaceOutputCell
            const replaceField = form.elements['output.replaceOutputCell'];
            if (replaceField && replaceField.type === 'checkbox') {
              replaceField.checked = existingOutputConfigData.replaceOutputCell;
            }
            
            // For showTimestamp
            const timestampField = form.elements['output.showTimestamp'];
            if (timestampField && timestampField.type === 'checkbox') {
              timestampField.checked = existingOutputConfigData.showTimestamp;
            }
            
            // For timestampTimezone
            const timezoneField = form.elements['output.timestampTimezone'];
            if (timezoneField && timezoneField.type !== 'checkbox') {
              timezoneField.value = existingOutputConfigData.timestampTimezone || '';
            }
            
            // Initialize language-specific options
            if (languageOptions) {
              Object.entries(languageOptions).forEach(([key, option]) => {
                if (option.type === 'boolean') {
                  const field = document.getElementById(key);
                  if (field && field.type === 'checkbox') {
                    // Use the current cell config value if available, otherwise use the default
                    const currentValue = ${JSON.stringify(currentCellConfig)} && ${JSON.stringify(currentCellConfig)}[key] !== undefined 
                      ? ${JSON.stringify(currentCellConfig)}[key] 
                      : option.default;
                    field.checked = Boolean(currentValue);
                  }
                }
              });
            }
          }
        }
        
        // Initialize form when page loads
        document.addEventListener('DOMContentLoaded', initFormFromConfig);
        
        function saveConfig() {
          console.log('Saving configuration...');
          
          // Debug the notebookCellData variable to see what it contains
          console.log('notebookCellData:', notebookCellData);
          
          if (!notebookCellData) {
            // Show error message to the user
            vscode.postMessage({
              command: 'saveConfig',
              error: 'No notebook cell provided'
            });
            console.error('No notebook cell provided');
            return;
          }
          
          // Additional check to ensure we have the expected data
          if (!notebookCellData.notebookUri || notebookCellData.index === undefined) {
            // Show detailed error message with available data
            vscode.postMessage({
              command: 'saveConfig',
              error: 'Incomplete notebook cell data',
              data: JSON.stringify(notebookCellData)
            });
            console.error('Incomplete notebook cell data:', notebookCellData);
            return;
          }

          // Collect form data and ensure we save ALL fields, not just changed ones
          const form = document.getElementById('configForm');
          const config = {};
          const outputConfig = {};
          
          // Directly process all form elements to ensure we capture all checkbox states
          // This avoids the FormData issue where unchecked checkboxes are omitted
          for (let i = 0; i < form.elements.length; i++) {
            const element = form.elements[i];
            // Skip elements without a name attribute
            if (!element.name) continue;
            
            const key = element.name;
            
            if (key.startsWith('output.')) {
              // Handle output configuration options
              const outputKey = key.replace('output.', '');
              if (element.type === 'checkbox') {
                // Explicitly get the checked state for all checkboxes
                outputConfig[outputKey] = element.checked;
                console.log('Output config:', {
                  key: outputKey,
                  value: element.checked
                });
              } else {
                outputConfig[outputKey] = element.value;
                console.log('Output config:', {
                  key: outputKey,
                  value: element.value
                });
              }
            } else if (key !== 'languageId') { // Skip the read-only languageId field
              // Handle language configuration options
              if (element.type === 'checkbox') {
                // Explicitly get the checked state for all checkboxes
                config[key] = element.checked;
                console.log('Output config:', {
                  key: key,
                  value: element.checked
                });
              } else {
                config[key] = element.value;
                console.log('Output config:', {
                  key: key,
                  value: element.value
                });
              }
            }
          }
          
          // Now process any options that might not have been in the form
          // Add all language options with their defaults if not already set
          if (languageOptions) {
            Object.keys(languageOptions).forEach(function(key) {
              if (!config.hasOwnProperty(key)) {
                config[key] = languageOptions[key].default;
              }
            });
          }
          
          // Add all output options with their defaults if not already set
          if (outputOptions) {
            Object.keys(outputOptions).forEach(function(key) {
              if (!outputConfig.hasOwnProperty(key)) {
                outputConfig[key] = outputOptions[key].default;
              }
            });
          }
          
          // Add output config to main config
          config.output = outputConfig;
          
          // Debug the values being sent
          console.log('Sending configuration to extension:', {
            notebookCellData: notebookCellData,
            config: config
          });
          
          // Log how many settings we're saving
          console.log('Language settings saved:', Object.keys(config).length - 1); // Subtract 1 for the output property
          console.log('Output settings saved:', Object.keys(outputConfig).length);
          console.log('Total settings:', Object.keys(config).length - 1 + Object.keys(outputConfig).length);
          
          // Send the configuration to the extension
          vscode.postMessage({
            command: 'saveConfig',
            cell: notebookCellData,
            config: config
          });
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
        
        function openVSCodeSettings() {
          // Send a message to open VS Code settings for CodebookMD
          vscode.postMessage({
            command: 'openSettings'
          });
        }
      </script>
    </body>
    </html>`;
}
