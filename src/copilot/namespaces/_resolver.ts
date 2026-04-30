import type { GhCopilotSession } from '../sdk.js';
import {
  SessionNotStartedError,
  CopilotRpcError,
  CopilotExperimentalUnavailableError,
} from '../errors.js';

export type SessionGetter = () => GhCopilotSession | null;

/**
 * Build a function that resolves the live SDK session, or throws
 * SessionNotStartedError if the session isn't available yet. Used by
 * namespace wrappers to defer session lookup until method-call time.
 */
export function makeSessionResolver(
  getter: SessionGetter,
  callsite: string,
): () => GhCopilotSession {
  return () => {
    const s = getter();
    if (!s) throw new SessionNotStartedError(callsite);
    return s;
  };
}

/**
 * Run an RPC call and normalize errors:
 * - Wraps unknown failures as CopilotRpcError with namespace/method context.
 * - For experimental=true, "method not found" failures (JSON-RPC code -32601 or
 *   matching message text) are re-thrown as CopilotExperimentalUnavailableError
 *   so consumers can detect older CLI versions that lack the method.
 */
export async function callRpc<T>(
  namespace: string,
  method: string,
  experimental: boolean,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (
      experimental &&
      (err?.code === -32601 || /method not found/i.test(err?.message ?? ''))
    ) {
      throw new CopilotExperimentalUnavailableError(namespace, method);
    }
    throw new CopilotRpcError(namespace, method, err);
  }
}
