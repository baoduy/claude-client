// src/unified/types.ts

export type UnifiedStatus = 'idle' | 'running' | 'error';

export interface TurnSnapshot {
  readonly id: string;
  readonly status: 'pending' | 'completed' | 'errored';
  readonly text: string;
  readonly reasoning?: string;
  readonly toolUses: TurnToolUse[];
  readonly toolResults: TurnToolResult[];
  readonly usage?: { inputTokens: number; outputTokens: number };
  readonly error?: { message: string; code?: string };
  readonly startedAt: number;
  readonly completedAt?: number;
}

export interface TurnToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface TurnToolResult {
  toolUseId: string;
  content: unknown;
  isError: boolean;
}

export type SendInput =
  | string
  | { text: string }
  | { content: ContentBlock[] };

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource }
  | { type: 'file_path'; path: string; displayName?: string }
  | { type: 'directory_path'; path: string; displayName?: string }
  | {
      type: 'selection';
      filePath: string;
      displayName: string;
      range?: { start: { line: number; character: number }; end: { line: number; character: number } };
      text?: string;
    };

export type ImageSource =
  | { type: 'base64'; mediaType: string; data: string }
  | { type: 'url'; url: string };

export interface AICliCapabilities {
  readonly richContent: 'none' | 'partial' | 'full';
  readonly setModel: boolean;
  readonly setPermissionMode: boolean;
  readonly setMaxThinkingTokens: boolean;
  readonly listSupportedModels: boolean;
  readonly getMessages: boolean;
  readonly hooks: boolean;
  readonly mcp: boolean;
  // Phase 1.2 additions
  readonly permissionModes: readonly PermissionMode[];
  readonly interactiveApproval: boolean;
  readonly interruptTurnGranularity: 'per-turn' | 'session-only';
  readonly detailedStatus: boolean;
}

export type PermissionMode =
  | 'prompt'
  | 'auto-edit'
  | 'auto-all'
  | 'plan'
  | 'autopilot';

/** @deprecated Use PermissionMode. Will be removed in 2.0.0. */
export type LegacyPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'plan';

export function translateLegacyPermissionMode(
  mode: PermissionMode | LegacyPermissionMode,
): PermissionMode {
  switch (mode) {
    case 'default': return 'prompt';
    case 'acceptEdits': return 'auto-edit';
    case 'auto': return 'auto-all';
    case 'bypassPermissions': return 'auto-all';
    case 'dontAsk': return 'auto-all';
    // remaining values are already in the new vocab — pass through
    case 'prompt':
    case 'auto-edit':
    case 'auto-all':
    case 'plan':
    case 'autopilot':
      return mode;
    default: {
      // exhaustiveness — should never happen at runtime if types are honored
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export interface SupportedModelsResponse {
  models: Array<{ id: string; displayName?: string }>;
  default?: string;
}

export type UnifiedMessageRaw =
  | { provider: 'claude'; event: unknown }
  | { provider: 'copilot'; event: unknown };

export interface UnifiedMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly text?: string;
  readonly reasoning?: string;
  readonly toolUse?: TurnToolUse;
  readonly toolResult?: TurnToolResult;
  readonly timestamp: number;
  readonly raw: UnifiedMessageRaw;
}

// ─── Phase 1.2 — Interactive approval shapes ──────────────────────────────

export type PendingRequest =
  | PermissionPendingRequest
  | ElicitationPendingRequest
  | UserInputPendingRequest;

export interface PermissionPendingRequest {
  readonly id: string;
  readonly kind: 'permission';
  readonly permissionKind:
    | 'shell'
    | 'write'
    | 'mcp'
    | 'read'
    | 'url'
    | 'custom-tool'
    | 'memory'
    | 'hook';
  readonly message: string;
  readonly toolCallId?: string;
  readonly raw:
    | { readonly provider: 'claude'; readonly payload: unknown }
    | { readonly provider: 'copilot'; readonly payload: unknown };
}

export interface ElicitationPendingRequest {
  readonly id: string;
  readonly kind: 'elicitation';
  readonly message: string;
  readonly schema?: unknown;
  readonly raw:
    | { readonly provider: 'claude'; readonly payload: unknown }
    | { readonly provider: 'copilot'; readonly payload: unknown };
}

export interface UserInputPendingRequest {
  readonly id: string;
  readonly kind: 'question';
  readonly question: string;
  readonly choices?: readonly string[];
  readonly allowFreeform: boolean;
  readonly raw:
    | { readonly provider: 'claude'; readonly payload: unknown }
    | { readonly provider: 'copilot'; readonly payload: unknown };
}

export type ApproveDecision =
  | { readonly scope: 'once' }
  | { readonly scope: 'session' }
  | { readonly scope: 'location'; readonly locationKey: string };

export type QuestionResponse =
  | { readonly kind: 'text'; readonly answer: string }
  | { readonly kind: 'choice'; readonly value: string }
  | {
      readonly kind: 'form';
      readonly values: Record<string, string | number | boolean | string[]>;
    }
  | { readonly kind: 'cancel' };

export interface DetailedStatus {
  readonly status: UnifiedStatus;
  readonly phase: string;
  readonly pendingRequestCount: number;
  readonly permissionMode?: PermissionMode;
  readonly raw:
    | { readonly provider: 'claude'; readonly payload: unknown }
    | { readonly provider: 'copilot'; readonly payload: unknown };
}

export interface PendingAction {
  readonly id: string;
  readonly kind: 'permission' | 'elicitation' | 'question';
}
