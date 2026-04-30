import type { TurnSnapshot, UnifiedStatus } from './types.js';

export interface UnifiedEventMap {
  ready: [];
  text: [chunk: string];
  text_done: [text: string];
  reasoning: [chunk: string];
  reasoning_done: [text: string];
  tool_use_start: [event: { id: string; name: string; input: unknown }];
  tool_result: [event: { toolUseId: string; content: unknown; isError: boolean }];
  usage_update: [usage: { inputTokens: number; outputTokens: number }];
  status_change: [status: UnifiedStatus];
  result: [snapshot: TurnSnapshot];
  error: [err: Error];
  closed: [exitCode: number | null];
  // Phase 1.2 additions
  pending_request_added: [event: { id: string; kind: 'permission' | 'elicitation' | 'question' }];
  pending_request_removed: [event: { id: string }];
  pending_request_resolved: [event: { id: string; outcome: 'approved' | 'denied' | 'answered' | 'cancelled' }];
}

export type UnifiedEventName = keyof UnifiedEventMap;
