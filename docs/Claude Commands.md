I'll search for the CLI flags and options documentation.Let me check the CLI reference page directly:Perfect! Here's a comprehensive table of CLI commands and flags:

## CLI Commands

| Command | Parameters | Description | Example |
|---------|-----------|-------------|---------|
| `claude` | `[query]` | Start interactive session | `claude` or `claude "explain this project"` |
| `claude` | `"query"` | Start with initial prompt | `claude "explain this function"` |
| `claude -p` | `"query"` | Query via SDK, then exit (non-interactive) | `claude -p "explain this function"` |
| `claude -c` | — | Continue most recent conversation | `claude -c` |
| `claude -c -p` | `"query"` | Continue via SDK | `claude -c -p "Check for type errors"` |
| `claude -r` | `"<session>" "query"` | Resume session by ID or name | `claude -r "auth-refactor" "Finish this PR"` |
| `claude update` | — | Update to latest version | `claude update` |
| `claude auth login` | `[--email] [--sso] [--console]` | Sign in to account | `claude auth login --console` |
| `claude auth logout` | — | Sign out | `claude auth logout` |
| `claude auth status` | `[--text]` | Show auth status | `claude auth status` |
| `claude agents` | — | List configured subagents | `claude agents` |
| `claude auto-mode defaults` | — | Print auto mode rules | `claude auto-mode defaults > rules.json` |
| `claude mcp` | — | Configure MCP servers | See MCP docs |
| `claude plugin` | `[subcommand]` | Manage plugins | `claude plugin install code-review@claude-plugins-official` |
| `claude remote-control` | `[--name]` | Start Remote Control server | `claude remote-control --name "My Project"` |
| `claude setup-token` | — | Generate OAuth token | `claude setup-token` |

## CLI Flags

| Flag | Parameters | Description | Example |
|------|-----------|-------------|---------|
| `-p, --print` | — | Non-interactive mode (SDK) | `claude -p "query"` |
| `-c, --continue` | — | Continue recent conversation | `claude -c` |
| `-r, --resume` | `<session>` | Resume by ID or name | `claude -r "auth-refactor"` |
| `-n, --name` | `<name>` | Set session display name | `claude -n "my-feature-work"` |
| `-w, --worktree` | `<name>` | Create isolated git worktree | `claude -w feature-auth` |
| `--session-id` | `<uuid>` | Use specific session ID | `claude --session-id "550e8400-e29b-41d4-a716-446655440000"` |
| `--model` | `<model>` | Set AI model | `claude --model claude-sonnet-4-6` |
| `--effort` | `low\|medium\|high\|xhigh\|max` | Set effort level | `claude --effort high` |
| `--add-dir` | `<path> [<path>...]` | Add working directories | `claude --add-dir ../apps ../lib` |
| `--agent` | `<agent>` | Specify agent | `claude --agent my-custom-agent` |
| `--agents` | `<json>` | Define custom subagents | `claude --agents '{"reviewer":{"description":"Reviews code"}}'` |
| `--permission-mode` | `default\|acceptEdits\|plan\|auto\|dontAsk\|bypassPermissions` | Set permission mode | `claude --permission-mode plan` |
| `--dangerously-skip-permissions` | — | Skip permission prompts | `claude --dangerously-skip-permissions` |
| `--allow-dangerously-skip-permissions` | — | Add bypassPermissions to mode cycle | `claude --permission-mode plan --allow-dangerously-skip-permissions` |
| `--allowedTools` | `<tools>` | Tools that execute without prompting | `claude --allowedTools "Bash(git log *)" "Read"` |
| `--disallowedTools` | `<tools>` | Tools to remove from context | `claude --disallowedTools "Bash(git log *)" "Edit"` |
| `--tools` | `<tools>` | Restrict available tools | `claude --tools "Bash,Edit,Read"` |
| `--system-prompt` | `<text>` | Replace system prompt | `claude --system-prompt "You are a Python expert"` |
| `--system-prompt-file` | `<path>` | Load system prompt from file | `claude --system-prompt-file ./custom-prompt.txt` |
| `--append-system-prompt` | `<text>` | Append to system prompt | `claude --append-system-prompt "Always use TypeScript"` |
| `--append-system-prompt-file` | `<path>` | Append file to system prompt | `claude --append-system-prompt-file ./extra-rules.txt` |
| `--exclude-dynamic-system-prompt-sections` | — | Move per-machine sections to first message | `claude -p --exclude-dynamic-system-prompt-sections "query"` |
| `--output-format` | `text\|json\|stream-json` | Set output format | `claude -p "query" --output-format json` |
| `--input-format` | `text\|stream-json` | Set input format | `claude -p --input-format stream-json` |
| `--include-partial-messages` | — | Include streaming events | `claude -p --output-format stream-json --include-partial-messages "query"` |
| `--include-hook-events` | — | Include hook lifecycle events | `claude -p --output-format stream-json --include-hook-events "query"` |
| `--replay-user-messages` | — | Re-emit user messages on stdout | `claude -p --input-format stream-json --output-format stream-json --replay-user-messages` |
| `--json-schema` | `<schema>` | Get validated JSON output | `claude -p --json-schema '{"type":"object",...}' "query"` |
| `--max-turns` | `<number>` | Limit agentic turns | `claude -p --max-turns 3 "query"` |
| `--max-budget-usd` | `<amount>` | Max spend before stopping | `claude -p --max-budget-usd 5.00 "query"` |
| `--fallback-model` | `<model>` | Fallback when overloaded | `claude -p --fallback-model sonnet "query"` |
| `--no-session-persistence` | — | Don't save sessions | `claude -p --no-session-persistence "query"` |
| `--fork-session` | — | Create new ID when resuming | `claude --resume abc123 --fork-session` |
| `--from-pr` | `<number\|url>` | Resume sessions from PR | `claude --from-pr 123` |
| `--remote` | `<description>` | Create web session | `claude --remote "Fix the login bug"` |
| `--remote-control, --rc` | `[name]` | Enable Remote Control | `claude --remote-control "My Project"` |
| `--remote-control-session-name-prefix` | `<prefix>` | Prefix for auto-generated names | `claude remote-control --remote-control-session-name-prefix dev-box` |
| `--teleport` | — | Resume web session in terminal | `claude --teleport` |
| `--ide` | — | Auto-connect to IDE | `claude --ide` |
| `--chrome` | — | Enable Chrome integration | `claude --chrome` |
| `--no-chrome` | — | Disable Chrome integration | `claude --no-chrome` |
| `--channels` | `<channels>` | MCP channels to listen for | `claude --channels plugin:my-notifier@my-marketplace` |
| `--mcp-config` | `<files\|json>` | Load MCP servers | `claude --mcp-config ./mcp.json` |
| `--strict-mcp-config` | — | Only use specified MCP config | `claude --strict-mcp-config --mcp-config ./mcp.json` |
| `--dangerously-load-development-channels` | `<channels>` | Load unapproved channels | `claude --dangerously-load-development-channels server:webhook` |
| `--plugin-dir` | `<path>` | Load plugins from directory | `claude --plugin-dir ./my-plugins` |
| `--bare` | — | Minimal mode (skip auto-discovery) | `claude --bare -p "query"` |
| `--init` | — | Run init hooks and start | `claude --init` |
| `--init-only` | — | Run init hooks and exit | `claude --init-only` |
| `--maintenance` | — | Run maintenance hooks | `claude --maintenance` |
| `--disable-slash-commands` | — | Disable skills and commands | `claude --disable-slash-commands` |
| `--settings` | `<file\|json>` | Load settings | `claude --settings ./settings.json` |
| `--setting-sources` | `user,project,local` | Which settings to load | `claude --setting-sources user,project` |
| `--teammate-mode` | `auto\|in-process\|tmux` | Display mode for teammates | `claude --teammate-mode in-process` |
| `--tmux` | `[classic]` | Create tmux session | `claude -w feature-auth --tmux` |
| `--debug` | `[categories]` | Enable debug mode | `claude --debug "api,mcp"` |
| `--debug-file` | `<path>` | Write debug logs to file | `claude --debug-file /tmp/claude-debug.log` |
| `--verbose` | — | Enable verbose logging | `claude --verbose` |
| `-v, --version` | — | Show version | `claude -v` |
| `--help` | — | Show help | `claude --help` |
| `--betas` | `<headers>` | Beta API headers | `claude --betas interleaved-thinking` |
| `--permission-prompt-tool` | `<tool>` | MCP tool for permission prompts | `claude -p --permission-prompt-tool mcp_auth_tool "query"` |

For more details, see the [CLI reference](/en/cli-reference).