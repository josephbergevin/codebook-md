import { ConfigField } from './cellConfigFields';

/**
 * HTML for the cell/notebook configuration modal.
 *
 * Everything interpolated into the page is escaped, all data reaches the page
 * script as escaped JSON, and there are no inline event handlers: the page runs
 * under a Content-Security-Policy that only allows scripts carrying the nonce.
 */

export interface ModalCell {
  uri: string; // the cell document URI - stable while cells move around
  index: number;
  languageId: string;
}

export interface ModalRenderParams {
  cspSource: string;
  nonce: string;
  notebookUri?: string;
  // undefined in notebook-only mode (a markdown cell, or the notebook toolbar)
  cell?: ModalCell;
  frontMatter: string;
  fields: ConfigField[];
  // [>] commands found in the cell, and ones the user could add - with comment prefix
  cellCommands: string[];
  availableCommands: string[];
  history: { enabled: boolean; historyLimit: number; target: 'workspace' | 'user'; };
}

/** escapeHtml escapes text for use in HTML content and quoted attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** safeJson serializes a value for embedding inside a <script> element. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const languageIcons: Record<string, { text: string; class: string; }> = {
  javascript: { text: 'JS', class: 'js' },
  typescript: { text: 'TS', class: 'ts' },
  python: { text: 'PY', class: 'py' },
  go: { text: 'GO', class: 'go' },
  sql: { text: 'SQL', class: 'sql' },
  shellscript: { text: 'SH', class: 'shellscript' },
  bash: { text: 'SH', class: 'bash' },
  shell: { text: 'SH', class: 'shell' },
  http: { text: 'HTTP', class: 'http' },
};

// Documentation section for each language's options
const languageDocs: Record<string, { section: string; name: string; }> = {
  go: { section: 'codeblock-config-go', name: 'Go' },
  sql: { section: 'codeblock-config-sql', name: 'SQL' },
  javascript: { section: 'codeblock-config-javascript', name: 'JavaScript' },
  typescript: { section: 'codeblock-config-javascript', name: 'TypeScript' },
  python: { section: 'codeblock-config-python', name: 'Python' },
  http: { section: 'codeblock-config-http', name: 'HTTP' },
  shellscript: { section: 'codeblock-config-bash', name: 'Shell/Bash' },
};

const groupTitles: Record<ConfigField['group'], string> = {
  execution: 'Execution',
  language: 'Language-specific Configuration',
  output: 'Output Configuration',
};

function fieldControlId(field: ConfigField): string {
  return `field-${field.id}`;
}

function renderSettingButton(field: ConfigField): string {
  return `<button type="button" class="icon-button settings-wheel" data-action="open-setting"
            data-setting="${escapeHtml(field.settingId)}"
            title="Open the ${escapeHtml(field.settingId)} setting"
            aria-label="Open the ${escapeHtml(field.settingId)} setting">
            <span class="codicon codicon-settings-gear"></span>
          </button>`;
}

function renderControl(field: ConfigField): string {
  const id = escapeHtml(fieldControlId(field));
  const dataField = `data-field="${escapeHtml(field.id)}"`;
  switch (field.type) {
    case 'boolean':
      return `<input type="checkbox" id="${id}" ${dataField}>`;
    case 'select':
      return `<select id="${id}" ${dataField}>
          ${(field.options ?? []).map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
        </select>`;
    case 'number':
      return `<input type="number" id="${id}" ${dataField} step="1">`;
    default:
      return `<input type="text" id="${id}" ${dataField} spellcheck="false">`;
  }
}

function renderField(field: ConfigField): string {
  const showWhen = field.showWhen
    ? `data-show-when="${escapeHtml(field.showWhen.field)}" data-show-equals="${escapeHtml(field.showWhen.equals)}"`
    : '';
  const label = field.type === 'boolean'
    ? `<label class="checkbox-label-container" for="${escapeHtml(fieldControlId(field))}">
          ${renderControl(field)}
          <span class="label-text">${escapeHtml(field.label)}</span>
        </label>`
    : `<label for="${escapeHtml(fieldControlId(field))}" class="label-text">${escapeHtml(field.label)}</label>`;
  return `
      <div class="form-group field" data-field-row="${escapeHtml(field.id)}" ${showWhen}>
        <div class="label-container">
          ${label}
          ${renderSettingButton(field)}
        </div>
        ${field.type === 'boolean' ? '' : renderControl(field)}
        <div class="field-meta">
          <span class="field-source" data-source-for="${escapeHtml(field.id)}"></span>
          <button type="button" class="link-button" data-action="reset-field" data-field="${escapeHtml(field.id)}">Reset to inherited</button>
        </div>
        ${field.description ? `<small class="field-help">${escapeHtml(field.description)}</small>` : ''}
      </div>`;
}

function renderFieldGroups(fields: ConfigField[]): string {
  return (['execution', 'language', 'output'] as const)
    .map(group => {
      const groupFields = fields.filter(f => f.group === group);
      if (groupFields.length === 0) {
        return '';
      }
      return `
      <div class="form-section">
        <h3>${groupTitles[group]}</h3>
        ${groupFields.map(renderField).join('')}
      </div>`;
    })
    .join('');
}

function renderCommandList(commands: string[], copyable: boolean, emptyText: string): string {
  if (commands.length === 0) {
    return `<p class="history-empty-message">${escapeHtml(emptyText)}</p>`;
  }
  return commands.map(cmd => `
      <div class="command-item">
        ${copyable ? `<button type="button" class="icon-button copy-button" data-action="copy" data-text="${escapeHtml(cmd)}" title="Copy command" aria-label="Copy command"><span class="codicon codicon-copy"></span></button>` : ''}
        <code class="command-name">${escapeHtml(cmd)}</code>
      </div>`).join('');
}

function renderCellSection(params: ModalRenderParams, cell: ModalCell): string {
  const icon = languageIcons[cell.languageId] ?? { text: 'CODE', class: 'default' };
  const docs = languageDocs[cell.languageId];
  const historyScope = params.history.target === 'workspace' ? 'workspace setting' : 'user setting';
  return `
      <div class="header">
        <div class="header-left">
          <span class="language-icon ${escapeHtml(icon.class)}">${escapeHtml(icon.text)}</span>
          <h1>Cell ${cell.index + 1} &middot; ${escapeHtml(cell.languageId)}</h1>
        </div>
      </div>

      <div class="content">
        <div id="pendingBanner" class="banner" hidden>
          <span>You selected another cell. Save or discard the changes here to switch to it.</span>
          <button type="button" data-action="discard">Discard changes</button>
        </div>

        <p class="intro">Settings apply to this cell only. Anything you don't change here follows your VS Code settings.</p>

        <div class="help-links">
          <button type="button" class="link-button help-link" data-action="open-docs" data-section="executable-code">
            <span class="codicon codicon-question"></span><span>Executable code blocks</span>
          </button>
          ${docs ? `<button type="button" class="link-button help-link" data-action="open-docs" data-section="${escapeHtml(docs.section)}">
            <span class="codicon codicon-symbol-property"></span><span>${escapeHtml(docs.name)} options</span>
          </button>` : ''}
          <button type="button" class="link-button help-link" data-action="open-settings">
            <span class="codicon codicon-settings-gear"></span><span>All CodebookMD settings</span>
          </button>
        </div>

        <form id="configForm" autocomplete="off">
          <div class="config-section">
            ${renderFieldGroups(params.fields)}
          </div>
        </form>

        <div class="form-section execution-history-section">
          <details class="history-details">
            <summary>
              <span class="codicon codicon-history"></span>
              <span id="historyTitle">Execution History</span>
              <button type="button" class="clear-history-button" data-action="clear-history" title="Clear all history for this cell">
                <span class="codicon codicon-trash"></span> Clear
              </button>
            </summary>
            <div class="history-content">
              <div class="history-config-controls">
                <div class="form-group">
                  <label class="checkbox-label-container" for="historyEnabled">
                    <input type="checkbox" id="historyEnabled" ${params.history.enabled ? 'checked' : ''}>
                    <span class="label-text">Record execution history</span>
                  </label>
                </div>
                <div class="form-group">
                  <label for="historyLimit" class="label-text">History entries per cell (0 for unlimited)</label>
                  <input type="number" id="historyLimit" value="${escapeHtml(params.history.historyLimit)}" min="0" step="1">
                  <small class="field-help">These two options change the ${historyScope} for every notebook, not just this cell.</small>
                </div>
              </div>
              <div class="history-controls">
                <input type="text" id="historySearch" placeholder="Search history..." class="history-search-input" aria-label="Search history">
                <select id="historyFilter" class="history-filter-select" aria-label="Filter history by status">
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
                <button type="button" data-action="refresh-history" class="refresh-history-button" title="Refresh history" aria-label="Refresh history">
                  <span class="codicon codicon-refresh"></span>
                </button>
              </div>
              <div id="historyList" class="history-list">
                <p class="history-empty-message">Open this section to load the execution history.</p>
              </div>
            </div>
          </details>
        </div>

        <div class="form-group">
          <div class="list-container">
            <details>
              <summary>
                <span class="codicon codicon-code"></span>
                <span>In-cell commands (${params.cellCommands.length})</span>
              </summary>
              <p class="field-help">Commands written as comments in the cell. They override the options above for this run.</p>
              <div class="command-list">
                ${renderCommandList(params.cellCommands, false, 'This cell has no in-cell commands.')}
              </div>
              <p class="field-help">Other commands this cell accepts - copy one into the cell to use it:</p>
              <div class="command-list">
                ${renderCommandList(params.availableCommands, true, 'None.')}
              </div>
            </details>
          </div>
        </div>
      </div>`;
}

function renderFrontMatterSection(params: ModalRenderParams): string {
  return `
      <div class="notebook-config-section-wrapper">
        <div class="header notebook-header">
          <div class="header-left">
            <span class="codicon codicon-notebook"></span>
            <h1>Notebook Config</h1>
          </div>
        </div>
        <div class="content notebook-content">
          <details class="form-section notebook-config-section" ${params.cell ? '' : 'open'}>
            <summary>
              <span class="codicon codicon-edit"></span>
              <span>Front Matter Settings</span>
            </summary>
            <div class="notebook-config-content">
              <div class="form-group">
                <label for="frontMatter" class="label-text">YAML Front Matter</label>
                <textarea id="frontMatter" rows="6" spellcheck="false" placeholder="Enter YAML front matter content (without --- delimiters)&#10;Example:&#10;title: My notebook&#10;description: What this notebook is for">${escapeHtml(params.frontMatter)}</textarea>
                <small>Configure notebook metadata using YAML format. Do not include the --- delimiters.</small>
              </div>
              <div class="form-group">
                <button type="button" class="notebook-save-button" data-action="save-front-matter">Save Front Matter</button>
              </div>
              <button type="button" class="link-button help-link" data-action="open-docs" data-section="front-matter">
                <span class="codicon codicon-question"></span>
                <span>Learn more about Front Matter configuration</span>
              </button>
            </div>
          </details>
        </div>
      </div>`;
}

/** renderConfigModalHtml returns the full HTML document for the modal. */
export function renderConfigModalHtml(params: ModalRenderParams): string {
  const csp = [
    `default-src 'none'`,
    `style-src ${params.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net`,
    `font-src ${params.cspSource} https://cdn.jsdelivr.net`,
    `script-src 'nonce-${params.nonce}'`,
  ].join('; ');

  const pageData = {
    notebookUri: params.notebookUri ?? null,
    cell: params.cell ?? null,
    fields: params.fields,
  };

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Code Block Config</title>
      <style>
${modalStyles}
      </style>
    </head>
    <body>
      <div class="global-header">
        <button type="button" class="close-button" data-action="close" title="Close" aria-label="Close">×</button>
      </div>

      ${renderFrontMatterSection(params)}
      ${params.cell ? renderCellSection(params, params.cell) : ''}

      <div class="modal-actions">
        ${params.cell ? `
        <span id="dirtyStatus" class="dirty-status" aria-live="polite"></span>
        <button type="button" class="secondary-button" data-action="reset-all" title="Remove every override so this cell follows your settings">Reset all</button>
        <button type="button" data-action="save" id="saveButton">Save</button>` : ''}
        <button type="button" class="secondary-button" data-action="close">Close</button>
      </div>

      <script nonce="${escapeHtml(params.nonce)}">
${pageScript(pageData)}
      </script>
    </body>
    </html>`;
}

function pageScript(pageData: unknown): string {
  return `
        const vscode = acquireVsCodeApi();
        const page = ${safeJson(pageData)};
        const fields = page.fields;
        const fieldsById = new Map(fields.map(f => [f.id, f]));

        // --- per-cell overrides ------------------------------------------------

        // overrides holds the cell's own values; a field missing from it
        // follows its inherited value
        let overrides = {};
        fields.forEach(f => { if (f.cellValue !== undefined) { overrides[f.id] = f.cellValue; } });
        const savedOverrides = JSON.stringify(overrides);
        let dirty = false;

        function control(id) {
          return document.querySelector('[data-field="' + CSS.escape(id) + '"]:not(button)');
        }

        function effectiveValue(field) {
          return Object.prototype.hasOwnProperty.call(overrides, field.id) ? overrides[field.id] : field.inheritedValue;
        }

        function readControl(field, el) {
          if (field.type === 'boolean') { return el.checked; }
          if (field.type === 'number') { return el.value === '' ? field.inheritedValue : Number(el.value); }
          return el.value;
        }

        function writeControl(field, el, value) {
          if (field.type === 'boolean') {
            el.checked = value === true;
          } else {
            el.value = value === undefined || value === null ? '' : String(value);
          }
        }

        function sameValue(a, b) {
          return JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
        }

        function describeSource(field) {
          if (Object.prototype.hasOwnProperty.call(overrides, field.id)) {
            return 'Set for this cell';
          }
          return field.inheritedSource === 'setting' ? 'From your settings' : 'Default';
        }

        function renderField(field) {
          const el = control(field.id);
          if (el) { writeControl(field, el, effectiveValue(field)); }
          const source = document.querySelector('[data-source-for="' + CSS.escape(field.id) + '"]');
          const overridden = Object.prototype.hasOwnProperty.call(overrides, field.id);
          if (source) {
            source.textContent = describeSource(field);
            source.classList.toggle('overridden', overridden);
          }
          const reset = document.querySelector('[data-action="reset-field"][data-field="' + CSS.escape(field.id) + '"]');
          if (reset) { reset.hidden = !overridden; }
        }

        function updateVisibility() {
          document.querySelectorAll('[data-show-when]').forEach(row => {
            const other = fieldsById.get(row.getAttribute('data-show-when'));
            const show = other && String(effectiveValue(other)) === row.getAttribute('data-show-equals');
            row.hidden = !show;
          });
        }

        function updateDirty() {
          const nowDirty = JSON.stringify(overrides) !== savedOverrides;
          const status = document.getElementById('dirtyStatus');
          if (status) { status.textContent = nowDirty ? 'Unsaved changes' : ''; }
          if (nowDirty !== dirty) {
            dirty = nowDirty;
            vscode.postMessage({ command: 'dirtyChanged', dirty });
          }
        }

        function onFieldChanged(el) {
          const field = fieldsById.get(el.getAttribute('data-field'));
          if (!field) { return; }
          const value = readControl(field, el);
          // A value equal to the inherited one is not an override - the cell
          // keeps following the setting if the setting changes later
          if (sameValue(value, field.inheritedValue)) {
            delete overrides[field.id];
          } else {
            overrides[field.id] = value;
          }
          renderField(field);
          updateVisibility();
          updateDirty();
        }

        function resetField(id) {
          delete overrides[id];
          const field = fieldsById.get(id);
          if (field) { renderField(field); }
          updateVisibility();
          updateDirty();
        }

        fields.forEach(renderField);
        updateVisibility();

        document.addEventListener('change', event => {
          if (event.target.matches && event.target.matches('[data-field]:not(button)')) {
            onFieldChanged(event.target);
          }
        });
        document.addEventListener('input', event => {
          if (event.target.matches && event.target.matches('input[type="text"][data-field]')) {
            onFieldChanged(event.target);
          }
        });

        function save() {
          if (!page.cell) { return; }
          vscode.postMessage({
            command: 'saveConfig',
            notebookUri: page.notebookUri,
            cellUri: page.cell.uri,
            languageId: page.cell.languageId,
            overrides
          });
        }

        // --- execution history ---------------------------------------------------

        let currentHistory = [];

        function historyRequest(command, extra) {
          if (!page.cell) { return; }
          vscode.postMessage(Object.assign({ command, notebookUri: page.notebookUri, cellUri: page.cell.uri }, extra || {}));
        }

        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text === undefined || text === null ? '' : String(text);
          return div.innerHTML.replace(/"/g, '&quot;');
        }

        function updateHistoryCount(count) {
          const title = document.getElementById('historyTitle');
          if (title) { title.textContent = 'Execution History (' + count + ')'; }
        }

        function renderHistory(history) {
          currentHistory = history || [];
          updateHistoryCount(currentHistory.length);
          const list = document.getElementById('historyList');
          if (!list) { return; }
          if (currentHistory.length === 0) {
            list.innerHTML = '<p class="history-empty-message">No execution history found.</p>';
            return;
          }
          const search = document.getElementById('historySearch').value.toLowerCase();
          const status = document.getElementById('historyFilter').value;
          const filtered = currentHistory.filter(entry => {
            if (status !== 'all' && String(entry.status).toLowerCase() !== status) { return false; }
            if (search && !String(entry.code).toLowerCase().includes(search) && !String(entry.output).toLowerCase().includes(search)) { return false; }
            return true;
          });
          if (filtered.length === 0) {
            list.innerHTML = '<p class="history-empty-message">No matching history entries found.</p>';
            return;
          }
          list.innerHTML = filtered.map(entry => {
            const id = escapeHtml(entry.id);
            const statusClass = entry.status === 'success' ? 'success' : 'failure';
            return '<div class="history-entry ' + statusClass + '">' +
              '<div class="history-entry-header" data-entry-id="' + id + '" role="button" tabindex="0" aria-expanded="false">' +
                '<span class="history-entry-status ' + statusClass + '">' + (statusClass === 'success' ? 'Success' : 'Failure') + '</span>' +
                '<span class="history-entry-timestamp">' + escapeHtml(new Date(entry.timestamp).toLocaleString()) + '</span>' +
                '<span class="history-entry-duration">' + escapeHtml(entry.duration ? entry.duration + 'ms' : 'N/A') + '</span>' +
                '<button type="button" class="history-entry-delete-button" data-action="delete-history-entry" data-entry-id="' + id + '" title="Delete this history entry" aria-label="Delete this history entry"><span class="codicon codicon-trash"></span></button>' +
              '</div>' +
              '<div class="history-entry-details" data-details-for="' + id + '" hidden>' +
                '<div class="history-entry-section"><div class="history-section-header"><strong>Code:</strong>' +
                  '<button type="button" class="history-copy-button" data-action="copy-history" data-entry-id="' + id + '" data-type="code" title="Copy code" aria-label="Copy code"><span class="codicon codicon-copy"></span></button></div>' +
                  '<pre class="history-entry-code">' + escapeHtml(entry.code) + '</pre></div>' +
                '<div class="history-entry-section"><div class="history-section-header"><strong>Output:</strong>' +
                  '<button type="button" class="history-copy-button" data-action="copy-history" data-entry-id="' + id + '" data-type="output" title="Copy output" aria-label="Copy output"><span class="codicon codicon-copy"></span></button></div>' +
                  '<pre class="history-entry-output">' + escapeHtml(entry.output) + '</pre></div>' +
                (entry.exitCode !== undefined ? '<div class="history-entry-exit-code">Exit Code: ' + escapeHtml(entry.exitCode) + '</div>' : '') +
              '</div>' +
            '</div>';
          }).join('');
        }

        function toggleHistoryEntry(header) {
          const id = header.getAttribute('data-entry-id');
          const details = document.querySelector('[data-details-for="' + CSS.escape(id) + '"]');
          if (!details) { return; }
          details.hidden = !details.hidden;
          header.setAttribute('aria-expanded', String(!details.hidden));
        }

        // --- actions --------------------------------------------------------------

        const actions = {
          'close': () => vscode.postMessage({ command: 'close' }),
          'save': save,
          'discard': () => vscode.postMessage({ command: 'discardChanges' }),
          'reset-all': () => { Object.keys(overrides).forEach(resetField); },
          'reset-field': el => resetField(el.getAttribute('data-field')),
          'open-setting': el => vscode.postMessage({ command: 'openSpecificSetting', settingId: el.getAttribute('data-setting') }),
          'open-docs': el => vscode.postMessage({ command: 'openDocumentation', section: el.getAttribute('data-section') }),
          'open-settings': () => vscode.postMessage({ command: 'openSettings' }),
          'copy': el => vscode.postMessage({ command: 'copyToClipboard', text: el.getAttribute('data-text') }),
          'save-front-matter': () => vscode.postMessage({
            command: 'saveFrontMatter',
            notebookUri: page.notebookUri,
            frontMatter: document.getElementById('frontMatter').value
          }),
          'refresh-history': () => historyRequest('loadHistory'),
          'clear-history': (el, event) => { event.preventDefault(); historyRequest('clearHistory'); },
          'delete-history-entry': el => historyRequest('deleteHistoryEntry', { entryId: el.getAttribute('data-entry-id') }),
          'copy-history': el => {
            const entry = currentHistory.find(e => e.id === el.getAttribute('data-entry-id'));
            if (entry) {
              vscode.postMessage({ command: 'copyToClipboard', text: el.getAttribute('data-type') === 'code' ? entry.code : entry.output });
            }
          },
        };

        document.addEventListener('click', event => {
          const actionEl = event.target.closest('[data-action]');
          if (actionEl && actions[actionEl.getAttribute('data-action')]) {
            event.stopPropagation();
            actions[actionEl.getAttribute('data-action')](actionEl, event);
            return;
          }
          const header = event.target.closest('.history-entry-header');
          if (header) { toggleHistoryEntry(header); }
        });

        document.addEventListener('keydown', event => {
          const header = event.target.closest && event.target.closest('.history-entry-header');
          if (header && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggleHistoryEntry(header);
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 's' && page.cell) {
            event.preventDefault();
            save();
          }
        });

        const historySearch = document.getElementById('historySearch');
        if (historySearch) { historySearch.addEventListener('input', () => renderHistory(currentHistory)); }
        const historyFilter = document.getElementById('historyFilter');
        if (historyFilter) { historyFilter.addEventListener('change', () => renderHistory(currentHistory)); }
        const historyDetails = document.querySelector('.history-details');
        if (historyDetails) {
          historyDetails.addEventListener('toggle', () => {
            if (historyDetails.open) { historyRequest('loadHistory'); }
          });
        }
        const historyEnabled = document.getElementById('historyEnabled');
        if (historyEnabled) {
          historyEnabled.addEventListener('change', () => vscode.postMessage({
            command: 'updateWorkspaceSetting', key: 'executionHistory.enabled', value: historyEnabled.checked
          }));
        }
        const historyLimit = document.getElementById('historyLimit');
        if (historyLimit) {
          historyLimit.addEventListener('change', () => {
            const value = parseInt(historyLimit.value, 10);
            if (!isNaN(value) && value >= 0) {
              vscode.postMessage({ command: 'updateWorkspaceSetting', key: 'executionHistory.historyLimit', value });
            }
          });
        }

        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.command) {
            case 'historyLoaded':
              renderHistory(message.history);
              break;
            case 'historyCountLoaded':
              updateHistoryCount(message.count);
              break;
            case 'historyUpdated':
              if (historyDetails && historyDetails.open) {
                historyRequest('loadHistory');
              } else {
                historyRequest('loadHistoryCount');
              }
              break;
            case 'historyCleared':
              renderHistory([]);
              break;
            case 'pendingSelection': {
              const banner = document.getElementById('pendingBanner');
              if (banner) { banner.hidden = false; }
              break;
            }
          }
        });

        historyRequest('loadHistoryCount');
  `;
}

const modalStyles = `        @import url("https://cdn.jsdelivr.net/npm/vscode-codicons@0.0.17/dist/codicon.css");
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
        
        /* Execution History Styles */
        .execution-history-section {
          margin-top: 20px;
        }

        .history-config-controls {
          padding: 12px;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          margin-bottom: 12px;
        }

        .history-config-controls .form-group {
          margin-bottom: 12px;
        }

        .history-config-controls .form-group:last-child {
          margin-bottom: 0;
        }

        .history-config-controls input[type="number"] {
          width: 100%;
          padding: 6px;
        }

        .history-details summary {
          padding: 12px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border-radius: 3px;
          cursor: pointer;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .history-details summary:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .clear-history-button {
          padding: 4px 8px;
          margin-left: auto;
          margin-right: 8px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-button-border);
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.85em;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .clear-history-button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .history-content {
          padding: 15px;
          border: 1px solid var(--vscode-panel-border);
          border-top: none;
          border-radius: 0 0 3px 3px;
          background: var(--vscode-editor-background);
        }
        .history-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .history-search-input {
          flex-grow: 1;
          padding: 6px;
          border-radius: 3px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
        }
        .history-filter-select {
          padding: 6px;
          border-radius: 3px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
        }
        .refresh-history-button {
          padding: 6px 12px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-button-border);
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .refresh-history-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .history-list {
          max-height: 400px;
          overflow-y: auto;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 3px;
          background: var(--vscode-editor-background);
        }
        .history-entry {
          border-bottom: 1px solid var(--vscode-panel-border);
        }
        .history-entry:last-child {
          border-bottom: none;
        }
        .history-entry.success {
          border-left: 3px solid #4caf50;
        }
        .history-entry.failure {
          border-left: 3px solid #f44336;
        }
        .history-entry-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          cursor: pointer;
          transition: background 0.2s;
          position: relative;
        }
        .history-entry-header:hover {
          background: var(--vscode-list-hoverBackground);
        }
        .history-entry-status {
          font-weight: bold;
          font-size: 0.85em;
          flex: 0 0 auto;
        }
        .history-entry-status.success {
          color: #4caf50;
        }
        .history-entry-status.failure {
          color: #f44336;
        }
        .history-entry-timestamp {
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
          flex: 1 1 auto;
          text-align: center;
        }
        .history-entry-duration {
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
          flex: 0 0 auto;
          margin-right: 8px;
          transition: opacity 0.2s;
        }
        .history-entry-header:hover .history-entry-duration {
          opacity: 0;
        }
        .history-entry-delete-button {
          position: absolute;
          right: 12px;
          opacity: 0;
          padding: 4px 8px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-button-border);
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.85em;
          transition: opacity 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .history-entry-header:hover .history-entry-delete-button {
          opacity: 1;
        }
        .history-entry-delete-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .history-entry-details {
          padding: 0 12px 12px 12px;
          background: var(--vscode-editor-background);
        }
        .history-entry-section {
          margin-bottom: 12px;
          position: relative;
        }
        .history-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .history-section-header strong {
          display: inline;
          margin-bottom: 0;
          font-size: 0.9em;
        }
        .history-copy-button {
          opacity: 0;
          padding: 2px 6px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-button-border);
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.8em;
          transition: opacity 0.2s;
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .history-entry-section:hover .history-copy-button {
          opacity: 1;
        }
        .history-copy-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .history-entry-section strong {
          display: block;
          margin-bottom: 4px;
          font-size: 0.9em;
        }
        .history-entry-code {
          font-family: var(--vscode-editor-font-family);
          font-size: 0.9em;
          background: var(--vscode-textCodeBlock-background);
          padding: 8px;
          border-radius: 3px;
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 200px;
          overflow-y: auto;
          overflow-x: auto;
        }
        .history-entry-output {
          font-family: var(--vscode-editor-font-family);
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
          background: var(--vscode-textCodeBlock-background);
          padding: 8px;
          border-radius: 3px;
          margin: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          max-height: 200px;
          overflow-y: auto;
          overflow-x: auto;
        }
        .history-empty-message {
          padding: 20px;
          text-align: center;
          color: var(--vscode-descriptionForeground);
        }
        .history-entry-exit-code {
          margin-top: 8px;
          padding: 4px 8px;
          background: var(--vscode-inputValidation-errorBackground);
          border-left: 3px solid var(--vscode-inputValidation-errorBorder);
          font-size: 0.85em;
        }

        [hidden] {
          display: none !important;
        }
        .icon-button,
        .link-button {
          background: none;
          border: none;
          padding: 2px;
          margin: 0;
          color: inherit;
          font: inherit;
          cursor: pointer;
          width: auto;
        }
        .link-button {
          color: var(--vscode-textLink-foreground);
        }
        .link-button:hover,
        .icon-button:hover {
          color: var(--vscode-textLink-activeForeground);
        }
        .icon-button:focus-visible,
        .link-button:focus-visible,
        .history-entry-header:focus-visible {
          outline: 1px solid var(--vscode-focusBorder);
          outline-offset: 1px;
        }
        .help-links {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 16px;
          margin-bottom: 12px;
        }
        .help-links .help-link {
          margin-bottom: 0;
        }
        .intro {
          color: var(--vscode-descriptionForeground);
          margin: 0 0 8px 0;
        }
        .field-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
          font-size: 0.85em;
        }
        .field-source {
          color: var(--vscode-descriptionForeground);
        }
        .field-source.overridden {
          color: var(--vscode-textLink-foreground);
          font-weight: 600;
        }
        .field-help {
          display: block;
          color: var(--vscode-descriptionForeground);
          margin-top: 2px;
        }
        .banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px;
          margin-bottom: 12px;
          border: 1px solid var(--vscode-inputValidation-warningBorder);
          background: var(--vscode-inputValidation-warningBackground);
        }
        .banner button {
          width: auto;
        }
        .secondary-button {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        .secondary-button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .dirty-status {
          margin-right: auto;
          color: var(--vscode-descriptionForeground);
          font-style: italic;
        }
        code.command-name {
          font-family: var(--vscode-editor-font-family);
        }`;
