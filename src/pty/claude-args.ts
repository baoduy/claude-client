// src/pty/claude-args.ts
import type { ClaudePtyConfig } from './types.js';

/**
 * Map ClaudePtyConfig to Claude CLI flags. Pure function. Order is stable
 * (--model, --permission-mode, then extraArgs) so tests can do deepEqual.
 */
export function buildClaudeArgs(config: ClaudePtyConfig): string[] {
  const args: string[] = [];
  if (config.model)          args.push('--model',           config.model);
  if (config.permissionMode) args.push('--permission-mode', config.permissionMode);
  if (config.extraArgs)      args.push(...config.extraArgs);
  return args;
}
