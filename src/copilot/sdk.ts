/**
 * Internal shim isolating the @github/copilot-sdk surface our adapter relies on.
 *
 * SDK version inspected: @github/copilot-sdk@0.3.0
 *
 * If the SDK API shifts in a future release, only this file changes.
 * All adapter code in src/copilot/ imports from "./sdk.js" — never directly
 * from "@github/copilot-sdk".
 *
 * ## SDK Surface Summary (as of 0.3.0)
 *
 * ### CopilotClient
 * - Constructor: `new CopilotClient(options?: CopilotClientOptions)`
 * - Key options: `cliPath`, `cliUrl`, `useStdio`, `gitHubToken`, `useLoggedInUser`,
 *   `autoStart`, `logLevel`, `cwd`, `env`, `onListModels`, `telemetry`
 * - `start(): Promise<void>` — explicit connect (if autoStart:false)
 * - `stop(): Promise<Error[]>` — graceful shutdown, returns errors if any
 * - `forceStop(): Promise<void>` — hard kill
 * - `createSession(config: SessionConfig): Promise<CopilotSession>`
 * - `resumeSession(sessionId: string, config: ResumeSessionConfig): Promise<CopilotSession>`
 * - `listSessions(filter?: SessionListFilter): Promise<SessionMetadata[]>`
 * - `getSessionMetadata(sessionId: string): Promise<SessionMetadata | undefined>`
 * - `getLastSessionId(): Promise<string | undefined>`
 * - `deleteSession(sessionId: string): Promise<void>`
 * - `listModels(): Promise<ModelInfo[]>`
 * - `getState(): ConnectionState` — "disconnected"|"connecting"|"connected"|"error"
 * - `getStatus(): Promise<GetStatusResponse>`
 * - `getAuthStatus(): Promise<GetAuthStatusResponse>`
 * - `on(eventType, handler): () => void` — typed lifecycle subscription
 * - `on(handler): () => void` — all-events lifecycle subscription
 *
 * ### CopilotSession
 * - `sessionId: string` (readonly)
 * - `workspacePath: string | undefined`
 * - `capabilities: SessionCapabilities`
 * - `ui: SessionUiApi`
 * - `send(options: MessageOptions): Promise<string>` — returns messageId
 * - `sendAndWait(options: MessageOptions, timeout?: number): Promise<AssistantMessageEvent | undefined>`
 * - `abort(): Promise<void>` — cancels in-flight turn (NO AbortController)
 * - `disconnect(): Promise<void>` — release in-memory resources, preserve disk state
 * - `getMessages(): Promise<SessionEvent[]>`
 * - `setModel(model: string, options?): Promise<void>`
 * - `log(message: string, options?): Promise<void>`
 * - `on<K>(eventType: K, handler): () => void` — typed session event subscription
 * - `on(handler): () => void` — all-events session subscription
 * - `[Symbol.asyncDispose]()` — supports `await using`
 *
 * ### Event Mechanism
 * `.on(handler)` returns an unsubscribe `() => void`. NOT Node EventEmitter.
 * Session events are a discriminated union on `.type` (SessionEvent).
 * Key types: "assistant.message", "assistant.message_delta",
 * "assistant.streaming_delta", "session.idle", "session.error",
 * "tool.execution_start", "tool.execution_complete", "session.start",
 * "user.message", and ~60 more (see generated/session-events.d.ts).
 *
 * ### Cancellation
 * `session.abort()` — plain async RPC, no AbortController / AbortSignal.
 *
 * ### Permission Handler
 * `(request: PermissionRequest, invocation: { sessionId: string }) => Promise<PermissionRequestResult> | PermissionRequestResult`
 * Convenience: `approveAll` is exported (auto-approves everything).
 *
 * ### BYOK / Custom Provider
 * `SessionConfig.provider?: ProviderConfig` — fields: `baseUrl`, `apiKey`,
 * `bearerToken`, `type` ("openai"|"azure"|"anthropic"), `wireApi`, `headers`.
 * Per-session GitHub identity: `SessionConfig.gitHubToken`.
 * Process-level GitHub token: `CopilotClientOptions.gitHubToken`.
 *
 * ### Error Types
 * No typed error classes exported. SDK throws plain `Error` instances.
 *
 * ### AssistantMessageEvent
 * Extracted type: `Extract<SessionEvent, { type: "assistant.message" }>`.
 * Exported directly from session.js as `AssistantMessageEvent`.
 */

import {
  CopilotClient as GhCopilotClient,
  CopilotSession as GhCopilotSession,
  approveAll as ghApproveAll,
} from "@github/copilot-sdk";
import type { SessionConfig as GhSessionConfig } from "@github/copilot-sdk";

/**
 * Configuration for session lifecycle hooks. Forwarded straight to the SDK
 * via `SessionConfig.hooks`. Derived from the SDK's own `SessionConfig` type
 * because `@github/copilot-sdk` 0.3.0 declares `SessionHooks` internally
 * but does not re-export the symbol from its barrel (it leaks transitively
 * through `SessionConfig.hooks`).
 *
 * Shape (per SDK 0.3.0): { onPreToolUse?, onPostToolUse?,
 * onUserPromptSubmitted?, onSessionStart?, onSessionEnd?, onErrorOccurred? }
 */
export type SessionHooks = NonNullable<GhSessionConfig["hooks"]>;

/**
 * User-input request types. The SDK 0.3.0 declares `UserInputRequest`,
 * `UserInputResponse`, and `UserInputHandler` in `types.d.ts` but does not
 * re-export them through its public barrel (`index.d.ts`). They leak
 * transitively via `SessionConfig.onUserInputRequest`, so we derive them
 * from that handler signature using the same indirection pattern as
 * `SessionHooks`.
 */
export type UserInputHandler = NonNullable<GhSessionConfig["onUserInputRequest"]>;
export type UserInputRequest = Parameters<UserInputHandler>[0];
export type UserInputResponse = Awaited<ReturnType<UserInputHandler>>;

export type {
  // Core types
  CopilotClientOptions,
  SessionConfig,
  ResumeSessionConfig,

  // Session event types
  SessionEvent,
  SessionEventType,
  SessionEventHandler,
  TypedSessionEventHandler,
  SessionEventPayload,
  AssistantMessageEvent,

  // Session lifecycle (client-level)
  SessionLifecycleEvent,
  SessionLifecycleEventType,
  SessionLifecycleHandler,
  TypedSessionLifecycleHandler,

  // Session metadata & filtering
  SessionMetadata,
  SessionListFilter,
  SessionCapabilities,

  // Auth & status
  ConnectionState,
  GetStatusResponse,
  GetAuthStatusResponse,

  // Model info
  ModelInfo,
  ModelCapabilities,
  ModelCapabilitiesOverride,
  ModelPolicy,
  ModelBilling,

  // Messaging
  MessageOptions,

  // Permissions
  PermissionHandler,
  PermissionRequest,
  PermissionRequestResult,

  // Elicitation (directly re-exported from SDK index)
  ElicitationContext,
  ElicitationResult,
  ElicitationHandler,

  // BYOK / provider
  ProviderConfig,

  // MCP server configuration (forwarded to SessionConfig.mcpServers)
  MCPServerConfig,
  MCPStdioServerConfig,
  MCPHTTPServerConfig,

  // Tools
  Tool,
  ToolHandler,
  ToolInvocation,
  ToolResultObject,

  // Telemetry / tracing
  TelemetryConfig,
  TraceContext,
  TraceContextProvider,
} from "@github/copilot-sdk";

// Re-export concrete values under our own names so adapters are
// insulated from the upstream package name.
export { GhCopilotClient, GhCopilotSession, ghApproveAll as approveAll };

// Convenience type aliases used throughout the adapter layer.
export type GhSession = GhCopilotSession;
export type GhClient = GhCopilotClient;

/**
 * Plan-mode RPC types. The SDK 0.3.0 declares `PlanReadResult` and
 * `PlanUpdateRequest` in `generated/rpc.d.ts` but does not re-export them
 * through its public barrel (`index.d.ts`). They leak transitively via
 * `CopilotSession.rpc.plan`, so we derive them from that surface using the
 * same indirection pattern as `SessionHooks` / `UserInputHandler`.
 */
type _SessionRpc = GhCopilotSession["rpc"];
export type PlanReadResult = Awaited<ReturnType<_SessionRpc["plan"]["read"]>>;
export type PlanUpdateRequest = Parameters<_SessionRpc["plan"]["update"]>[0];
