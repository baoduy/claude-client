
I'll fetch those three documents and compile the Copilot CLI commands for you.Got the first one. Now the plugin reference.Now the programmatic reference.Here's the consolidated list of all GitHub Copilot CLI commands across the three reference documents.

## 1. Top-level command-line commands (terminal)

These are commands you run in your shell, starting with `copilot`.

|Command|Purpose|
|---|---|
|`copilot`|Launch the interactive user interface|
|`copilot help [topic]`|Display help information. Help topics include: `config`, `commands`, `environment`, `logging`, and `permissions`|
|`copilot init`|Initialize Copilot custom instructions for this repository|
|`copilot update`|Download and install the latest version|
|`copilot version`|Display version information and check for updates|
|`copilot login`|Authenticate with Copilot via the OAuth device flow. Accepts `--host HOST` to specify the GitHub host URL (default: `https://github.com`)|
|`copilot logout`|Sign out of GitHub and remove stored credentials|
|`copilot plugin`|Manage plugins and plugin marketplaces|

## 2. Plugin subcommands (`copilot plugin ...`)

|Command|Description|
|---|---|
|`copilot plugin install SPECIFICATION`|Install a plugin|
|`copilot plugin uninstall NAME`|Remove a plugin|
|`copilot plugin list`|List installed plugins|
|`copilot plugin update NAME`|Update a plugin|
|`copilot plugin marketplace add SPECIFICATION`|Register a marketplace|
|`copilot plugin marketplace list`|List registered marketplaces|
|`copilot plugin marketplace browse NAME`|Browse marketplace plugins|
|`copilot plugin marketplace remove NAME`|Unregister a marketplace|

Plugin install accepts these specification formats: marketplace (`plugin@marketplace`), GitHub repo (`OWNER/REPO`), GitHub subdir (`OWNER/REPO:PATH/TO/PLUGIN`), Git URL, or local path.

## 3. Slash commands (inside the interactive UI)

|Command|Purpose|
|---|---|
|`/add-dir PATH`|Add a directory to the allowed list for file access|
|`/agent`|Browse and select from available agents|
|`/allow-all`, `/yolo`|Enable all permissions (tools, paths, and URLs)|
|`/clear`, `/new`|Clear the conversation history|
|`/compact`|Summarize the conversation history to reduce context window usage|
|`/context`|Show the context window token usage and visualization|
|`/cwd`, `/cd [PATH]`|Change the working directory or display the current directory|
|`/delegate [PROMPT]`|Delegate changes to a remote repository with an AI-generated pull request|
|`/diff`|Review the changes made in the current directory|
|`/exit`, `/quit`|Exit the CLI|
|`/experimental [on\|off]`|Toggle or turn on/off experimental features|
|`/feedback`|Provide feedback about the CLI|
|`/fleet [PROMPT]`|Enable parallel subagent execution of parts of a task|
|`/help`|Show the help for interactive commands|
|`/ide`|Connect to an IDE workspace|
|`/init`|Initialize Copilot custom instructions and agentic features for this repository|
|`/list-dirs`|Display all of the directories for which file access has been allowed|
|`/login`|Log in to Copilot|
|`/logout`|Log out of Copilot|
|`/lsp [show\|test\|reload\|help] [SERVER-NAME]`|Manage the language server configuration|
|`/mcp [show\|add\|edit\|delete\|disable\|enable] [SERVER-NAME]`|Manage the MCP server configuration|
|`/model`, `/models [MODEL]`|Select the AI model you want to use|
|`/plan [PROMPT]`|Create an implementation plan before coding|
|`/plugin [marketplace\|install\|uninstall\|update\|list] [ARGS...]`|Manage plugins and plugin marketplaces|
|`/rename NAME`|Rename the current session (alias for `/session rename`)|
|`/reset-allowed-tools`|Reset the list of allowed tools|
|`/resume [SESSION-ID]`|Switch to a different session by choosing from a list (optionally specify a session ID)|
|`/review [PROMPT]`|Run the code review agent to analyze changes|
|`/session [checkpoints [n]\|files\|plan\|rename NAME]`|Show session information and a workspace summary|
|`/share [file\|gist] [PATH]`|Share the session to a Markdown file or GitHub gist|
|`/skills [list\|info\|add\|remove\|reload] [ARGS...]`|Manage skills for enhanced capabilities|
|`/terminal-setup`|Configure the terminal for multiline input support|
|`/theme [show\|set\|list] [auto\|THEME-ID]`|View or configure the terminal theme|
|`/usage`|Display session usage metrics and statistics|
|`/user [show\|list\|switch]`|Manage the current GitHub user|

## 4. Programmatic / non-interactive flags

The programmatic reference highlights these as the most useful flags when running `copilot` from scripts, CI, or one-shot prompts: `-p PROMPT`, `-s`, `--add-dir`, `--agent`, `--allow-all` (or `--yolo`), `--allow-all-paths`, `--allow-all-tools`, `--allow-all-urls`, `--allow-tool`, `--allow-url`, `--deny-tool`, `--model`, `--no-ask-user`, `--secret-env-vars`, `--share`, and `--share-gist`.

A typical non-interactive invocation looks like:

```bash
copilot -p "Fix the race condition in the worker pool" \
  --model gpt-5.3-codex \
  --allow-tool='write, shell'
```

---

A few notes worth flagging:

- **Inside the UI, you can run any of the slash commands above.** Outside the UI, the actual binary only has the eight top-level commands in section 1 plus the eight `plugin` subcommands in section 2 — everything else is flags or slash commands.
- **`copilot help` in your terminal** is the canonical source for the full, current flag list — the docs explicitly defer to it for things like the up-to-date `--model` model strings.
- The docs use "command" loosely — slash commands are technically inputs to the running interactive session, not separate executables. I've grouped them so the distinction is clear.

Want me to put this in a downloadable Markdown cheat-sheet file?