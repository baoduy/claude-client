// src/pty/errors.ts

export class PtyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = 'PtyError';
  }
}

/** node-pty is not installed (optional peer dep missing). */
export class PtyDependencyMissingError extends PtyError {
  readonly code = 'PTY_DEP_MISSING' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PtyDependencyMissingError';
  }
}

/** Provider binary (`claude` / `copilot`) was not found on PATH. */
export class PtyBinaryNotFoundError extends PtyError {
  readonly code = 'PTY_BINARY_NOT_FOUND' as const;
  readonly bin: string;
  constructor(bin: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PtyBinaryNotFoundError';
    this.bin = bin;
  }
}

/** node-pty.spawn() threw — usually permissions or platform issues. */
export class PtySpawnError extends PtyError {
  readonly code = 'PTY_SPAWN_FAILED' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PtySpawnError';
  }
}
