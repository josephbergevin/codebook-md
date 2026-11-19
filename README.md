<div style="padding-bottom: 10px;">
<img src="extension/src/img/logo_3_800x800.png" alt="Codebook MD Logo" width="256" height="256" />
</div>

# CodebookMD — Runnable Markdown Notebooks

**Run the code in your markdown.** CodebookMD opens any `.md` file — a README,
a runbook, onboarding notes, an API scratchpad — as a Jupyter-style notebook in
VS Code. Every fenced code block gets a ▶ button; output lands right under the
block. The file stays plain markdown, so it still renders on GitHub and diffs
cleanly in review.

<img src="extension/src/img/demo.gif" alt="Running Go, Python and shell code blocks in a markdown notebook" width="900" />

## Why CodebookMD

- **Go is a first-class citizen.** Run a Go block as a standalone `main.go`, or
  _inside your package_ as a `_test.go` file with access to its unexported code.
- **Your whole backend workflow in one doc.** Shell, Go, Python, JavaScript,
  TypeScript, SQL (through `psql`, `mysql`, `mycli`, …) and HTTP requests — no
  extra extensions required.
- **Find the right doc fast.** The _My Notebooks_ sidebar shows the markdown
  files relevant to whatever you're editing, plus virtual folders you can commit
  and share with your team.
- **Configure a cell from inside the cell.** A comment like
  `# [>].execPath("./scratch")` changes how that one block runs.
- **Ask about your notebook.** `@codebook` in VS Code chat, plus _Start Chat
  with Cell / Section / Notebook_ to hand context straight to the assistant.
- **Runs locally.** Code executes on your machine with your own toolchain and
  environment variables — no cloud service or account required.

## Quick start

1. Install CodebookMD.
2. Right-click any `.md` file in the Explorer → **Open With...** →
   **codebook-md** (or run **New CodebookMD Notebook** from the Command Palette).
3. Press ▶ on a code block:

```shellscript
   echo "Hello from $(uname -s)"
```

```http
   GET https://jsonplaceholder.typicode.com/todos/1
```

**Already have a markdown file open in the text editor?** Look for **Open as
CodebookMD Notebook** at the top of the file and **▶ Run in CodebookMD** above
each runnable code block. Run opens the file as a notebook, scrolls to that
block and runs it. Hide these links with `codebook-md.codeLens.enabled: false`.

**Switching back and forth.** The first button in the editor's title bar
(top right) flips between the two views in the same tab: a notebook icon in
the text editor, a text icon in the notebook. The notebook's toolbar also has
a **Text** button, and *CodebookMD: Toggle Text / Notebook View* in the
Command Palette does the same from either side - bind it to a key in Keyboard
Shortcuts if you switch often.

**Want every markdown file to open as a CodebookMD notebook?** Add this to your settings:

```jsonc
"workbench.editorAssociations": {
  "*.md": "codebook-md"
}
```

> CodebookMD registers as an _optional_ editor for `.md` rather than the
> default, so it doesn't collide with other markdown-notebook extensions (VS Code
> allows only one default notebook type per file). The association above opts
> you in; note it routes markdown away from other notebook/preview extensions.

## Supported languages

| Language   | Fence                        | How it runs                                                   |
| ---------- | ---------------------------- | ------------------------------------------------------------- |
| Go         | `go`, `golang`               | As a `main.go`, or as a `_test.go` inside a package           |
| Shell      | `bash`, `sh`, `zsh`, `shell` | As a `.sh` script                                             |
| Python     | `python`, `py`               | As a `.py` file with your configured interpreter              |
| JavaScript | `javascript`, `js`           | As a `.js` file with Node                                     |
| TypeScript | `typescript`, `ts`           | As a `.ts` file with `ts-node`                                |
| SQL        | `sql`, `mysql`, `postgres`   | Through a CLI client you choose (`psql`, `mysql`, `mycli`, …) |
| HTTP       | `http`                       | Converted to a `curl` command                                 |

SQL and HTTP blocks can also be run through a SQL extension that provides
CodeLens actions, or through the REST Client extension.

## Feature reference

### Notebook Organization in Activity Bar

The Codebook MD extension provides a tree view in the activity bar for organizing your markdown files. This allows you to configure dynamically generated notebooks, as well as create virtual folders, to help organize your markdown files for quick and easy access.

#### Dynamically Generated Folders in My Notebooks View

Codebook MD provides a "My Notebooks" view and dynamically creates folders based on the currently focused file. This allows you to have easy access to relevant markdown files!

- **Dynamic Folder Group**: Automatically generates a folder based on the currently focused file
- **Virtual Folders**: Create custom folder hierarchies to organize your markdown files
- **Custom Display Names**: Rename files and folders with descriptive names without changing the actual files
- **Hierarchical Structure**: Create nested folders for organized categorization
- **Quick Access**: Access your important markdown documents with one click

##### Dynamic Folder Group Configuration

You can customize the dynamic folder group through VS Code settings (`settings.json`):

```json
{
  "codebook-md.dynamicFolderGroup.enabled": true,
  "codebook-md.dynamicFolderGroup.name": "Relevant Docs",
  "codebook-md.dynamicFolderGroup.description": "Relevant docs for the current file",
  "codebook-md.dynamicFolderGroup.subFolderInclusions": [
    ".github",
    ".vscode"
  ],
  "codebook-md.dynamicFolderGroup.exclusions": [
    "node_modules",
    "out",
    "dist"
  ],
  "codebook-md.dynamicFolderGroup.includeAgentDocs": true,
  "codebook-md.dynamicFolderGroup.placeRulesByScope": true,
  "codebook-md.dynamicFolderGroup.startCollapsed": false,
  "codebook-md.dynamicFolderGroup.icon": "",
  "codebook-md.dynamicFolderGroup.position": 0,
  "codebook-md.dynamicFolderGroup.hiddenDocTypes": []
}
```

**Configuration Options:**

- `enabled`: Enable or disable the dynamic folder group (default: `true`)
- `name`: Custom name for the dynamic folder group (default: `Current Context`)
- `description`: Description shown when hovering over the folder group (default: `Auto-generated based on the current file`)
- `subFolderInclusions`: Sub-folders to include when searching for markdown files (default: `[]`). A plain name such as `.github` is matched at every level. An entry with a slash or a wildcard is a pattern, read relative to each folder in the group: `tooling/**` adds `tooling` and everything below it, `docs/guides` adds exactly that folder.
- `exclusions`: Patterns to exclude from the search (default: `["node_modules", "out", "dist"]`)
- `includeAgentDocs`: Find agent docs in their standard locations without listing those folders in `subFolderInclusions` (default: `true`)
- `placeRulesByScope`: Show a rule that is scoped to a folder under that folder, instead of where the rule file is kept (default: `true`). See [Scoped Rules](#scoped-rules).
- `startCollapsed`: Start the group collapsed (default: `false`). Opening or closing it by hand is remembered until this setting changes.
- `icon`: A codicon name shown beside the group's name, such as `target` or `rocket` (default: empty, for the built-in icon)
- `position`: How many of your own folder groups are listed before this one (default: `0`, which puts it first)
- `hiddenDocTypes`: Kinds of document to leave out (default: `[]`). One or more of `readme`, `changelog`, `license`, `policy`, `instructions`, `rule`, `skill`, `prompt`, `agent`, `notebook`, `markdown`. For example, `["skill"]` shows the group without skills.

You do not have to edit these by hand: see [Side Bar Settings](#side-bar-settings).

The dynamic folder group will only show folders that contain markdown files after applying exclusions, providing a clean and focused view of relevant documentation.

##### Agent Docs

The dynamic folder group finds the markdown files written for coding agents and groups them by type under the folder that holds them:

| Group | What it lists |
| --- | --- |
| **Skills** | `SKILL.md` under `.agents/skills`, `.agent/skills`, `.claude/skills` and `.github/skills` |
| **Rules** | `.github/instructions/*.instructions.md`, and the rule folders of Claude Code, Windsurf, Kiro, Continue and Cline |
| **Prompts** | `.github/prompts/*.prompt.md`, `.claude/commands`, `.agent/workflows` |
| **Agent Definitions** | `.claude/agents`, `.github/agents/*.agent.md`, `.github/chatmodes/*.chatmode.md` |
| **Agent References** | Any other markdown under `.agents`, `.agent` or `.claude` |

`AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` are listed next to the folder's own markdown files.

- **Skills are shown by name.** Every skill file is called `SKILL.md`, so the row uses the `name` from the file's front matter, written as a title (`docker-cleanup` becomes "Docker Cleanup"), or the skill's folder name when there is none. Hover the row for the exact name, the description and the path.
- **A skill with supporting files expands.** When a skill's folder holds other files - more markdown, scripts, templates - the skill is a folder: click its name to open `SKILL.md`, click the row to list the rest. Markdown opens as a notebook; other files open in their usual editor. Up to 50 non-markdown files are listed per skill.
- **Symlinked files appear once.** When `CLAUDE.md` is a link to `AGENTS.md`, the row shows `AGENTS.md` and names the other path beside it.

##### Scoped Rules

Some rule files only apply to part of a repository, and say so in their front matter:

```markdown
---
applyTo: "extractor/**"
---
```

CodebookMD reads that scope and shows the rule where it applies. With a file under `extractor/` open, this rule is listed under the **Extractor** folder in Related Docs, and no longer under **Rules** at the repository root.

- **Keys that are read:** `applyTo` (GitHub Copilot), `paths` (Claude Code), `globs` (Cursor, Continue, Windsurf) and `fileMatchPattern` (Kiro). A value can be a list, or one string with patterns separated by commas.
- **Which folder:** the part of the pattern before its first wildcard. `extractor/**/*.go` is about `extractor`. Patterns are read relative to the folder that holds the rule folder: for `.github/instructions/go.instructions.md`, that is the repository root.
- **Several patterns:** a rule that names several folders is shown under each one that is in the tree.
- **When a rule stays put:** a rule for a folder that is not in the tree, or for the whole repository (`**/*.ts`), stays under **Rules**.
- **Scope chip:** a scoped rule shows its first pattern beside its name, and all of them in the hover text along with where the file is kept.
- **Applies mark:** a green dot marks a rule whose pattern matches the open file itself. A rule for `extractor/**/*.go` is listed under Extractor while you edit a markdown file there, but is not marked.

Turn `placeRulesByScope` off to leave every rule where its file is kept. The chip and the mark are shown either way.

##### Document Icons

Markdown files in My Notebooks get an icon for what they are: README, changelog, license, project policies (`CONTRIBUTING.md`, `SECURITY.md`), agent instructions, scoped rules, skills, prompts, agent definitions, and runnable notebooks (any markdown file with a code block CodebookMD can run). Icon colors come from your VS Code theme. Hovering a file shows the `description` from its front matter.

The row of the file open in the editor is highlighted, in your own folder groups and in Related Docs. A collapsed skill opens to show it.

#### AI Docs View

The **AI Docs** view lists every agent doc in the workspace in one place, grouped by type: Instructions, Rules, Skills, Prompts, Agent Definitions and Agent References. It appears in the CodebookMD side bar, between My Notebooks and Documentation, whenever the workspace has agent docs. Related Docs shows what is around the file you have open; AI Docs shows everything.

- **Finds docs at any depth.** Instruction files such as `AGENTS.md` are found in every folder, and each tool's folders (`.agents`, `.claude`, `.github` and the rest) are read wherever a project has them, so a monorepo's packages are covered.
- **Tells same-named files apart.** Each instruction file shows the folder it is for beside its name, such as "workspace root" or `src/webview`.
- **Marks what applies to the open file.** A green dot marks the docs an agent would load for the file you are editing: instruction files in its folder or above it, rules whose scope matches it, and rules with no scope.
- **Shows context cost.** Hovering an instruction file or rule shows its size and a token estimate, such as "6.3 KB, about 1,600 tokens". The estimate is the file size divided by four, so treat it as a rough guide.
- **Filter box.** Type to narrow the list by name or description. Escape clears it.
- **Keyboard.** Arrow keys move between rows and open or close folders, Enter opens a doc, Home and End jump to the ends.
- **Your own docs.** The docs in your home folder (`~/.claude/CLAUDE.md`, `~/.claude/skills` and similar) are listed in a **User** group. Only those tool folders are read, never the rest of your home folder, and nothing leaves your machine.
- **Several workspace folders.** Each folder is a group of its own.

```json
{
  "codebook-md.aiDocs.enabled": true,
  "codebook-md.aiDocs.includeUserDocs": true,
  "codebook-md.aiDocs.exclusions": ["node_modules", "out", "dist"],
  "codebook-md.aiDocs.hiddenDocTypes": []
}
```

`hiddenDocTypes` leaves groups out of the view: one or more of `instructions`, `rule`, `skill`, `prompt`, `agent`, `reference`.

##### Health Checks

An agent doc with a problem gets a warning mark, in AI Docs and in Related Docs. Hover the row for the reason. Nothing is blocked; these are things an agent would trip over quietly.

| Check | What it catches |
| --- | --- |
| Missing name or description | A skill whose front matter lacks either. Agents choose skills by these two fields. |
| Name differs from folder | A skill whose `name` is not the name of its folder. |
| Description too long | A skill description over 1,024 characters. |
| Front matter never closes | A missing second `---`, which hides the whole block from every tool. |
| Broken link | A relative link to a file that does not exist. Web links are not checked. |
| Scope matches nothing | An `applyTo`, `paths`, `globs` or `fileMatchPattern` value that names a missing folder or matches no files. |
| Copied skill | The same skill name in two skills folders. Both copies are shown, and each says where the other is. Symlinks are one file and are not flagged. |

##### New Skill

**Codebook: New Skill** (the **+** button on the AI Docs view, or the Command Palette) asks for a name and a description, creates `<name>/SKILL.md` with its front matter filled in, and opens it. The skill goes in the skills folder the workspace already uses. If there are several you choose one, and if there is none `.agents/skills` is created.

#### Side Bar Settings

Everything about the side bar can be set from the side bar itself. Changes apply as you make them, so the side bar next to you is the preview.

**The drawer.** Each group in My Notebooks has a gear in its header. It opens a few options right under the header, without leaving the side bar:

- On the generated group: find agent docs, place scoped rules at their folder, start collapsed, and the list of folders to look inside.
- On a folder group you built: its name and description, start collapsed, and **Hide group**.
- **All settings** opens the full panel on that group.

**The panel.** **Codebook: Side Bar Settings** (the gear button on the My Notebooks and AI Docs views, or the Command Palette) opens an editor tab with every group and view in one list, and the options of the selected one beside it.

- **Reorder** the groups by dragging them, or with Alt+Up and Alt+Down. The generated group can sit anywhere among your own.
- **Show or hide** a group or the AI Docs view with the eye on its row. A hidden group stays in the list, so this is also where you bring one back.
- **Per group:** name, description, icon, start collapsed. The generated group and the AI Docs view also let you choose which doc types they show, for example Related Docs without skills.
- **Workspace or User.** Options of the generated group and the AI Docs view are VS Code settings. The switch at the top chooses where a change is saved. Each option says where its current value comes from (workspace setting, user setting or default) and can be reset. The gear beside an option opens it in the Settings UI.
- **Folder groups you build** are saved in `.vscode/codebook-md.json`, which has one level, so they have no Workspace/User switch.

**Keyboard in My Notebooks.** The tree works from the keyboard the way AI Docs does: Up and Down move between rows, Right and Left open and close a folder or group, Enter opens a file, Home and End jump to the ends. Tab from a row reaches its buttons. On a skill that lists supporting files, Enter opens the skill and Space shows or hides the list.

#### User-Defined Virtual Folders

The Codebook MD extension allows you to create user-defined virtual folders in the activity bar. This feature enables you to organize your markdown files into a hierarchical structure, making it easier to navigate and access your documentation.

- **Version Control Integration**: The configuration file can be committed to your repository, allowing team sharing of notebook organization
- **Workspace-Specific**: Each workspace has its own configuration file, allowing for project-specific organization
- **Manual Editing**: Advanced users can directly edit the configuration file for bulk changes

##### Configuration File

The configuration for user-defined virtual folders is stored in a JSON file located at `.vscode/codebook-md.json` in your workspace. This file contains the structure and organization of your virtual folders, including their names, descriptions, and the markdown files they contain. All changes made through the Tree View UI are automatically saved to this file.

- Folders:
  - `name`: Display name for the folder
  - `folderPath`: Hierarchical path (using dots as separators)
  - `icon`: Optional path to a custom icon for the folder
  - `hide`: Optional boolean to hide a folder in the UI
  - `files`: Array of file entries in this folder

- Folder groups (the top-level entries in `folderGroups`) also take:
  - `icon`: A codicon name shown beside the group's name, such as `rocket`
  - `hide`: Hide the whole group
  - `collapsed`: Start the group collapsed
  - The order of the entries is the order of the groups. [Side Bar Settings](#side-bar-settings) changes all of these for you.

- Files:
  - `name`: Display name for the file
  - `path`: Path to the markdown file (absolute or relative to workspace root)

- Config Tips:
  - Use descriptive display names to make your documents easier to find
  - Create a logical folder hierarchy based on your projects or document types
  - Regularly refresh the Tree View if you make changes to files outside VS Code
  - Configure dynamic folder groups to focus on relevant documentation folders and exclude noise
  - Use the `subFolderInclusions` setting to include specific sub-folders like `.github` for documentation

- Example configuration format:

```json
{
  "folderGroups": [
    {
      "name": "Workspace",
      "description": "Workspace folder group",
      "folders": [
        {
          "name": "Projects",
          "folders": [
            {
              "name": "SubProject1",
              "files": [
                {
                  "name": "Overview",
                  "path": "projects/subproject1/overview.md"
                }
              ]
            }
          ],
          "files": [
            {
              "name": "Project Plan",
              "path": "projects/project-plan.md"
            }
          ]
        },
        {
          "name": "Documentation",
          "folders": [
            {
              "name": "Guides",
              "files": [
                {
                  "name": "Getting Started",
                  "path": "docs/guides/getting-started.md"
                }
              ]
            }
          ],
          "files": [
            {
              "name": "Readme",
              "path": "docs/readme.md"
            }
          ]
        }
      ]
    }
  ]
}
```

### Environment Variables Support

Shell scripts executed in CodebookMD now have access to environment variables set in VS Code settings:

- Automatically detects and uses variables from `terminal.integrated.env.*` settings
- Platform-specific support for macOS, Windows, and Linux
- VS Code environment variables take precedence over system environment variables
- Secure storage of credentials and configuration without hardcoding in markdown files
- Configure environment variables in your VS Code settings:

```json
{
  "terminal.integrated.env.osx": {
    "API_KEY": "your-api-key",
    "DATABASE_URL": "postgres://user:password@localhost:5432/mydb",
    "PATH": "${env:PATH}:/custom/path"
  }
}
```

### Codebook Prompts

Codebook Prompts allow you to create interactive code blocks that request user input before execution:

- **Interactive Input**: Prompt for user input when running code blocks
- **Multiple Input Types**: Support for String and Date input types
- **Descriptive Placeholders**: Custom placeholder text for clear user instructions
- **Format Options**: Date formatting options for output flexibility

### Chat Participant Integration

CodebookMD now includes an integrated AI chat assistant accessible through VS Code's chat interface:

- **Interactive Assistant**: Get help with notebook management, code execution, and configuration
- **Easy Access**: Invoke with `@codebook` in VS Code chat
- **Context-Aware**: Intelligent responses based on your specific questions
- **Follow-up Suggestions**: Get relevant next steps and related topics
- **Comprehensive Help**: Covers creating notebooks, executing code, and configuring settings
- **Rich Formatting**: Responses include markdown formatting for better readability

#### Using the Chat Participant

To use the CodebookMD chat assistant:

1. Open VS Code chat (View → Chat or `Ctrl+Alt+I`)
2. Type `@codebook` followed by your question
3. Examples:
   - `@codebook how do I create a notebook?`
   - `@codebook help with executing code blocks`
   - `@codebook configure my settings`
   - `@codebook what can you do?`

The chat assistant provides instant help and guidance for all CodebookMD features, making it easier to get started and discover new functionality.

### Where a cell runs

Every code cell runs in a directory, shown on the left of the cell's status bar,
below the code. By default that is the `codebook-md.execPath` setting
(`./codebook-md/`, resolved next to the markdown file).

Click that path — or the gear (⚙) on the right — to set an **Execution path** for one cell.
A relative path is taken from your workspace folder, so `scripts/db` means the
same thing on every machine; an absolute path is used as-is. Buttons under the
field fill in the workspace folder or the folder holding the markdown file, and
clearing the field goes back to following the setting.

### Persistent shell sessions

By default each shell cell runs in a fresh process, so a `cd` or `export` in one
cell is gone by the next. Turn on a persistent session and shell cells run in
one long-lived shell per notebook instead — like typing into a terminal:

```jsonc
"codebook-md.bash.persistentSession": true
```

- The working directory, exported and plain variables, functions and aliases all
  carry over between cells.
- Turn it on for a single cell instead from that cell's configuration.
- Like a terminal, a failing command doesn't stop the rest of the cell, and the
  cell reports the exit code of its last command. Chain with `&&` to stop at the
  first failure; don't use `set -e`, which would end the session.
- Stopping a cell interrupts the running command and keeps the session. Run
  **CodebookMD: Restart Shell Session** to start over with a fresh shell.

### Custom Settings

Support for workspace, user, and folder-level configurations

### Enhanced Configuration UI

Click the gear (⚙) in the status bar below a code cell to set how that one cell
runs and shows its output.

- Every option shows where its value comes from: **Default**, **From your
  settings**, or **Set for this cell**. The gear next to it opens the matching
  VS Code setting.
- Only the options you change are saved for the cell, so everything else keeps
  following your settings when you change them later. **Reset to inherited**
  clears one option, **Reset all** clears them all.
- Cell settings and execution history are stored next to the notebook in
  `<notebook>.md.config.json`, and follow the cell when cells are added, removed
  or moved — your markdown files are never modified.

### Execution History

CodebookMD automatically tracks the execution history of your code blocks, providing a detailed record of each execution's results:

- **Automatic Tracking**: Every code block execution is automatically recorded with timestamp, code, output, and status
- **Persistent Storage**: Execution history is stored in your notebook's configuration file (`.md.config.json`)
- **Search and Filter**: Quickly find past executions using content search and status filters (Success/Failure)
- **Detailed Results**: View complete execution details including exit codes, error messages, and full output
- **Configurable Limits**: Control how many history entries to keep per cell (default: 10 entries)
- **Easy Management**: Clear history for individual cells or the entire notebook

#### Configuration Options

- `codebook-md.executionHistory.enabled`: Enable or disable execution history tracking (default: `true`)
- `codebook-md.executionHistory.historyLimit`: Maximum number of execution history entries to retain per cell (default: `10`, set to `0` for unlimited)

#### Accessing Execution History

1. Open the configuration modal for any code block (click the gear icon)
2. Navigate to the "Execution History" section
3. Use the search box to filter by code or output content
4. Use the status dropdown to filter by Success or Failure
5. Click on any entry to expand and view full details
6. Use "Clear History" to remove history for the current cell

Execution history helps you track changes over time, debug issues, and maintain a record of your code experiments and testing.

### File Link Hover

File links detected in markdown code blocks can be hovered over to view the contents of the file.

- **Line Numbers:** If a line number is specified, the file will be previewed at that line.
- **Line Range:** If a line range is specified, the file will be previewed from the start line to the end line.

### HTTP Requests Support

Execute HTTP requests directly from markdown files:

- **Native Support:** No additional extensions required
- **Full Request Support:** Headers, authentication, request bodies and more
- **Comment Support:** Use `#` for comments
- **Syntax Highlighting:** Proper highlighting for HTTP requests
- **Configuration Options:** Configure default settings for HTTP requests

### Output Configuration

Output from executed code blocks can be configured in the following ways:

- Below the code block
- In the output panel at the bottom of the editor (coming soon)
- In a new tab (coming soon)
- In a file location specified in the settings (coming soon)

### Configuring a cell from inside the cell

Any code block can be configured in place with a `[>]` command, written as a
comment in the cell's own language (`#` for shell/python/http, `//` for
go/js/ts, `--` for sql). These take precedence over both the language settings
and anything saved through the configuration modal.

```shellscript
# [>].output.showTimestamp(false)
# [>].output.timestampTimezone("America/Denver")
# [>].execPath("./scratch")
echo "hello"
```

| Command                                              | Effect                                          |
| ---------------------------------------------------- | ----------------------------------------------- |
| `[>].output.showExecutableCodeInOutput(true\|false)` | Print the cell's code above its output          |
| `[>].output.replaceOutputCell(true\|false)`          | Replace the output on each run, or append to it |
| `[>].output.showTimestamp(true\|false)`              | Prepend a timestamp to the output               |
| `[>].output.timestampTimezone("UTC")`                | Timezone for that timestamp                     |
| `[>].execPath("./dir")`                              | Directory the cell executes from                |

Go cells also accept `[>].execTypeRunFilename("main.go")`,
`[>].execTypeTestFilename("codebook_md_exec_test.go")`,
`[>].execTypeTestBuildTag("playground")`, `[>].goimportsCmd("goimports")`, and
`[>].excludeOutputPrefixes(["DEBUG"])`.

Settings resolve from least to most specific: global settings
(`codebook-md.output.*`) → language settings (`codebook-md.go.output.*`) → the
cell configuration saved by the modal → the `[>]` commands in the cell. Any
layer can turn a setting on _or_ off.

The full list for the current cell is available in the configuration modal —
click the gear icon in the status bar below the code block. Unrecognised
commands produce a warning rather than being ignored.

#### Examples of HTTP requests:

```http
# Simple GET request example
GET https://jsonplaceholder.typicode.com/todos/1
```

```http
# POST request with JSON body
# [>].output.showTimestamp(true)
POST https://jsonplaceholder.typicode.com/posts
Content-Type: application/json
Accept: application/json

{
  "title": "Test Post",
  "body": "This is a test post created from CodebookMD",
  "userId": 1
}
```

### Markdown cells that look like the Markdown Preview

Markdown cells in a CodebookMD notebook are styled to match VS Code's
Markdown Preview, so a file looks familiar whichever way you open it:

- **Task lists** - `- [ ] todo` and `- [x] done` render as checkboxes.
  Click one (or focus it and press Space) to check or uncheck it; the
  change is written to the markdown source, ready to save
- **Tables** - horizontal rules between rows and a shaded background on
  every other row
- **Headings** - bold, with a rule under `#` and `##` headings
- **Code blocks** inside markdown - a copy button in the corner
- **Front matter** (with `codebook-md.frontMatter.showInNotebook` on) - a
  key/value table, like the preview; front matter that doesn't fit a table,
  such as nested values, is shown as YAML

Colors come from your VS Code theme, so light, dark and high-contrast themes
all work. Because VS Code shares one markdown renderer across notebook types,
the styles also apply to markdown cells in other notebooks (such as Jupyter
`.ipynb`) while CodebookMD is installed.

To go back to VS Code's plainer notebook styling, turn off
`codebook-md.markdown.previewStyling` (default `true`). The change applies to
open notebooks right away. Task list checkboxes are shown either way.

### Math, diagrams and other markdown extensions

Markdown cells are drawn by VS Code's notebook markdown renderer, so an
extension's markdown features show up in CodebookMD notebooks when that
extension ships a **notebook renderer** - not just Markdown Preview styles or
plugins. VS Code's built-in Markdown Math and Mermaid support both do, so
these work out of the box:

**Math Equations:**

$$E = mc^2$$

**Mermaid Diagrams:**

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

Extensions that only contribute `markdown.previewStyles`,
`markdown.previewScripts` or `markdown.markdownItPlugins` change the Markdown
Preview but not notebooks.

## Release Notes

All notable changes to Codebook MD are documented in our [CHANGELOG](CHANGELOG.md). We follow [Semantic Versioning](https://semver.org/) and structure our changelog according to [Keep a Changelog](https://keepachangelog.com/).

## Issues & Feature Requests

If you encounter any issues or have feature requests, please open an issue on our [GitHub repository](https://github.com/josephbergevin/codebook-md/issues).
If CodebookMD saves you time, a [rating on the Marketplace](https://marketplace.visualstudio.com/items?itemName=josephbergevin.codebook-md&ssr=false#review-details) helps other developers find it.

## Inspiration

This extension was inspired by the Jupyter notebook, which allows for the execution of Python code blocks in a notebook environment. The goal of this extension is to bring that functionality to markdown files in VS Code, with the ability to interact with local files from within the markdown file itself.