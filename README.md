# @baoduy2412/ai-cli-client

Node.js client for controlling Claude Code and GitHub Copilot CLIs from your application.

## Install

```bash
npm install @baoduy2412/ai-cli-client
```

## Requirements

- Node.js 18+
- For Claude: `claude` CLI installed and authenticated (`claude login`)
- For Copilot: handled automatically via `@github/copilot-sdk` (bundled). Authenticate once with `copilot login` or set `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`.

## Common API

Both `ClaudeClient` and `CopilotClient` share a consistent surface. `client.send(prompt)` returns a `TurnHandle` with a `.updates()` async iterator for streamed progress and a `.done` Promise that resolves to the final snapshot. Both clients are also event emitters — use `.on(event, handler)` for lower-level protocol events. `client.getHistory()` returns completed turn snapshots for the session. Provider-specific extensions (e.g. `getOpenRequests()` on Claude) are documented in the per-provider sections below.

## Claude

`ClaudeClient.init(config)` starts a persistent stream-json process and returns a fully-started client. All structured methods live directly on the returned instance.

```ts
import { ClaudeClient } from '@baoduy2412/ai-cli-client';

const client = await ClaudeClient.init({
  cwd: process.cwd(),
  includePartialMessages: true,
  permissionPromptTool: true,
});

const turn = client.send('Summarize this project in one paragraph.');

for await (const update of turn.updates()) {
  if (update.kind === 'output' && update.snapshot.currentOutputKind === 'text') {
    process.stdout.write(`\r${update.snapshot.text}`);
  }

  for (const request of update.snapshot.openRequests) {
    if (request.status !== 'open') continue;

    if (request.kind === 'question') {
      await client.answerQuestion(request.id, ['yes']);
    } else if (request.kind === 'tool_approval') {
      await client.approveRequest(request.id, { message: 'Approved.' });
    }
  }
}

const finalSnapshot = await turn.done;
console.log('\nDone:', finalSnapshot.result?.subtype);
client.close();
```

Methods on `ClaudeClient`:

- `send(input, options?)` — returns a live `TurnHandle`
- `getHistory()` — completed turn snapshots
- `getOpenRequests()` — unresolved question, tool approval, hook, or MCP requests
- `approveRequest(id, decision?)` — allow a tool or hook request
- `denyRequest(id, reason?)` — deny a tool or hook request
- `answerQuestion(id, answers)` — answer an `AskUserQuestion` request
- `createQuestionSession(id)` — step through multi-question prompts incrementally, then `submit()`
- `interruptTurn(turnId?)` — interrupt the active turn
- `setPermissionMode(mode)`, `setModel(model)`, `setMaxThinkingTokens(tokens)`
- `close()`

> **Stream mode vs Print mode:** By default `ClaudeClient` uses a persistent stream-json process (stream mode). Pass `printMode: true` in the config to spawn a new process per message instead (lower memory, higher spawn overhead). See [Mode Comparison](#mode-comparison-claude-only) below.

## Copilot

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client/copilot';

async function main() {
  const client = new CopilotClient({ cwd: process.cwd() });
  await client.start();
  console.log('Session:', client.sessionId);

  await client.sendMessage('Summarize this project in one sentence.');

  const [latest] = client.getHistory().slice(-1);
  console.log('Reply:', latest.text);

  await client.close();
}

main().catch(err => { console.error(err); process.exit(1); });
```

> **Note:** Copilot support wraps the official [`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk), which is in **public preview**. Some `CopilotClientConfig` fields are not yet honored by the SDK and will throw `CopilotFeatureUnsupportedError` at `start()` — currently: `mode`, `maxAutopilotContinues`, `availableTools`, `excludedTools`, `allowAllTools`, `allowAllPaths`, `allowAllUrls`, `noAskUser`, `sessionName`. Tracked for re-enabling as the SDK matures.

### Permission DSL

`allowTools` and `denyTools` accept `Kind(arg)` patterns:

| Pattern | Meaning |
|---|---|
| `shell(git:*)` | All git subcommands |
| `read(.env)` | Read a specific file |
| `write(src/*.ts)` | Write TypeScript files under `src/` |
| `url(github.com)` | Outbound requests to a domain |
| `MyMCP(create_issue)` | A specific MCP tool action |

Deny rules take precedence over allow rules. List narrow denies alongside broader allows to prevent unintended operations (e.g. allow `shell(git:*)`, deny `shell(git push)`).

### BYOK

Pass `apiKey: { provider, key }` to route requests through your own account. Supported providers: `anthropic`, `openai`, `azure`.

```ts
const client = new CopilotClient({
  cwd: process.cwd(),
  apiKey: { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY },
  model: 'claude-sonnet-4.5',
});
```

## Provider Parity

| Capability | Claude | Copilot |
|---|---|---|
| Persistent process | Yes (stream-json) | Yes (SDK JSON-RPC) |
| Streaming events | Yes | Yes |
| Multi-turn sessions | Yes | Yes |
| Mid-turn tool approval | Yes (`getOpenRequests` / `approveRequest`) | No — declarative permissions upfront |
| Permission mode enum | `permissionMode: default \| acceptEdits \| auto \| plan \| dontAsk \| bypassPermissions` | `mode: interactive \| plan \| autopilot` (deferred until SDK supports passthrough) |
| Reasoning controls | `--max-thinking-tokens`, `thinking.level` | `--effort`, `--enable-reasoning-summaries` (deferred) |
| BYOK | No | Yes (Anthropic / OpenAI / Azure) |
| Multi-vendor models | Anthropic only | gpt-5.x, claude-sonnet-4.5, etc. |
| Worktree / tmux | Yes | No |
| Transcript sharing | No | (deferred to Phase 2) |
| Hooks (wire-level) | Yes | (deferred) |
| Structured output (`--json-schema`) | Yes | No |

## Examples

See [`examples/`](./examples) for working scripts:

### Claude
- `examples/basic.ts` — `ClaudeClient.init` quickstart
- `examples/events.ts` — raw event-driven streaming
- `examples/error-handling.ts` — error propagation patterns
- `examples/print-mode.ts` — print mode quickstart
- `examples/print-mode-session.ts` — print mode with custom session ID
- `examples/structured-requests.ts` — handling AskUserQuestion + tool approvals

### Copilot
- `examples/copilot/basic.ts` — start a session, send a message, read history
- `examples/copilot/streaming.ts` — async iterator over `turn.updates()`
- `examples/copilot/permissions.ts` — fine-grained `allowTools` / `denyTools`
- `examples/copilot/byok.ts` — BYOK with `apiKey`

## Mode Comparison (Claude only)

| Feature | Stream Mode | Print Mode |
|---|---|---|
| Process lifecycle | Persistent | Spawn per message |
| Session persistence | In-memory | Disk-based via `--resume` |
| Memory usage | Higher | Lower (process exits) |
| Latency | Lower | Higher (spawn overhead) |
| Best for | Long-running sessions | Short queries, serverless |

## Troubleshooting

- **(Claude)** If `ready` never fires, verify your `claude` binary path with `which claude` and run `claude login` to re-authenticate.
- **(Copilot)** If `start()` fails with an auth error, set `COPILOT_GITHUB_TOKEN` or run `copilot login` first.
- **(Both)** Enable `debug: true` and provide a `debugLogger` callback to inspect protocol events in detail.
- **(Copilot)** `CopilotFeatureUnsupportedError` at startup means a config field is not yet supported by the SDK preview — see the note in the Copilot section above.

## Versioning

This package uses independent semver releases.

## License

ISC — see [LICENSE](./LICENSE).
