// src/pty/copilot-args.ts
import type { CopilotPtyConfig } from './types.js';

/**
 * Map CopilotPtyConfig to Copilot CLI flags. Pure function.
 * Order: --model, boolean flags, repeated allow/deny/add-dir, extraArgs.
 */
export function buildCopilotArgs(config: CopilotPtyConfig): string[] {
  const args: string[] = [];
  if (config.model)         args.push('--model', config.model);
  if (config.allowAll)      args.push('--allow-all');
  if (config.allowAllPaths) args.push('--allow-all-paths');
  if (config.allowAllUrls)  args.push('--allow-all-urls');
  if (config.noAskUser)     args.push('--no-ask-user');
  for (const t of config.allowTools ?? []) args.push('--allow-tool', t);
  for (const t of config.denyTools  ?? []) args.push('--deny-tool',  t);
  for (const d of config.addDir     ?? []) args.push('--add-dir',    d);
  if (config.extraArgs)     args.push(...config.extraArgs);
  return args;
}
