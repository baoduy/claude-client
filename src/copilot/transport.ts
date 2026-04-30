import { randomUUID } from 'crypto';
import type { CopilotClientConfig } from './types.js';
import type {
  SessionConfig,
  ResumeSessionConfig,
  CopilotClientOptions,
  PermissionHandler,
  ElicitationHandler,
  UserInputHandler,
} from './sdk.js';
import {
  CopilotFeatureUnsupportedError,
  CopilotAuthError,
  CopilotLaunchError,
  RequestNotHandled,
} from './errors.js';
import { GhCopilotClient, approveAll } from './sdk.js';
import type { PendingRequestQueue } from './pending-queue.js';

export interface CopilotTransportOptions {
  config: CopilotClientConfig;
  /**
   * Pending-request queue for pull-style approval handling. When provided,
   * permission / elicitation / userInput requests fall through to this
   * queue if the user-provided handler is absent or throws
   * `RequestNotHandled`. When omitted (older callers / tests that haven't
   * adopted the queue), the transport uses `approveAll` as the default
   * permission handler and leaves elicitation/userInput unset.
   */
  queue?: PendingRequestQueue;
  /** Injection point for tests; defaults to the real SDK class. */
  GhClientCtor?: typeof GhCopilotClient;
}

export class CopilotTransport {
  private readonly config: CopilotClientConfig;
  private readonly GhClientCtor: typeof GhCopilotClient;
  private readonly queue: PendingRequestQueue | undefined;
  private gh: GhCopilotClient | null = null;
  session: any = null;
  sessionId: string | null = null;

  constructor(opts: CopilotTransportOptions) {
    this.config = opts.config;
    this.GhClientCtor = opts.GhClientCtor ?? GhCopilotClient;
    this.queue = opts.queue;
  }

  async start(): Promise<void> {
    this.checkUnsupportedFields();

    try {
      this.gh = new this.GhClientCtor(this.buildClientOptions());
    } catch (err: any) {
      throw new CopilotLaunchError(`Failed to instantiate Copilot SDK: ${err?.message ?? err}`);
    }

    try {
      if (this.config.resumeSessionId) {
        this.session = await (this.gh as any).resumeSession(
          this.config.resumeSessionId,
          this.buildResumeSessionConfig(),
        );
        this.sessionId = this.config.resumeSessionId;
      } else {
        const sessionId = this.config.sessionId ?? randomUUID();
        this.session = await (this.gh as any).createSession(this.buildSessionConfig(sessionId));
        // Prefer the session ID the SDK actually assigned (real SDK always sets .sessionId).
        this.sessionId = this.session?.sessionId ?? sessionId;
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (/auth|token|credential/i.test(msg)) throw new CopilotAuthError(msg);
      throw new CopilotLaunchError(msg);
    }
  }

  /**
   * Tear down the active session: abort any in-flight turn, then disconnect
   * the session. Errors from either step are swallowed since the SDK may not
   * support them in every state. Called by `CopilotClient.close()` before
   * `stop()` to drive the full lifecycle exit sequence.
   */
  async stopSession(): Promise<void> {
    if (this.session) {
      try { await this.session.abort?.(); } catch { /* swallow */ }
      try { await this.session.disconnect?.(); } catch { /* swallow */ }
      this.session = null;
    }
  }

  async stop(): Promise<void> {
    if (this.gh) {
      try { await (this.gh as any).stop(); } catch { /* swallow */ }
      this.gh = null;
      this.session = null;
    }
  }

  private checkUnsupportedFields(): void {
    const c = this.config;

    if (c.transport === 'pty') {
      throw new CopilotFeatureUnsupportedError(
        'transport',
        "CopilotClient does not support transport: 'pty'. " +
        "Use createPtyClient({ provider: 'copilot', ... }) from '@baoduy2412/ai-cli-client' instead.",
      );
    }

    // SDK 0.3.0 does not support --mode or --max-autopilot-continues passthrough.
    if (c.mode !== undefined) {
      throw new CopilotFeatureUnsupportedError(
        'mode',
        '@github/copilot-sdk 0.3.0 does not yet support --mode passthrough; remove `mode` from config or upgrade.',
      );
    }
    if (c.maxAutopilotContinues !== undefined) {
      throw new CopilotFeatureUnsupportedError(
        'maxAutopilotContinues',
        '@github/copilot-sdk 0.3.0 does not yet support --max-autopilot-continues passthrough.',
      );
    }

    // SDK 0.3.0 SessionConfig has no allowAllTools / allowAllPaths / allowAllUrls / noAskUser fields.
    if (c.allowAllTools) {
      throw new CopilotFeatureUnsupportedError(
        'allowAllTools',
        '@github/copilot-sdk 0.3.0 does not support allowAllTools; use onPermissionRequest: approveAll instead.',
      );
    }
    if (c.allowAllPaths) {
      throw new CopilotFeatureUnsupportedError(
        'allowAllPaths',
        '@github/copilot-sdk 0.3.0 does not support allowAllPaths; handle paths in onPermissionRequest.',
      );
    }
    if (c.allowAllUrls) {
      throw new CopilotFeatureUnsupportedError(
        'allowAllUrls',
        '@github/copilot-sdk 0.3.0 does not support allowAllUrls; handle URLs in onPermissionRequest.',
      );
    }
    if (c.noAskUser) {
      throw new CopilotFeatureUnsupportedError(
        'noAskUser',
        '@github/copilot-sdk 0.3.0 does not support noAskUser.',
      );
    }
  }

  /** Options for the GhCopilotClient constructor. */
  private buildClientOptions(): CopilotClientOptions {
    const c = this.config;
    const opts: CopilotClientOptions = {};
    if (c.cliPath) opts.cliPath = c.cliPath;
    if (c.cliUrl)  opts.cliUrl  = c.cliUrl;
    if (c.cwd)     opts.cwd     = c.cwd;
    return opts;
  }

  /** SessionConfig for createSession. */
  private buildSessionConfig(sessionId: string): SessionConfig {
    const c = this.config;
    const cfg: SessionConfig = {
      sessionId,
      // onPermissionRequest is REQUIRED by the SDK. Chain user-provided
      // handler → queue when the queue is present; fall back to approve-all
      // when neither is configured (legacy default).
      onPermissionRequest: this.makePermissionHandler(),
    };

    // Elicitation/userInput handlers — only install when the queue is wired.
    // Otherwise the SDK will surface its built-in defaults.
    const elic = this.makeElicitationHandler();
    if (elic) cfg.onElicitationRequest = elic;
    const userIn = this.makeUserInputHandler();
    if (userIn) cfg.onUserInputRequest = userIn;

    if (c.model) cfg.model = c.model;

    // BYOK lives on session.provider in SDK 0.3.0. baseUrl is required by ProviderConfig.
    if (c.apiKey) {
      cfg.provider = {
        type: c.apiKey.provider,
        apiKey: c.apiKey.key,
        // baseUrl is required in ProviderConfig; callers using BYOK must supply it via a future
        // config field. For now use a placeholder that will be overridden by C7.
        baseUrl: '',
      };
    }

    // availableTools and excludedTools are real SDK 0.3.0 SessionConfig fields.
    if (c.allowTools && c.allowTools.length > 0) cfg.availableTools = c.allowTools;
    if (c.denyTools  && c.denyTools.length  > 0) cfg.excludedTools  = c.denyTools;

    // availableTools / excludedTools from config (passed directly — SDK-native names)
    if (c.availableTools && c.availableTools.length > 0) cfg.availableTools = c.availableTools;
    if (c.excludedTools  && c.excludedTools.length  > 0) cfg.excludedTools  = c.excludedTools;

    // Lifecycle hooks — forwarded verbatim to the SDK when provided.
    if (c.hooks) cfg.hooks = c.hooks;

    // MCP servers — forwarded verbatim to the SDK when provided.
    if (c.mcpServers) cfg.mcpServers = c.mcpServers;

    return cfg;
  }

  /** ResumeSessionConfig for resumeSession (subset of SessionConfig). */
  private buildResumeSessionConfig(): ResumeSessionConfig {
    const cfg: ResumeSessionConfig = {
      onPermissionRequest: this.makePermissionHandler(),
    };
    const elic = this.makeElicitationHandler();
    if (elic) cfg.onElicitationRequest = elic;
    const userIn = this.makeUserInputHandler();
    if (userIn) cfg.onUserInputRequest = userIn;
    return cfg;
  }

  /**
   * Build the chained permission handler. User-provided handler runs first;
   * if it throws `RequestNotHandled`, the request falls through to the
   * queue. When neither user handler nor queue is present, default to
   * `approveAll` for backward compatibility.
   */
  private makePermissionHandler(): PermissionHandler {
    const userPerm = this.config.onPermissionRequest;
    const queue = this.queue;
    if (!userPerm && !queue) return approveAll;
    return async (req, ctx) => {
      if (userPerm) {
        try {
          return await userPerm(req, ctx);
        } catch (e) {
          if (!(e instanceof RequestNotHandled)) throw e;
        }
      }
      if (queue) {
        return queue.registerPermission(req, ctx.sessionId);
      }
      return approveAll(req, ctx);
    };
  }

  private makeElicitationHandler(): ElicitationHandler | undefined {
    const userElic = this.config.onElicitationRequest;
    const queue = this.queue;
    if (!userElic && !queue) return undefined;
    return async (ctx) => {
      if (userElic) {
        try {
          return await userElic(ctx);
        } catch (e) {
          if (!(e instanceof RequestNotHandled)) throw e;
        }
      }
      if (queue) {
        return queue.registerElicitation(ctx);
      }
      // Should not happen given the early return; satisfy TS exhaustiveness.
      return { action: 'cancel' };
    };
  }

  private makeUserInputHandler(): UserInputHandler | undefined {
    const userInput = this.config.onUserInputRequest;
    const queue = this.queue;
    if (!userInput && !queue) return undefined;
    return async (req, ctx) => {
      if (userInput) {
        try {
          return await userInput(req, ctx);
        } catch (e) {
          if (!(e instanceof RequestNotHandled)) throw e;
        }
      }
      if (queue) {
        return queue.registerUserInput(req, ctx.sessionId);
      }
      return { answer: '', wasFreeform: false };
    };
  }
}
