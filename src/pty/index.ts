// src/pty/index.ts
export type {
  PtyClient,
  PtyClientConfig,
  PtyCommonConfig,
  ClaudePtyConfig,
  CopilotPtyConfig,
} from './types.js';
export {
  PtyError,
  PtyDependencyMissingError,
  PtyBinaryNotFoundError,
  PtySpawnError,
} from './errors.js';
export { createPtyClient } from './factory.js';
// client.ts and *-args.ts intentionally NOT exported — internal.
