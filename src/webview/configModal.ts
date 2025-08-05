import { window, WebviewPanel, ViewColumn, Uri, ExtensionContext, env, commands, NotebookCell, NotebookDocument, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as codebook from '../codebook';
import { getCellConfig } from '../codebook';
import { saveCellConfig, getLanguageConfigOptions, getOutputConfigOptions } from '../cellConfig';

let currentPanel: WebviewPanel | undefined = undefined;
let modalIsOpen: boolean = false;

/**
 * Updates or adds front matter to markdown content
 * @param content The current markdown content
 * @param frontMatter The new front matter content (without --- delimiters)
 * @returns Updated markdown content with front matter
 */
function updateFrontMatterInMarkdown(content: string, frontMatter: string): string {
  const lines = content.split(/\r?\n/);
  const trimmedFrontMatter = frontMatter.trim();

  // Check if there's existing front matter
  let hasFrontMatter = false;
  let frontMatterEndIndex = 0;

  if (lines.length > 0 && lines[0].trim() === '---') {
    // Look for closing --- marker
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        hasFrontMatter = true;
        frontMatterEndIndex = i + 1;
        break;
      }
    }
  }

  if (trimmedFrontMatter === '') {
    // Remove front matter if empty
    if (hasFrontMatter) {
      // Remove the front matter section
      const remainingContent = lines.slice(frontMatterEndIndex).join('\n');
      return remainingContent.replace(/^\n+/, ''); // Remove leading newlines
    }
    // No front matter to remove
    return content;
  }

  // Add or update front matter
  const frontMatterLines = [
    '---',
    ...trimmedFrontMatter.split('\n'),
    '---'
  ];

  if (hasFrontMatter) {
    // Replace existing front matter
    const remainingContent = lines.slice(frontMatterEndIndex);
    return [...frontMatterLines, '', ...remainingContent].join('\n');
  } else {
    // Add new front matter at the beginning
    return [...frontMatterLines, '', ...lines].join('\n');
  }
}

/**
 * Extracts front matter content from markdown
 * @param content The markdown content
 * @returns The front matter content without --- delimiters, or empty string if none
 */
function extractFrontMatterFromMarkdown(content: string): string {
  const lines = content.split(/\r?\n/);

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return '';
  }

  // Look for closing --- marker
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      // Found closing marker, extract content
      return lines.slice(1, i).join('\n');
    }
  }

  // No closing marker found
  return '';
}

export function isConfigModalOpen(): boolean {
  return modalIsOpen;
}

export async function updateConfigModalForCell(execCell: codebook.ExecutableCell, notebookCell?: NotebookCell): Promise<void> {
  if (!currentPanel || !isConfigModalOpen()) {
    return;
  }

  // Load existing configuration for the new cell
  let existingCellConfig: Record<string, unknown> | undefined = undefined;
  if (notebookCell) {
    try {
      existingCellConfig = await getCellConfig(notebookCell);
      if (existingCellConfig) {
        console.log('Loaded existing cell config for cell update:', existingCellConfig);
      }
    } catch (error) {
      console.error('Error loading cell config during update:', error);
    }
  }

  // Update the webview content with the new cell's configuration
  currentPanel.webview.html = getWebviewContent(execCell, notebookCell, existingCellConfig, false, undefined);

  // Update the panel title to indicate which cell is being configured
  const cellIndex = notebookCell?.index ?? 'Unknown';
  const languageId = notebookCell?.document.languageId ?? 'unknown';
  currentPanel.title = `Code Block Config - Cell ${cellIndex} (${languageId})`;
}

export async function updateConfigModalForNotebook(notebook: NotebookDocument): Promise<void> {
  if (!currentPanel || !isConfigModalOpen()) {
    return;
  }

  // Switch to notebook-only mode - no execCell needed
  currentPanel.webview.html = getWebviewContent(null, undefined, undefined, true, notebook);

  // Update the panel title to indicate notebook configuration
  currentPanel.title = 'Notebook Configuration';
}

export async function openConfigModal(execCell: codebook.ExecutableCell, notebookCell?: NotebookCell, context?: ExtensionContext): Promise<void> {
  return openConfigModalInternal(execCell, notebookCell, context, false);
}

export async function openNotebookConfigModal(execCell: codebook.ExecutableCell | null, notebook: NotebookDocument, context?: ExtensionContext): Promise<void> {
  // For notebook-only mode, we pass a dummy cell but mark it as notebook-only
  // We'll pass the notebook document through a temporary global variable for front matter extraction
  return openConfigModalInternal(execCell, undefined, context, true, notebook);
}

async function openConfigModalInternal(execCell: codebook.ExecutableCell | null, notebookCell?: NotebookCell, context?: ExtensionContext, notebookOnlyMode: boolean = false, notebookDocument?: NotebookDocument): Promise<void> {
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
    // If panel exists, reveal it and update its content for the new cell
    currentPanel.reveal(modalColumn, true); // Second parameter makes it preserve focus on the editor

    // Determine the correct mode based on the new cell's language
    let effectiveNotebookOnlyMode = notebookOnlyMode;
    if (notebookCell && notebookCell.document.languageId === 'markdown') {
      effectiveNotebookOnlyMode = true;
    } else if (notebookCell) {
      // If we have a non-markdown cell, show full config even if originally in notebook-only mode
      effectiveNotebookOnlyMode = false;
    }    // Update the content for the new cell
    currentPanel.webview.html = getWebviewContent(execCell, notebookCell, existingCellConfig, effectiveNotebookOnlyMode, notebookDocument);

    // Update the panel title to indicate which cell is being configured
    if (effectiveNotebookOnlyMode) {
      currentPanel.title = 'Notebook Configuration';
    } else {
      const cellIndex = notebookCell?.index ?? 0;
      const languageId = notebookCell?.document.languageId ?? 'unknown';
      currentPanel.title = `Code Block Config - Cell ${cellIndex + 1} (${languageId})`;
    }
  } else {
    // Determine the correct mode based on the cell's language when creating the panel
    let effectiveNotebookOnlyMode = notebookOnlyMode;
    if (notebookCell && notebookCell.document.languageId === 'markdown') {
      effectiveNotebookOnlyMode = true;
    } else if (notebookCell) {
      // If we have a non-markdown cell, show full config even if originally in notebook-only mode
      effectiveNotebookOnlyMode = false;
    }

    // Create a compact modal-like panel
    const panelTitle = effectiveNotebookOnlyMode ? 'Notebook Configuration' : (() => {
      const cellIndex = notebookCell?.index ?? 0;
      const languageId = notebookCell?.document.languageId ?? 'unknown';
      return `Code Block Config - Cell ${cellIndex + 1} (${languageId})`;
    })();

    currentPanel = window.createWebviewPanel(
      'codeBlockConfig',
      panelTitle,
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

    // Mark the modal as open
    modalIsOpen = true;

    // Make the panel behave more like a modal by setting a fixed size
    currentPanel.webview.options = {
      ...currentPanel.webview.options,
      enableForms: true
    };

    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
        modalIsOpen = false;
      },
      null,
      []
    );

    currentPanel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'saveFrontMatter': {
            // Handle saving front matter to the notebook file
            try {
              const notebookUri = message.notebookUri;
              const frontMatterContent = message.frontMatter;

              if (!notebookUri) {
                window.showErrorMessage('No notebook URI provided for front matter save');
                return;
              }

              const uri = Uri.parse(notebookUri);
              const filePath = uri.fsPath;

              // Read the current file content
              const currentContent = fs.readFileSync(filePath, 'utf8');

              // Update the front matter
              const updatedContent = updateFrontMatterInMarkdown(currentContent, frontMatterContent);

              // Write the updated content back to the file
              fs.writeFileSync(filePath, updatedContent, 'utf8');

              window.showInformationMessage('Front matter updated successfully');
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              window.showErrorMessage(`Error updating front matter: ${errorMessage}`);
              console.error('Error updating front matter:', error);
            }
            return;
          }
          case 'openSpecificSetting': {
            // Open VS Code settings filtered to a specific setting
            commands.executeCommand('workbench.action.openSettings', message.settingId);
            return;
          }
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

    currentPanel.webview.html = getWebviewContent(execCell, notebookCell, existingCellConfig, effectiveNotebookOnlyMode, notebookDocument);
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
function getWebviewContent(execCell: codebook.ExecutableCell | null, notebookCell?: NotebookCell, existingCellConfig?: Record<string, unknown>, notebookOnlyMode: boolean = false, notebookDocument?: NotebookDocument): string {
  // Handle null execCell for notebook-only mode
  const codeBlockConfig = execCell ? execCell.codeBlockConfig() : {
    availableCommands: () => [],
    commands: [],
    languageId: 'markdown',
    cellConfig: {},
    outputConfig: {},
    notebookCell: null
  };
  let commentPrefix = execCell ? execCell.defaultCommentPrefix() : '#';
  if (commentPrefix === '') {
    commentPrefix = '//';
  }
  const availableCommands = codeBlockConfig.availableCommands().map(cmd => `${commentPrefix} [>]${cmd}`);
  const codeBlockCommands = codeBlockConfig.commands.map(cmd => `${commentPrefix} [>]${cmd}`);
  const languageId = codeBlockConfig.languageId;

  // Use the cell configuration from existingCellConfig if provided, otherwise fall back to codeBlockConfig
  const currentCellConfig = existingCellConfig || codeBlockConfig.cellConfig;

  // Get workspace settings
  const workspaceSettings = workspace ? workspace.getConfiguration('codebook-md') : undefined;
  const languageSettings = workspace ? workspace.getConfiguration(`codebook-md.${languageId}`) : undefined;

  // Map settings to an object for use in the form
  const workspaceSettingsObject = workspaceSettings ? Object.keys(workspaceSettings).reduce((obj: Record<string, unknown>, key) => {
    obj[key] = workspaceSettings.get(key);
    return obj;
  }, {}) : {};

  const languageSettingsObject = languageSettings ? Object.keys(languageSettings).reduce((obj: Record<string, unknown>, key) => {
    obj[key] = languageSettings.get(key);
    return obj;
  }, {}) : {};

  // Debug the config
  console.log('Using cell config:', currentCellConfig);
  console.log('Workspace settings:', workspaceSettingsObject);
  console.log('Language settings:', languageSettingsObject);

  // Get language-specific config options
  const languageOptions = getLanguageConfigOptions(languageId);

  // Get output config options
  const outputOptions = getOutputConfigOptions();

  // Get existing output configuration from the cell's outputConfig
  const existingOutputConfig = codeBlockConfig.outputConfig;

  // Extract current front matter if we have a notebook cell or notebook document
  let currentFrontMatter = '';
  if (notebookCell) {
    try {
      const notebookDoc = notebookCell.notebook;
      if (notebookDoc) {
        // Read the file content to extract front matter
        const filePath = notebookDoc.uri.fsPath;
        const fileContent = fs.readFileSync(filePath, 'utf8');
        currentFrontMatter = extractFrontMatterFromMarkdown(fileContent);
      }
    } catch (error) {
      console.error('Error reading front matter:', error);
      currentFrontMatter = '';
    }
  } else if (notebookDocument) {
    try {
      // Read the file content to extract front matter
      const filePath = notebookDocument.uri.fsPath;
      const fileContent = fs.readFileSync(filePath, 'utf8');
      currentFrontMatter = extractFrontMatterFromMarkdown(fileContent);
    } catch (error) {
      console.error('Error reading front matter:', error);
      currentFrontMatter = '';
    }
  }

  // Function to get language icon text and class
  const getLanguageIcon = (langId: string): { text: string; class: string; } => {
    const iconMap: Record<string, { text: string; class: string; }> = {
      'javascript': { text: 'JS', class: 'js' },
      'typescript': { text: 'TS', class: 'ts' },
      'python': { text: 'PY', class: 'py' },
      'go': { text: 'GO', class: 'go' },
      'java': { text: 'JAVA', class: 'java' },
      'csharp': { text: 'C#', class: 'cs' },
      'cpp': { text: 'C++', class: 'cpp' },
      'c': { text: 'C', class: 'c' },
      'rust': { text: 'RS', class: 'rust' },
      'php': { text: 'PHP', class: 'php' },
      'ruby': { text: 'RB', class: 'ruby' },
      'swift': { text: 'SWIFT', class: 'swift' },
      'kotlin': { text: 'KT', class: 'kotlin' },
      'scala': { text: 'SCALA', class: 'scala' },
      'r': { text: 'R', class: 'r' },
      'sql': { text: 'SQL', class: 'sql' },
      'mysql': { text: 'SQL', class: 'sql' },
      'postgresql': { text: 'SQL', class: 'sql' },
      'sqlite': { text: 'SQL', class: 'sql' },
      'bash': { text: 'SH', class: 'bash' },
      'shell': { text: 'SH', class: 'shell' },
      'shellscript': { text: 'SH', class: 'shellscript' },
      'powershell': { text: 'PS1', class: 'powershell' },
      'cmd': { text: 'CMD', class: 'cmd' },
      'http': { text: 'HTTP', class: 'http' },
      'html': { text: 'HTML', class: 'html' },
      'css': { text: 'CSS', class: 'css' },
      'scss': { text: 'SCSS', class: 'scss' },
      'less': { text: 'LESS', class: 'less' },
      'json': { text: 'JSON', class: 'json' },
      'xml': { text: 'XML', class: 'xml' },
      'yaml': { text: 'YAML', class: 'yaml' },
      'yml': { text: 'YAML', class: 'yaml' },
      'toml': { text: 'TOML', class: 'toml' },
      'dockerfile': { text: 'DOCK', class: 'dockerfile' },
      'makefile': { text: 'MAKE', class: 'makefile' },
      'markdown': { text: 'MD', class: 'md' }
    };

    return iconMap[langId.toLowerCase()] || { text: 'CODE', class: 'default' };
  };

  const languageIcon = getLanguageIcon(languageId);

  // Create execution type configuration for non-Go languages - empty since we only show this for Go now
  const executionTypeHTML = ''; // No longer showing execution type dropdown for non-Go languages

  // Go-specific execution type configuration
  const goExecutionTypeHTML = languageId === 'go' ? `
    <div class="subsection">
      <h4>Execution Type Configuration</h4>
      <div class="form-group">
        <div class="label-container">
          <label for="execType" class="label-text">Execution Type</label>
          <span class="codicon codicon-settings-gear settings-wheel" 
                onclick="openSpecificSetting('codebook-md.go.execType')" 
                title="Open setting in VS Code settings"></span>
        </div>
        <select name="execType" id="execType" onchange="toggleGoExecutionTypeConfig(this.value)">
          <option value="run" ${(getConfigValue('execType', currentCellConfig, languageOptions, languageSettingsObject) !== 'test') ? 'selected' : ''}>Run</option>
          <option value="test" ${(getConfigValue('execType', currentCellConfig, languageOptions, languageSettingsObject) === 'test') ? 'selected' : ''}>Test</option>
        </select>
        <script>
          // Ensure the dropdown is set correctly on initial load based on visible sections
          document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
              const testConfig = document.querySelector('.execution-type-config.test-config');
              const execTypeSelect = document.getElementById('execType');
              if (testConfig && execTypeSelect && testConfig.style.display === 'block') {
                execTypeSelect.value = 'test';
              }
            }, 50);
          });
        </script>
      </div>
      
      <div class="form-group execution-type-config run-config" style="display: ${(getConfigValue('execType', currentCellConfig, languageOptions, languageSettingsObject) === 'test' || codeBlockCommands.some(cmd => cmd.includes('runType:test'))) ? 'none' : 'block'}">
        <h4>Run Configuration</h4>
        <div class="form-group">
          <div class="label-container">
            <label for="execTypeRunConfig.execPath" class="label-text">Execution Path</label>
            <span class="codicon codicon-settings-gear settings-wheel" 
                  onclick="openSpecificSetting('codebook-md.go.execTypeRunConfig.execPath')" 
                  title="Open setting in VS Code settings"></span>
          </div>
          <input type="text" name="execTypeRunConfig.execPath" id="execTypeRunConfig.execPath" 
                 value="${currentCellConfig && currentCellConfig.execTypeRunConfig ? getConfigValue('execPath', currentCellConfig.execTypeRunConfig as Record<string, unknown>, { execPath: { default: '.' } }, languageSettingsObject?.execTypeRunConfig as Record<string, unknown>) : '.'}">
        </div>
        <div class="form-group">
          <div class="label-container">
            <label for="execTypeRunConfig.filename" class="label-text">Filename</label>
            <span class="codicon codicon-settings-gear settings-wheel" 
                  onclick="openSpecificSetting('codebook-md.go.execTypeRunConfig.filename')" 
                  title="Open setting in VS Code settings"></span>
          </div>
          <input type="text" name="execTypeRunConfig.filename" id="execTypeRunConfig.filename" 
                 value="${currentCellConfig && currentCellConfig.execTypeRunConfig ? getConfigValue('filename', currentCellConfig.execTypeRunConfig as Record<string, unknown>, { filename: { default: 'main.go' } }, languageSettingsObject?.execTypeRunConfig as Record<string, unknown>) : 'main.go'}">
        </div>
      </div>
      
      <div class="form-group execution-type-config test-config" style="display: ${(getConfigValue('execType', currentCellConfig, languageOptions, languageSettingsObject) === 'test' || codeBlockCommands.some(cmd => cmd.includes('runType:test'))) ? 'block' : 'none'}">
        <h4>Test Configuration</h4>
        <div class="form-group">
          <div class="label-container">
            <label for="execTypeTestConfig.execPath" class="label-text">Execution Path</label>
            <span class="codicon codicon-settings-gear settings-wheel" 
                  onclick="openSpecificSetting('codebook-md.go.execTypeTestConfig.execPath')" 
                  title="Open setting in VS Code settings"></span>
          </div>
          <input type="text" name="execTypeTestConfig.execPath" id="execTypeTestConfig.execPath" 
                 value="${currentCellConfig && currentCellConfig.execTypeTestConfig ? getConfigValue('execPath', currentCellConfig.execTypeTestConfig as Record<string, unknown>, { execPath: { default: '.' } }, languageSettingsObject?.execTypeTestConfig as Record<string, unknown>) : '.'}">
        </div>
        <div class="form-group">
          <div class="label-container">
            <label for="execTypeTestConfig.filename" class="label-text">Filename</label>
            <span class="codicon codicon-settings-gear settings-wheel" 
                  onclick="openSpecificSetting('codebook-md.go.execTypeTestConfig.filename')" 
                  title="Open setting in VS Code settings"></span>
          </div>
          <input type="text" name="execTypeTestConfig.filename" id="execTypeTestConfig.filename" 
                 value="${currentCellConfig && currentCellConfig.execTypeTestConfig ? getConfigValue('filename', currentCellConfig.execTypeTestConfig as Record<string, unknown>, { filename: { default: 'codebook_md_exec_test.go' } }, languageSettingsObject?.execTypeTestConfig as Record<string, unknown>) : 'codebook_md_exec_test.go'}">
        </div>
        <div class="form-group">
          <div class="label-container">
            <label for="execTypeTestConfig.buildTag" class="label-text">Build Tag</label>
            <span class="codicon codicon-settings-gear settings-wheel" 
                  onclick="openSpecificSetting('codebook-md.go.execTypeTestConfig.buildTag')" 
                  title="Open setting in VS Code settings"></span>
          </div>
          <input type="text" name="execTypeTestConfig.buildTag" id="execTypeTestConfig.buildTag" 
                 value="${currentCellConfig && currentCellConfig.execTypeTestConfig ? getConfigValue('buildTag', currentCellConfig.execTypeTestConfig as Record<string, unknown>, { buildTag: { default: 'playground' } }, languageSettingsObject?.execTypeTestConfig as Record<string, unknown>) : 'playground'}">
        </div>
      </div>
    </div>
  ` : '';

  // Create form fields for language-specific options
  let languageOptionsHTML = '';
  if (Object.keys(languageOptions).length > 0) {
    languageOptionsHTML = `
      <div class="form-section">
        <h3>Language-specific Configuration</h3>
        ${languageId === 'go' ? goExecutionTypeHTML : ''}
        ${Object.entries(languageOptions).map(([key, option]: [string, { type: string; description: string; default: string | boolean | Record<string, unknown>; options?: string[]; internal?: boolean; }]) => {
      // Skip execType as it's now in its own section
      if (key === 'execType') return '';

      // Skip options marked as internal (not for UI display)
      if (option.internal === true) return '';

      // Skip object-type config options for Go (they are handled in goExecutionTypeHTML)
      if (languageId === 'go' && (key === 'execTypeRunConfig' || key === 'execTypeTestConfig')) return '';

      // Get the current value using the configuration hierarchy
      const currentValue = getConfigValue(key, currentCellConfig || {}, languageOptions, languageId === 'go' ? languageSettingsObject : workspaceSettingsObject);

      // Generate setting ID for this option
      const settingId = `codebook-md.${languageId}.${key}`;

      if (option.type === 'boolean') {
        return `
              <div class="form-group">
                <div class="checkbox-label">
                  <div class="checkbox-label-container">
                    <input type="checkbox" name="${key}" id="${key}" ${currentValue === true ? 'checked' : ''}>
                    <span class="label-text">${option.description}</span>
                    <span class="codicon codicon-settings-gear settings-wheel" 
                          onclick="openSpecificSetting('${settingId}')" 
                          title="Open setting in VS Code settings"></span>
                  </div>
                </div>
              </div>
            `;
      } else if (option.type === 'select' && option.options) {
        return `
              <div class="form-group">
                <div class="label-container">
                  <label for="${key}">${option.description}</label>
                  <span class="codicon codicon-settings-gear settings-wheel" 
                        onclick="openSpecificSetting('${settingId}')" 
                        title="Open setting in VS Code settings"></span>
                </div>
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
                <div class="label-container">
                  <label for="${key}" class="label-text">${option.description}</label>
                  <span class="codicon codicon-settings-gear settings-wheel" 
                        onclick="openSpecificSetting('${settingId}')" 
                        title="Open setting in VS Code settings"></span>
                </div>
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
      ${Object.entries(outputOptions).map(([key, option]: [string, { type: string; description: string; default: string | boolean | Record<string, unknown>; }]) => {
    // Create a dedicated output config object if it exists
    const outputConfig = currentCellConfig && currentCellConfig.output ? currentCellConfig.output as Record<string, unknown> : {};

    // Use the configuration hierarchy for output settings
    const workspaceOutputSettings = workspaceSettings ? workspaceSettings.output as Record<string, unknown> : {};
    const currentValue = getConfigValue(key, outputConfig, outputOptions, workspaceOutputSettings);

    // Generate setting ID for this output option
    const settingId = `codebook-md.output.${key}`;

    if (option.type === 'boolean') {
      return `
            <div class="form-group">
              <div class="checkbox-label">
                <div class="checkbox-label-container">
                  <input type="checkbox" name="output.${key}" id="output.${key}" ${currentValue === true ? 'checked' : ''}>
                  <span class="label-text">${option.description}</span>
                  <span class="codicon codicon-settings-gear settings-wheel" 
                        onclick="openSpecificSetting('${settingId}')" 
                        title="Open setting in VS Code settings"></span>
                </div>
              </div>
            </div>
          `;
    } else {
      return `
            <div class="form-group">
              <div class="label-container">
                <label for="output.${key}" class="label-text">${option.description}</label>
                <span class="codicon codicon-settings-gear settings-wheel" 
                      onclick="openSpecificSetting('${settingId}')" 
                      title="Open setting in VS Code settings"></span>
              </div>
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
        <button type="button" class="command-button copy-button" onclick="copyToClipboard('${cmd}')" title="Copy Command">📋</button>
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
          padding: 0;
          /* Set max dimensions to make it more modal-like */
          max-width: 500px;
          margin: 0 auto;
          box-sizing: border-box;
          /* Add blue outline to match selected cell styling */
          border: 2px solid var(--vscode-focusBorder);
          border-radius: 4px;
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
          position: sticky;
          top: 0;
          z-index: 1000;
          background: var(--vscode-editor-background);
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 0;
          border-bottom: 1px solid var(--vscode-panel-border);
          padding: 12px 16px;
          /* Add subtle shadow to emphasize the sticky header */
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
        .language-icon {
          width: 20px;
          height: 20px;
          margin-right: 8px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          border-radius: 2px;
          color: white;
          text-transform: uppercase;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        }
        .language-icon.js { background-color: #f7df1e; color: #000; }
        .language-icon.ts { background-color: #3178c6; }
        .language-icon.py { background-color: #3776ab; }
        .language-icon.go { background-color: #00add8; }
        .language-icon.java { background-color: #ed8b00; }
        .language-icon.cs { background-color: #239120; }
        .language-icon.cpp { background-color: #00599c; }
        .language-icon.c { background-color: #a8b9cc; color: #000; }
        .language-icon.rust { background-color: #dea584; color: #000; }
        .language-icon.php { background-color: #777bb4; }
        .language-icon.ruby { background-color: #cc342d; }
        .language-icon.swift { background-color: #fa7343; }
        .language-icon.kotlin { background-color: #7f52ff; }
        .language-icon.scala { background-color: #dc322f; }
        .language-icon.r { background-color: #276dc3; }
        .language-icon.sql { background-color: #336791; }
        .language-icon.bash,
        .language-icon.shell,
        .language-icon.shellscript { background-color: #89e051; color: #000; }
        .language-icon.powershell { background-color: #012456; }
        .language-icon.cmd { background-color: #4d4d4d; }
        .language-icon.http { background-color: #61dafb; color: #000; }
        .language-icon.html { background-color: #e34c26; }
        .language-icon.css { background-color: #1572b6; }
        .language-icon.scss { background-color: #cf649a; }
        .language-icon.less { background-color: #1d365d; }
        .language-icon.json { background-color: #292929; }
        .language-icon.xml { background-color: #0060ac; }
        .language-icon.yaml { background-color: #cb171e; }
        .language-icon.toml { background-color: #9c4221; }
        .language-icon.dockerfile { background-color: #384d54; }
        .language-icon.makefile { background-color: #427819; }
        .language-icon.md { background-color: #083fa1; }
        .language-icon.default { background-color: #6cc04a; color: #000; }
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
        .form-section h4 {
          margin-top: 10px;
          margin-bottom: 8px;
          font-size: 0.9em;
          color: var(--vscode-editor-foreground);
        }
        .subsection {
          margin-bottom: 20px;
          padding: 10px;
          border-left: 2px solid var(--vscode-panel-border);
          background-color: rgba(128, 128, 128, 0.05);
          border-radius: 3px;
        }
        .config-section {
          margin-bottom: 20px;
        }
        .label-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 5px;
          width: 100%;
        }
        .checkbox-label-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }
        .checkbox-label-container input[type="checkbox"] {
          margin-right: 8px;
        }
        .label-text {
          flex-grow: 1;
          text-align: left;
        }
        .settings-wheel {
          color: var(--vscode-descriptionForeground);
          cursor: pointer;
          margin-left: 8px;
          opacity: 0.7;
          flex-shrink: 0;
          font-size: 75%; /* Reduce the size to 75% of the original */
          transform: scale(0.75); /* Additional scaling to ensure the icon is truly 75% */
        }
        .settings-wheel:hover {
          opacity: 1;
          color: var(--vscode-textLink-foreground);
        }
        .content {
          padding: 16px;
        }
        
        /* Global Header with Close Button */
        .global-header {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 1000;
        }
        
        /* Notebook Configuration Section - Top Level */
        .notebook-config-section-wrapper {
          background: var(--vscode-sideBar-background);
          border-bottom: 2px solid var(--vscode-panel-border);
          margin-bottom: 0;
        }
        .notebook-header {
          background: var(--vscode-titleBar-activeBackground);
          border-bottom: 1px solid var(--vscode-panel-border);
          padding: 8px 16px;
          margin: 0;
        }
        .notebook-header h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--vscode-titleBar-activeForeground);
        }
        .notebook-content {
          padding: 16px;
          margin: 0;
        }
        
        .notebook-config-section {
          margin-bottom: 0;
        }
        .notebook-config-section summary {
          padding: 12px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border-radius: 3px;
          cursor: pointer;
          font-weight: bold;
          margin-bottom: 5px;
          display: flex;
          align-items: center;
        }
        .notebook-config-section summary:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .notebook-config-section summary::marker {
          color: var(--vscode-button-secondaryForeground);
        }
        .notebook-config-section summary .codicon {
          margin-right: 8px;
        }
        .notebook-config-content {
          padding: 15px;
          border: 1px solid var(--vscode-panel-border);
          border-top: none;
          border-radius: 0 0 3px 3px;
          background: var(--vscode-editor-background);
        }
        textarea {
          width: 100%;
          padding: 8px;
          border-radius: 3px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          resize: vertical;
          min-height: 120px;
        }
        .notebook-save-button {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 8px 16px;
          border-radius: 3px;
          cursor: pointer;
          font-weight: bold;
        }
        .notebook-save-button:hover {
          background: var(--vscode-button-hoverBackground);
        }
      </style>
    </head>
    <body>
      <!-- Global Close Button -->
      <div class="global-header">
        <button type="button" class="close-button" onclick="closeModal()" title="Close">×</button>
      </div>
      
      <!-- Notebook Configuration Section -->
      <div class="notebook-config-section-wrapper">
        <div class="header notebook-header">
          <div class="header-left">
            <span class="codicon codicon-notebook"></span>
            <h1>Notebook Config</h1>
          </div>
        </div>
        <div class="content notebook-content">
          <details class="form-section notebook-config-section">
            <summary>
              <span class="codicon codicon-edit"></span>
              <span>Front Matter Settings</span>
            </summary>
            <div class="notebook-config-content">
              <div class="form-group">
                <label for="frontMatter" class="label-text">YAML Front Matter</label>
                <textarea name="frontMatter" id="frontMatter" rows="6" placeholder="Enter YAML front matter content (without --- delimiters)&#10;Example:&#10;mode: agent&#10;model: Claude Sonnet 4&#10;description: My notebook description">${currentFrontMatter}</textarea>
                <small>Configure notebook metadata using YAML format. Do not include the --- delimiters.</small>
              </div>
              <div class="form-group">
                <button type="button" class="notebook-save-button" onclick="saveFrontMatter()">Save Front Matter</button>
              </div>
              <div class="help-link" onclick="openDocumentation('front-matter')">
                <span class="codicon codicon-question"></span>
                <span>Learn more about Front Matter configuration</span>
              </div>
            </div>
          </details>
        </div>
      </div>
      
      ${!notebookOnlyMode ? `
      <div class="header">
        <div class="header-left">
          <span class="language-icon ${languageIcon.class}">${languageIcon.text}</span>
          <span class="codicon codicon-gear"></span>
          <h1>Code Block Config - Language: ${languageId}</h1>
        </div>
      </div>
      
      <div class="content">`
      : ''}
      
      ${!notebookOnlyMode ? `
      <div class="help-link" onclick="openDocumentation('executable-code')">
        <span class="codicon codicon-question"></span>
        <span>Learn more about executable code blocks</span>
      </div>` : ''}
      
      ${!notebookOnlyMode ? `
      <div class="help-link" onclick="openVSCodeSettings()">
        <span class="codicon codicon-settings-gear"></span>
        <span>Open VS Code settings for CodebookMD</span>
      </div>` : ''}
      
      ${!notebookOnlyMode ? `
      ${languageId === 'go' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-go')">
        <span class="codicon codicon-symbol-property"></span>
        <span>Go-specific configuration options</span>
      </div>
      ` : ''}` : ''}
      
      ${!notebookOnlyMode ? `
      ${languageId === 'sql' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-sql')">
        <span class="codicon codicon-symbol-property"></span>
        <span>SQL-specific configuration options</span>
      </div>
      ` : ''}` : ''}
      
      ${!notebookOnlyMode ? `
      ${languageId === 'javascript' || languageId === 'typescript' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-javascript')">
        <span class="codicon codicon-symbol-property"></span>
        <span>${languageId === 'javascript' ? 'JavaScript' : 'TypeScript'}-specific configuration options</span>
      </div>
      ` : ''}` : ''}
      
      ${!notebookOnlyMode ? `
      ${languageId === 'python' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-python')">
        <span class="codicon codicon-symbol-property"></span>
        <span>Python-specific configuration options</span>
      </div>
      ` : ''}` : ''}
      
      ${!notebookOnlyMode ? `
      ${languageId === 'http' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-http')">
        <span class="codicon codicon-symbol-property"></span>
        <span>HTTP-specific configuration options</span>
      </div>
      ` : ''}` : ''}
      
      ${!notebookOnlyMode ? `
      ${languageId === 'bash' || languageId === 'shellscript' || languageId === 'shell' ? `
      <div class="help-link language-specific" onclick="openDocumentation('codeblock-config-bash')">
        <span class="codicon codicon-symbol-property"></span>
        <span>Shell/Bash-specific configuration options</span>
      </div>
      ` : ''}` : ''}
      
      ${!notebookOnlyMode ? `
      <form id="configForm">
          <div class="form-group">
            <label for="languageId">Language ID</label>
            <input type="text" id="languageId" value="${languageId}" readonly />
          </div>
          
          <!-- Configuration options section -->
          <div class="config-section">
            <!-- Add the execution type configuration first -->
            ${executionTypeHTML}
            
            <!-- Execution path configuration (for non-Go languages) -->
            ${languageId !== 'go' ? `
            <div class="form-section">
              <h3>Execution Path</h3>
              <div class="form-group">
                <div class="label-container">
                  <label for="execPath" class="label-text">Execution Path for this cell</label>
                  <span class="codicon codicon-settings-gear settings-wheel" 
                        onclick="openSpecificSetting('codebook-md.execPath')" 
                        title="Open setting in VS Code settings"></span>
                </div>
                <input type="text" name="execPath" id="execPath" value="${getConfigValue('execPath', currentCellConfig || {}, { 'execPath': { default: '' } }, workspaceSettingsObject)}">
                <small>Directory where the code will be executed.</small>
                <div style="margin-top: 6px; font-size: 0.9em; color: var(--vscode-descriptionForeground);">
                  <div><span class="codicon codicon-info"></span> Leave blank to use the default 'execPath' from VS Code Config</div>
                  <div><span class="codicon codicon-info"></span> A relative path is also valid (ie: './codebook-md/')</div>
                </div>
              </div>
            </div>
            ` : ''}
            
            <!-- Then language-specific configuration -->
            ${languageOptionsHTML}
            
            <!-- Then output configuration -->
            ${outputOptionsHTML}
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
      </div>` : ''}
      
      <div class="modal-actions">
        ${!notebookOnlyMode ? `<button type="button" onclick="saveConfig()">Save Configuration</button>` : ''}
        <button type="button" onclick="closeModal()">Close</button>
      </div>
      </div>
       <script>
        const vscode = acquireVsCodeApi();
        const notebookCellData = ${notebookCell ? JSON.stringify({
        index: notebookCell.index,
        languageId: notebookCell.document.languageId,
        notebookUri: notebookCell.notebook?.uri.toString()
      }, null, 2) : 'null'};
        
        // For notebook-only mode, provide the notebook URI separately
        const notebookUri = ${notebookDocument ? `"${notebookDocument.uri.toString()}"` : (notebookCell ? `"${notebookCell.notebook?.uri.toString()}"` : 'null')};
        
        // Make language and output options available to the client script
        const languageOptions = ${JSON.stringify(languageOptions)};
        const outputOptions = ${JSON.stringify(outputOptions)};

        // Pass the existing configuration to the client as a JSON string
        const existingCellConfigData = ${JSON.stringify(currentCellConfig)};
        const existingOutputConfigData = {
          showExecutableCodeInOutput: ${existingOutputConfig && typeof existingOutputConfig === 'object' && 'showExecutableCodeInOutput' in existingOutputConfig ? existingOutputConfig.showExecutableCodeInOutput : false},
          replaceOutputCell: ${existingOutputConfig && typeof existingOutputConfig === 'object' && 'replaceOutputCell' in existingOutputConfig ? existingOutputConfig.replaceOutputCell : true},
          showTimestamp: ${existingOutputConfig && typeof existingOutputConfig === 'object' && 'showTimestamp' in existingOutputConfig ? existingOutputConfig.showTimestamp : false},
          timestampTimezone: "${existingOutputConfig && typeof existingOutputConfig === 'object' && 'timestampTimezone' in existingOutputConfig ? existingOutputConfig.timestampTimezone : 'UTC'}"
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
                <button type="button" class="command-button copy-button" onclick="copyToClipboard('\${command}')" title="Copy Command">📋</button>
                <span class="command-name">\${command}</span>
              </div>
            \`;
          }).join('');
        }
        
        // Initialize form values with existing config when the form loads
        function initFormFromConfig() {
          const form = document.getElementById('configForm');
          
          // Get workspace settings provided by extension
          const workspaceSettings = ${JSON.stringify(workspaceSettings || {})};
          const languageSettings = ${JSON.stringify(languageSettings || {})};
          
          // Helper function to get config value using the hierarchy
          function getFormConfigValue(key, cellConfig, options, workspaceSettings) {
            // Check cell-specific config first
            if (cellConfig && cellConfig[key] !== undefined) {
              return cellConfig[key];
            }
            // Check workspace settings next
            if (workspaceSettings && workspaceSettings[key] !== undefined) {
              return workspaceSettings[key];
            }
            // Finally fall back to default
            if (options[key] && options[key].default !== undefined) {
              return options[key].default;
            }
            return undefined;
          }
          
          // Initialize checkboxes for output config
          const outputOptions = ${JSON.stringify(outputOptions)};
          const existingOutputConfig = existingCellConfigData && existingCellConfigData.output ? existingCellConfigData.output : {};
          const workspaceOutputSettings = workspaceSettings && workspaceSettings.output ? workspaceSettings.output : {};
          
          if (form) {
            // Initialize all output checkbox fields
            Object.keys(outputOptions).forEach(key => {
              const fieldName = 'output.' + key;
              const field = form.elements[fieldName];
              if (field) {
                if (field.type === 'checkbox') {
                  // Use the configuration hierarchy for checkbox value
                  const value = getFormConfigValue(key, existingOutputConfig, outputOptions, workspaceOutputSettings);
                  field.checked = Boolean(value);
                } else {
                  // For text fields
                  const value = getFormConfigValue(key, existingOutputConfig, outputOptions, workspaceOutputSettings);
                  field.value = value || '';
                }
              }
            });
            
            // Initialize language-specific options
            const languageOptions = ${JSON.stringify(languageOptions)};
            
            Object.keys(languageOptions).forEach(key => {
              // Skip execType as it's handled separately
              if (key === 'execType') return;
              
              // Skip object-type config options for Go (they are handled separately)
              if (languageId === 'go' && (key === 'execTypeRunConfig' || key === 'execTypeTestConfig')) return;
              
              const field = form.elements[key];
              if (field) {
                if (field.type === 'checkbox') {
                  // Use the configuration hierarchy for checkbox value
                  const value = getFormConfigValue(key, existingCellConfigData, languageOptions, languageSettings);
                  field.checked = Boolean(value);
                } else {
                  // For text fields and dropdowns
                  const value = getFormConfigValue(key, existingCellConfigData, languageOptions, languageSettings);
                  field.value = value !== undefined ? value : '';
                }
              }
            });
            
            // Special handling for execType in Go language only
            if (languageId === 'go') {
              const execTypeSelect = form.elements['execType'];
              if (execTypeSelect) {
                // Check if the code block commands contain runType:test
                const isInTestMode = existingCellConfigData && existingCellConfigData.execType === 'test' || 
                                    codeBlockCommands && codeBlockCommands.some(cmd => cmd.includes('runType:test'));
                
                // Use test if detected in commands, otherwise use config hierarchy
                const execType = isInTestMode ? 'test' : 
                                (getFormConfigValue('execType', existingCellConfigData, languageOptions, languageSettings) || 'run');
                
                console.log('Setting Go execType to:', execType, 'based on test mode detection:', isInTestMode);
                execTypeSelect.value = execType;
                
                // Toggle visibility based on this value
                toggleGoExecutionTypeConfig(execType);
                
                // Add change listener to ensure the UI updates when the selection changes
                execTypeSelect.addEventListener('change', function(event) {
                  const newValue = event.target.value;
                  console.log('execType changed to:', newValue);
                  toggleGoExecutionTypeConfig(newValue);
                });
              }
            }
            
            // For non-Go languages, initialize execPath field
            if (languageId !== 'go' && form.elements['execPath']) {
              const execPathValue = getFormConfigValue('execPath', existingCellConfigData, {'execPath': {default: ''}}, workspaceSettings);
              form.elements['execPath'].value = execPathValue || '';
            }
          }
        }
        
        // Initialize Go execution type visibility
        function toggleGoExecutionTypeConfig(value) {
          console.log('Toggling visibility based on execType:', value);
          const runConfig = document.querySelector('.execution-type-config.run-config');
          const testConfig = document.querySelector('.execution-type-config.test-config');
          
          if (runConfig && testConfig) {
            // Always ensure only one section is visible
            runConfig.style.display = value === 'run' ? 'block' : 'none';
            testConfig.style.display = value === 'test' ? 'block' : 'none';
            
            console.log('Run config display:', runConfig.style.display);
            console.log('Test config display:', testConfig.style.display);
          } else {
            console.error('Could not find run or test config sections');
          }
        }
        
        // Initialize form when the script loads
        document.addEventListener('DOMContentLoaded', initFormFromConfig);
        
        // Also call initFormFromConfig immediately in case DOMContentLoaded already fired
        initFormFromConfig();
        
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
                // Handle nested config objects for Go execution type config
                if (key.includes('.')) {
                  // Split the key into object path components
                  const keyParts = key.split('.');
                  const rootKey = keyParts[0];
                  const nestedKey = keyParts[1];
                  
                  // Create the nested object if it doesn't exist
                  if (!config[rootKey]) {
                    config[rootKey] = {};
                  }
                  
                  // Set the nested value
                  config[rootKey][nestedKey] = element.value;
                  
                  console.log('Nested config:', {
                    rootKey: rootKey,
                    nestedKey: nestedKey,
                    value: element.value
                  });
                } else {
                  config[key] = element.value;
                  console.log('Config:', {
                    key: key,
                    value: element.value
                  });
                }
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
          
          // Special handling for Go execution type
          if (languageId === 'go') {
            // Get the execType selection
            const execTypeSelect = document.getElementById('execType');
            if (execTypeSelect) {
              // Set the execType value
              config.execType = execTypeSelect.value;
            }
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
        
        function openSpecificSetting(settingId) {
          // Send a message to open VS Code settings for a specific setting
          vscode.postMessage({
            command: 'openSpecificSetting',
            settingId: settingId
          });
        }
        
        function saveFrontMatter() {
          // Get the front matter content from the textarea
          const frontMatterTextarea = document.getElementById('frontMatter');
          const frontMatterContent = frontMatterTextarea ? frontMatterTextarea.value : '';
          
          // Get the notebook URI - prioritize from notebookCellData, fallback to notebookUri
          let targetNotebookUri;
          if (notebookCellData && notebookCellData.notebookUri) {
            targetNotebookUri = notebookCellData.notebookUri;
          } else if (notebookUri) {
            targetNotebookUri = notebookUri;
          } else {
            // Show error message
            vscode.postMessage({
              command: 'saveFrontMatter',
              error: 'No notebook URI available'
            });
            return;
          }
          
          // Send the front matter save request to the extension
          vscode.postMessage({
            command: 'saveFrontMatter',
            notebookUri: targetNotebookUri,
            frontMatter: frontMatterContent
          });
        }
      </script>
    </body>
    </html>`;
}

/**
 * Gets configuration value following the hierarchy:
 * 1. Cell-specific config (if available)
 * 2. Workspace settings
 * 3. Default value from options
 * 
 * @param key Configuration key
 * @param cellConfig Cell-specific configuration
 * @param options Configuration options with default values
 * @param workspaceSettings Workspace settings
 * @returns Configuration value following the hierarchy
 */
function getConfigValue(
  key: string,
  cellConfig: Record<string, unknown>,
  options: Record<string, { default: unknown; type?: string; description?: string; options?: string[]; }>,
  workspaceSettings?: Record<string, unknown>
): unknown {
  // Check cell-specific config first
  if (cellConfig && cellConfig[key] !== undefined) {
    console.log(`Using cell-specific config for ${key}:`, cellConfig[key]);
    return cellConfig[key];
  }

  // Check workspace settings next
  if (workspaceSettings && workspaceSettings[key] !== undefined) {
    console.log(`Using workspace setting for ${key}:`, workspaceSettings[key]);
    return workspaceSettings[key];
  }

  // Finally fall back to default
  if (options[key] && options[key].default !== undefined) {
    console.log(`Using default value for ${key}:`, options[key].default);
    return options[key].default;
  }

  // Return undefined if no value is found
  console.log(`No value found for ${key}`);
  return undefined;
}

// Export functions for testing
export const __test__ = {
  updateFrontMatterInMarkdown,
  extractFrontMatterFromMarkdown
};

// Initialize form values with values from the configuration hierarchy
