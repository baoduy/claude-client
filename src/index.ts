// Namespace exports for convenient subpath access
export * as claude from './claude/index.js';
export * as copilot from './copilot/index.js';

// Re-export claude utilities at top level for backward compatibility
export * from './claude/index.js';

// Re-export turn-handle (shared between Claude and Copilot)
export * from './turn-handle.js';

// Re-export both clients at the top level for convenience:
export { ClaudeClient } from './claude/index.js';
export { CopilotClient } from './copilot/index.js';

// Unified provider-agnostic API (Phase 2)
export type { AICliClient } from './ai-cli-client.js';
export { createAICliClient, type AICliClientConfig } from './factory.js';

// Unified surface types and errors (Phase 4)
export type {
  UnifiedStatus,
  TurnSnapshot,
  TurnToolUse,
  TurnToolResult,
  SendInput,
  ContentBlock,
  ImageSource,
  AICliCapabilities,
  PermissionMode,
  LegacyPermissionMode,
  SupportedModelsResponse,
  UnifiedEventMap,
  UnifiedEventName,
} from './unified/index.js';
export { UnsupportedContentError, translateLegacyPermissionMode } from './unified/index.js';

// PTY transport (Phase 3)
export type {
  PtyClient,
  PtyClientConfig,
  PtyCommonConfig,
  ClaudePtyConfig,
  CopilotPtyConfig,
} from './pty/index.js';
export {
  PtyError,
  PtyDependencyMissingError,
  PtyBinaryNotFoundError,
  PtySpawnError,
  createPtyClient,
} from './pty/index.js';
