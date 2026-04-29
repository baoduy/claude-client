import type { TurnHandleBase } from './turn-handle.js';

/**
 * Provider-agnostic client interface. Both ClaudeClient and CopilotClient
 * implement this surface. Members listed here are the lowest common
 * denominator both providers support identically.
 *
 * Provider-specific methods (Claude's structured permission API, etc.) live
 * on the concrete classes only — see docs/provider-capabilities.md.
 *
 * Events are intentionally loose-typed at the interface level; concrete
 * classes keep their strongly-typed `on()` overloads. Consumers wanting
 * type-safe events use the concrete class.
 */
export interface AICliClient {
  /** Runtime discriminator. Mirrors the `provider` field in AICliClientConfig. */
  readonly provider: 'claude' | 'copilot';

  /** Current session id, or null if not yet established. */
  readonly sessionId: string | null;

  start(): Promise<void>;
  close(): Promise<void>;

  send(input: string): TurnHandleBase<unknown, unknown>;
  sendMessage(text: string): Promise<void>;
  queueMessage(text: string): void;
  interrupt(): Promise<void>;

  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
}
