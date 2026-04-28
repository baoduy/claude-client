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
