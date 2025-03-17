import { window, WebviewPanel, ViewColumn, Uri, ExtensionContext } from 'vscode';
import * as path from 'path';

let currentPanel: WebviewPanel | undefined = undefined;

interface ConfigData {
  [key: string]: string | boolean;
}

export function openConfigModal(configData: ConfigData, context?: ExtensionContext) {
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
        }
      }
    );

    currentPanel.webview.html = getWebviewContent(configData, currentPanel, context);
  }
}

function getWebviewContent(configData: ConfigData, panel: WebviewPanel, context?: ExtensionContext): string {
  const configJson = JSON.stringify(configData);

  // Create gear icon URI if context is available (only using this for reference in this function)
  let gearIconSrc = '';
  if (context) {
    const gearIconPath = Uri.file(path.join(context.extensionPath, 'extension', 'src', 'img', 'icon_gear.svg'));
    gearIconSrc = panel.webview.asWebviewUri(gearIconPath).toString();
  }

  return `
    <!DOCTYPE html>
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
      </style>
    </head>
    <body>
      <div class="header">
        ${gearIconSrc ? `<img src="${gearIconSrc}" alt="Settings" />` : ''}
        <h1>Code Block Config</h1>
      </div>
      <form id="configForm">
        <div class="form-group">
          <label for="showExecutableCodeInOutput">Show Executable Code in Output</label>
          <input type="checkbox" id="showExecutableCodeInOutput" name="showExecutableCodeInOutput">
        </div>
        <div class="form-group">
          <label for="showOutputOnRun">Show Output on Run</label>
          <input type="checkbox" id="showOutputOnRun" name="showOutputOnRun">
        </div>
        <div class="form-group">
          <label for="replaceOutputCell">Replace Output Cell</label>
          <input type="checkbox" id="replaceOutputCell" name="replaceOutputCell">
        </div>
        <div class="form-group">
          <label for="showTimestamp">Show Timestamp</label>
          <input type="checkbox" id="showTimestamp" name="showTimestamp">
        </div>
        <div class="form-group">
          <label for="timestampTimezone">Timestamp Timezone</label>
          <input type="text" id="timestampTimezone" name="timestampTimezone" placeholder="UTC">
        </div>
        
        <button type="button" onclick="saveConfig()">Save</button>
        <button type="button" onclick="resetConfig()">Reset</button>
      </form>
      <script>
        const vscode = acquireVsCodeApi();
        const configData = ${configJson};

        // Initialize form with current values
        document.addEventListener('DOMContentLoaded', () => {
          for (const [key, value] of Object.entries(configData)) {
            const element = document.getElementById(key);
            if (element) {
              if (element.type === 'checkbox') {
                element.checked = Boolean(value);
              } else {
                element.value = String(value);
              }
            }
          }
        });

        function saveConfig() {
          const form = document.getElementById('configForm');
          const formData = new FormData(form);
          const config = {};
          
          formData.forEach((value, key) => {
            // Handle checkbox values properly
            if (form.elements[key].type === 'checkbox') {
              config[key] = form.elements[key].checked;
            } else {
              config[key] = value;
            }
          });
          
          vscode.postMessage({ command: 'save', config });
        }

        function resetConfig() {
          vscode.postMessage({ command: 'reset' });
        }
      </script>
    </body>
    </html>
  `;
}

// Export a function to add the gear icon to the toolbar via the VS Code API
export function registerCodeBlockToolbarIntegration(context: ExtensionContext) {
  // This will be called from extension.ts
  console.log('Registering code block toolbar integration');
  return {
    configureCodeBlock: (configData: ConfigData) => {
      openConfigModal(configData, context);
    }
  };
}
