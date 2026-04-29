import type { TurnHandleBase } from './turn-handle.js';
import type {
  AICliCapabilities,
  PermissionMode,
  SendInput,
  SupportedModelsResponse,
  TurnSnapshot,
  UnifiedEventMap,
  UnifiedStatus,
} from './unified/index.js';

/**
 * Provider-agnostic client interface. Both ClaudeClient and CopilotClient
 * implement this surface. Required members are everything portable across
 * providers; optional members (Group E) are present only on providers that
 * support the corresponding capability — check `client.capabilities` at
 * runtime, or use `?.` invocation in TypeScript.
 *
 * Provider-specific surfaces (Claude's interactive approval, low-level
 * MCP wire-protocol primitives) live on the concrete classes only. Narrow
 * via the `provider` discriminant for typed access:
 *
 * ```ts
 * if (client.provider === 'claude') {
 *   await client.sendMcpMessage(server, msg);
 * }
 * ```
 *
 * See `docs/provider-capabilities.md` for the full divergence matrix.
 */
export interface AICliClient {
  // ─── Identity ──────────────────────────────────────────────────────────────

  /** Runtime discriminator. Mirrors the `provider` field in AICliClientConfig. */
  readonly provider: 'claude' | 'copilot';

  /** Current session id, or null if not yet established. */
  readonly sessionId: string | null;

  /** Capability map for runtime feature detection. */
  readonly capabilities: AICliCapabilities;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): Promise<void>;
  close(): Promise<void>;

  // ─── Send / queue (rich content) ───────────────────────────────────────────

  /**
   * Send input and return a `TurnHandleBase` for the resulting turn.
   *
   * The handle type parameters are intentionally `unknown` at this level —
   * concrete providers return their richer handle types. Consumers wanting
   * a unified-shape snapshot should use `getCurrentTurn()`/`getHistory()`
   * which always return `TurnSnapshot`.
   */
  send(input: SendInput): TurnHandleBase<unknown, unknown>;
  sendMessage(input: SendInput): Promise<void>;
  queueMessage(input: SendInput): void;
  interrupt(): Promise<void>;

  // ─── Introspection ─────────────────────────────────────────────────────────

  getStatus(): UnifiedStatus;
  isProcessing(): boolean;
  getCurrentTurn(): TurnSnapshot | null;
  getHistory(): TurnSnapshot[];

  // ─── Events (strongly typed over the unified vocabulary) ──────────────────

  on<E extends keyof UnifiedEventMap>(
    event: E,
    listener: (...args: UnifiedEventMap[E]) => void,
  ): this;
  off<E extends keyof UnifiedEventMap>(
    event: E,
    listener: (...args: UnifiedEventMap[E]) => void,
  ): this;

  // ─── Optional capabilities (Group E) ──────────────────────────────────────
  // Implementations may omit these methods; presence corresponds 1:1 to the
  // matching `capabilities` flag. ClaudeClient implements all four;
  // CopilotClient implements none.

  setModel?(model: string): Promise<void>;
  setPermissionMode?(mode: PermissionMode): Promise<void>;
  setMaxThinkingTokens?(tokens: number): Promise<void>;
  listSupportedModels?(timeout?: number): Promise<SupportedModelsResponse>;
}
