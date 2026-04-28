import { randomUUID } from 'crypto';
import { CopilotFeatureUnsupportedError, CopilotAuthError, CopilotLaunchError } from './errors.js';
import { GhCopilotClient, approveAll } from './sdk.js';
export class CopilotTransport {
    config;
    GhClientCtor;
    gh = null;
    session = null;
    sessionId = null;
    constructor(opts) {
        this.config = opts.config;
        this.GhClientCtor = opts.GhClientCtor ?? GhCopilotClient;
    }
    async start() {
        this.checkUnsupportedFields();
        try {
            this.gh = new this.GhClientCtor(this.buildClientOptions());
        }
        catch (err) {
            throw new CopilotLaunchError(`Failed to instantiate Copilot SDK: ${err?.message ?? err}`);
        }
        try {
            if (this.config.resumeSessionId) {
                this.session = await this.gh.resumeSession(this.config.resumeSessionId, this.buildResumeSessionConfig());
                this.sessionId = this.config.resumeSessionId;
            }
            else {
                const sessionId = this.config.sessionId ?? randomUUID();
                this.session = await this.gh.createSession(this.buildSessionConfig(sessionId));
                // Prefer the session ID the SDK actually assigned (real SDK always sets .sessionId).
                this.sessionId = this.session?.sessionId ?? sessionId;
            }
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            if (/auth|token|credential/i.test(msg))
                throw new CopilotAuthError(msg);
            throw new CopilotLaunchError(msg);
        }
    }
    async stop() {
        if (this.gh) {
            try {
                await this.gh.stop();
            }
            catch { /* swallow */ }
            this.gh = null;
            this.session = null;
        }
    }
    checkUnsupportedFields() {
        const c = this.config;
        if (c.transport === 'pty') {
            throw new CopilotFeatureUnsupportedError('transport', 'PTY transport is reserved for Phase 2 and not yet implemented.');
        }
        // SDK 0.3.0 does not support --mode or --max-autopilot-continues passthrough.
        if (c.mode !== undefined) {
            throw new CopilotFeatureUnsupportedError('mode', '@github/copilot-sdk 0.3.0 does not yet support --mode passthrough; remove `mode` from config or upgrade.');
        }
        if (c.maxAutopilotContinues !== undefined) {
            throw new CopilotFeatureUnsupportedError('maxAutopilotContinues', '@github/copilot-sdk 0.3.0 does not yet support --max-autopilot-continues passthrough.');
        }
        // SDK 0.3.0 SessionConfig has no allowAllTools / allowAllPaths / allowAllUrls / noAskUser fields.
        if (c.allowAllTools) {
            throw new CopilotFeatureUnsupportedError('allowAllTools', '@github/copilot-sdk 0.3.0 does not support allowAllTools; use onPermissionRequest: approveAll instead.');
        }
        if (c.allowAllPaths) {
            throw new CopilotFeatureUnsupportedError('allowAllPaths', '@github/copilot-sdk 0.3.0 does not support allowAllPaths; handle paths in onPermissionRequest.');
        }
        if (c.allowAllUrls) {
            throw new CopilotFeatureUnsupportedError('allowAllUrls', '@github/copilot-sdk 0.3.0 does not support allowAllUrls; handle URLs in onPermissionRequest.');
        }
        if (c.noAskUser) {
            throw new CopilotFeatureUnsupportedError('noAskUser', '@github/copilot-sdk 0.3.0 does not support noAskUser.');
        }
    }
    /** Options for the GhCopilotClient constructor. */
    buildClientOptions() {
        const c = this.config;
        const opts = {};
        if (c.cliPath)
            opts.cliPath = c.cliPath;
        if (c.cliUrl)
            opts.cliUrl = c.cliUrl;
        if (c.cwd)
            opts.cwd = c.cwd;
        return opts;
    }
    /** SessionConfig for createSession. */
    buildSessionConfig(sessionId) {
        const c = this.config;
        const cfg = {
            sessionId,
            // onPermissionRequest is REQUIRED by the SDK. Default to approve-all when the caller hasn't
            // configured permissions explicitly. C7 will refine this once the permission flow is wired.
            onPermissionRequest: approveAll,
        };
        if (c.model)
            cfg.model = c.model;
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
        if (c.allowTools && c.allowTools.length > 0)
            cfg.availableTools = c.allowTools;
        if (c.denyTools && c.denyTools.length > 0)
            cfg.excludedTools = c.denyTools;
        // availableTools / excludedTools from config (passed directly — SDK-native names)
        if (c.availableTools && c.availableTools.length > 0)
            cfg.availableTools = c.availableTools;
        if (c.excludedTools && c.excludedTools.length > 0)
            cfg.excludedTools = c.excludedTools;
        return cfg;
    }
    /** ResumeSessionConfig for resumeSession (subset of SessionConfig). */
    buildResumeSessionConfig() {
        return {
            onPermissionRequest: approveAll,
        };
    }
}
