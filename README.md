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

Both `ClaudeClient` and `CopilotClient` share a consistent surface. `client.send(input)` returns a `TurnHandle` with a `.updates()` async iterator for streamed progress and a `.done` Promise that resolves to the final snapshot. `input` accepts a plain `string`, a `{ text }` wrapper, or `{ content: ContentBlock[] }` for rich content (multi-block, images on supported providers). Both clients are also event emitters — use `.on(event, handler)` for streaming protocol events. `client.getHistory()` returns completed turn snapshots for the session as unified `TurnSnapshot[]`. Provider-specific extensions (e.g. `getOpenRequests()` on Claude) are documented in the per-provider sections below.

### Unified events

Both providers emit the same shared event vocabulary:

| Event | Payload | Purpose |
| --- | --- | --- |
| `ready` | `()` | Session initialized |
| `text` | `(chunk: string)` | Streaming text delta |
| `text_done` | `(text: string)` | Final accumulated text for the turn (fires once if any text was emitted) |
| `reasoning` | `(chunk: string)` | Streaming reasoning/thinking delta |
| `reasoning_done` | `(text: string)` | Final reasoning, same semantics as `text_done` |
| `tool_use_start` | `(event)` | Tool invocation begun |
| `tool_result` | `(event)` | Tool execution result received |
| `usage_update` | `(usage)` | `{ inputTokens, outputTokens }` snapshot |
| `status_change` | `(status)` | `'idle' | 'running' | 'error'` |
| `result` | `(snapshot)` | Final `TurnSnapshot` for the turn |
| `error` | `(err)` | Provider error |
| `closed` | `(exitCode)` | Session closed; terminal — no events fire after this |

Provider-specific events (Claude's `stream_event`, `control_request`, `mcp_message`, etc.) remain on the concrete classes for narrowed access.

### Feature detection via `capabilities`

Some methods are available only on certain providers. Use the runtime `capabilities` map for feature detection, or rely on TypeScript optional chaining:

```ts
if (client.capabilities.setModel) {
  await client.setModel!('claude-opus-4-7');
}
// or
await client.setModel?.('claude-opus-4-7');
```

`capabilities.richContent` is `true` when `send()` accepts non-text content blocks. On Copilot, `richContent` is `false`; image content blocks throw `UnsupportedContentError` synchronously.

For provider-specific access (Claude-only methods), narrow via the `provider` discriminant:

```ts
if (client.provider === 'claude') {
  await client.approveRequest(id, { always: true });
}
```

## Unified API

If you want provider-agnostic code, target the `AICliClient` interface and construct clients via the `createAICliClient` factory.

```ts
import {
  createAICliClient,
  type AICliClient,
  type AICliClientConfig,
} from '@baoduy2412/ai-cli-client';

const config: AICliClientConfig = {
  provider: 'claude', // or 'copilot'
  cwd: process.cwd(),
};

const client: AICliClient = await createAICliClient(config);

await client.sendMessage('Hello.');
await client.close();
```

The `AICliClient` interface only declares the surface both providers support identically. Provider-specific methods (Claude's `approveRequest`, `answerQuestion`, etc.) are on the concrete classes — see [`docs/provider-capabilities.md`](./docs/provider-capabilities.md) for the full divergence matrix.

**Auto-start trade-off.** `createAICliClient(config)` returns a *started* client. If you need to attach event listeners *before* startup events fire (e.g. Copilot's `ready` event), construct the concrete class directly:

```ts
import { CopilotClient } from '@baoduy2412/ai-cli-client';
const client = new CopilotClient({ cwd: process.cwd() });
client.on('ready', () => console.log('ready'));
await client.start();
```

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

## PTY Transport

For daemon-layer use cases (typically an Electron main process), spawn
the underlying CLI in a real OS-level pseudo-terminal and forward raw
bytes to a renderer of your choice. The library does not render — that's
the consumer's job (xterm.js, custom TUI, anything).

```ts
import { createPtyClient } from '@baoduy2412/ai-cli-client';

const pty = await createPtyClient({
  provider: 'claude',         // or 'copilot'
  cwd: process.cwd(),
  cols: 120, rows: 30,
});

pty.on('data', bytes => process.stdout.write(bytes));
process.stdin.on('data', chunk => pty.write(chunk));
process.stdout.on('resize', () => pty.resize(process.stdout.columns!, process.stdout.rows!));
```

PTY mode requires `node-pty` as an **optional peer dependency**:

```bash
npm install node-pty
```

For Electron, rebuild against your Electron version:
`npx @electron/rebuild`.

See [`docs/pty-transport.md`](./docs/pty-transport.md) for the full
guide, the [Electron IPC pattern](./examples/pty/electron-main.ts), and
configuration / troubleshooting tables.

## Experimental APIs

Phase 1.3 (`v1.3.0`) added 10 namespace wrappers on `CopilotClient`
that map to `@github/copilot-sdk`'s `session.rpc.*` surface. Five
of them are `@experimental` upstream and may change shape in minor
SDK releases:

- `client.skills.{list, enable, disable, reload}`
- `client.agent.{list, getCurrent, select, deselect, reload}`
- `client.history.{compact, truncate}`
- `client.usage.getMetrics`
- `client.mcp.{list, enable, disable, reload}` (and nested `mcp.oauth.login`)

If your CLI version doesn't recognize an experimental method, the
wrapper throws `CopilotExperimentalUnavailableError` with the namespace
and method names — caller code can branch on this to provide graceful
fallbacks.

Stable namespaces (`plan`, `shell`, `workspaces`, `name`, `instructions`)
are pure passthroughs and follow the SDK's stable contract.

See [`docs/provider-capabilities.md`](docs/provider-capabilities.md) for the full method list.

## Versioning

This package uses independent semver releases.

## License

ISC — see [LICENSE](./LICENSE).
