# Git and Version Control

- Use git for version control

## Commit Messages

- Max char limit message line: 72
  - Max char limit message body: 68 per line, no limit on number of lines
- Use the following format: <type>(<scope>): <subject>
- Type: feat, fix, docs, style, refactor, test, chore
- Scope: the scope of the change 
  - src, languages, bash, go, python, etc.
  - test, types
  - webview (specificaly configModal, documentationView, etc.)
  - config

### Types Detail
- feat: A new feature
- fix: A bug fix
- docs: Documentation changes
- style: Changes that don't affect the meaning of the code (white-space, formatting, tabs vs spaces, etc)
- refactor: A code change that neither fixes a bug nor adds a feature
- perf: A code change that improves performance
- test: Adding or updating tests
- build: Changes that affect the build system or external dependencies
- ci: Changes to our CI configuration files and scripts
- tooling: Changes to the build process or auxiliary tools and libraries such as documentation generation
