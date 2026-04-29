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
}

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'plan';

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
