import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { CopilotTransport } from './transport.js';
import { GhCopilotClient } from './sdk.js';
import { CopilotTurnHandle } from './turn-handle.js';
import { CopilotTurnError, CopilotInterruptedError } from './errors.js';
import { PendingRequestQueue } from './pending-queue.js';
import type {
  CopilotClientConfig,
  CopilotStatus,
  CopilotPendingAction,
  CopilotTurnSnapshot,
  CopilotTurnUpdate,
  CopilotUsage,
} from './types.js';
import type { AICliClient } from '../ai-cli-client.js';
import type {
  AICliCapabilities,
  ApproveDecision,
  PendingAction,
  PendingRequest,
  QuestionResponse,
  SendInput,
  SupportedModelsResponse,
  UnifiedMessage,
} from '../unified/index.js';
import { sendInputToCopilotMessage, type CopilotMessage } from './attachments.js';
import { permissionModeToOps } from './permission-mapping.js';
import { translateLegacyPermissionMode, UnsupportedModeError } from '../unified/index.js';
import type {
  PermissionMode,
  LegacyPermissionMode,
  DetailedStatus,
} from '../unified/index.js';
import {
  CopilotPlanApi,
  CopilotSkillsApi,
  CopilotAgentApi,
  CopilotHistoryApi,
  CopilotUsageApi,
  CopilotShellApi,
  CopilotWorkspacesApi,
  CopilotNameApi,
  CopilotInstructionsApi,
  CopilotMcpApi,
} from './namespaces/index.js';

export interface CopilotClientInternals {
  /** Test injection point for the SDK constructor. */
  GhClientCtor?: typeof GhCopilotClient;
}

export declare interface CopilotClient {
  on(event: 'ready',           listener: () => void): this;
  on(event: 'text',            listener: (chunk: string) => void): this;
  on(event: 'text_done',       listener: (text: string) => void): this;
  on(event: 'reasoning',       listener: (chunk: string) => void): this;
  on(event: 'reasoning_done',  listener: (text: string) => void): this;
  on(event: 'closed',          listener: (exitCode: number | null) => void): this;
  on(event: 'tool_use_start',  listener: (tool: { id: string; name: string; input: Record<string, any> }) => void): this;
  on(event: 'tool_result',     listener: (res: { toolUseId: string; content: string; isError: boolean }) => void): this;
  on(event: 'usage_update',    listener: (u: { inputTokens: number; outputTokens: number }) => void): this;
  on(event: 'result',          listener: (snapshot: CopilotTurnSnapshot) => void): this;
  on(event: 'status_change',   listener: (status: CopilotStatus, action: CopilotPendingAction | null) => void): this;
  on(event: 'error',           listener: (err: Error) => void): this;
}

export class CopilotClient extends EventEmitter implements AICliClient {
  readonly provider = 'copilot' as const;
  readonly capabilities: AICliCapabilities = {
    richContent: 'full',
    setModel: true,
    setPermissionMode: true,
    setMaxThinkingTokens: false,
    listSupportedModels: true,
    getMessages: true,
    hooks: true,
    mcp: true,
    // Phase 1.2 additions
    permissionModes: ['prompt', 'auto-edit', 'auto-all', 'plan', 'autopilot'] as const,
    interactiveApproval: true,
    interruptTurnGranularity: 'session-only',
    detailedStatus: true,
  };

  private readonly config: CopilotClientConfig;
  private readonly transport: CopilotTransport;
  private readonly queue: PendingRequestQueue;

  // Bonus RPC namespace wrappers (Phase 1.3 — C13).
  readonly plan: CopilotPlanApi;
  readonly skills: CopilotSkillsApi;
  readonly agent: CopilotAgentApi;
  readonly history: CopilotHistoryApi;
  readonly usage: CopilotUsageApi;
  readonly shell: CopilotShellApi;
  readonly workspaces: CopilotWorkspacesApi;
  readonly name: CopilotNameApi;
  readonly instructions: CopilotInstructionsApi;
  readonly mcp: CopilotMcpApi;

  private _status: CopilotStatus = 'idle';
  private _currentTurn: CopilotTurnHandle | null = null;
  private _history: CopilotTurnSnapshot[] = [];
  private _messageQueue: CopilotMessage[] = [];
  private _closed = false;
  private _currentPermissionMode: PermissionMode = 'prompt';
  private _lastEventType: string | undefined = undefined;
  private _lastEventTimestamp: number | undefined = undefined;

  constructor(config: CopilotClientConfig, internals?: CopilotClientInternals) {
    super();
    this.config = config;
    this.queue = new PendingRequestQueue({
      emit: (name, payload) => this.emit(name as any, payload),
    });
    this.transport = new CopilotTransport({
      config,
      queue: this.queue,
      GhClientCtor: internals?.GhClientCtor,
    });

    // Lazy session getter — reads from the transport at method-call time.
    const sessionGetter = () => (this.transport as any).session ?? null;

    this.plan = new CopilotPlanApi(sessionGetter);
    this.skills = new CopilotSkillsApi(sessionGetter);
    this.agent = new CopilotAgentApi(sessionGetter);
    this.history = new CopilotHistoryApi(sessionGetter);
    this.usage = new CopilotUsageApi(sessionGetter);
    this.shell = new CopilotShellApi(sessionGetter);
    this.workspaces = new CopilotWorkspacesApi(sessionGetter);
    this.name = new CopilotNameApi(sessionGetter);
    this.instructions = new CopilotInstructionsApi(sessionGetter);
    this.mcp = new CopilotMcpApi(sessionGetter);
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.setStatus('idle');
    this.emit('ready');
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    // Drive the full lifecycle exit sequence:
    // session.abort() → session.disconnect() → client.stop()
    await this.transport.stopSession();
    await this.transport.stop();
    this._currentTurn = null;
    this.emit('closed', null);
  }

  get sessionId(): string | null {
    return this.transport.sessionId;
  }

  getStatus(): CopilotStatus {
    return this._status;
  }

  isProcessing(): boolean {
    return this._status === 'running';
  }

  /**
   * Return the current turn snapshot, or `null`. Conforms to the
   * unified `AICliClient.getCurrentTurn()` contract — `CopilotTurnSnapshot`
   * extends `TurnSnapshot`. Use `getCurrentTurnHandle()` when you need
   * the live `CopilotTurnHandle` instance.
   */
  getCurrentTurn(): CopilotTurnSnapshot | null {
    return this._currentTurn ? this._currentTurn.current() : null;
  }

  /** Return the live CopilotTurnHandle for the current turn, or `null`. */
  getCurrentTurnHandle(): CopilotTurnHandle | null {
    return this._currentTurn;
  }

  getHistory(): CopilotTurnSnapshot[] {
    return this._history.slice();
  }

  /** Internal: status transitions emit `status_change`. */
  private setStatus(status: CopilotStatus, action: CopilotPendingAction | null = null): void {
    if (this._status === status) return;
    this._status = status;
    this.emit('status_change', status, action);
  }

  /**
   * Translate a `SendInput` to a Copilot SDK `MessageOptions`-compatible
   * `CopilotMessage` ({ prompt, attachments? }).
   *
   * The translator pre-scans synchronously and throws
   * `UnsupportedContentError` (e.g., image with `url` source, empty
   * `content: []`) before any side effects, so callers can retry with
   * corrected input.
   */
  private _buildCopilotMessage(input: SendInput): CopilotMessage {
    return sendInputToCopilotMessage(input);
  }

  send(input: SendInput): CopilotTurnHandle {
    const message = this._buildCopilotMessage(input);
    return this._dispatchMessage(message);
  }

  sendMessage(input: SendInput): Promise<void> {
    // Note: not `async`. Validation runs synchronously so bad input throws
    // before the Promise is constructed. send() pre-scans content blocks
    // and throws UnsupportedContentError on unsupported input.
    const turn = this.send(input);
    return turn.done.then(() => undefined);
  }

  queueMessage(input: SendInput): void {
    // Pre-scan synchronously so bad input fails fast even when queued.
    const message = this._buildCopilotMessage(input);
    if (this._status === 'running') {
      this._messageQueue.push(message);
    } else {
      try {
        this._dispatchMessage(message);
      } catch (err) {
        this.emit('error', err as Error);
      }
    }
  }

  /**
   * Internal dispatcher: kick off a turn for a pre-built `CopilotMessage`.
   * Shared by `send()` (front door) and the queue drain in `processNextQueued`.
   */
  private _dispatchMessage(message: CopilotMessage): CopilotTurnHandle {
    if (this._currentTurn) {
      throw new Error('A turn is already in flight. Call interrupt() first or await turn.done.');
    }
    const id = `copilot-${randomUUID()}`;
    const initial: CopilotTurnSnapshot = {
      id,
      status: 'pending',
      text: '',
      reasoning: undefined,
      toolUses: [],
      toolResults: [],
      usage: undefined,
      error: undefined,
      startedAt: Date.now(),
      completedAt: undefined,
      copilotToolCalls: [],
      copilotUsageRaw: undefined,
    };
    const handle = new CopilotTurnHandle(initial);
    this._currentTurn = handle;
    this.setStatus('running');

    // Wire SDK events → handle updates + client events. Microtask so callers can subscribe first.
    queueMicrotask(() => this.runTurn(message, handle).catch(err => {
      this.emit('error', err);
    }));

    return handle;
  }

  private async runTurn(message: CopilotMessage, handle: CopilotTurnHandle): Promise<void> {
    const session = (this.transport as any).session;
    if (!session) {
      handle.fail(new CopilotTurnError('No active Copilot session — call start() first.'));
      this.setStatus('error');
      this._currentTurn = null;
      return;
    }

    // Subscribe to SDK events BEFORE sending. SDK 0.3.0: session.on(handler) returns unsubscribe.
    const unsubscribe = session.on?.((event: any) => {
      this.handleSdkEvent(event, handle);
    });

    try {
      // sendAndWait returns AssistantMessageEvent | undefined; content is at response.data.content.
      // CopilotMessage is structurally compatible with MessageOptions ({ prompt, attachments? }).
      const response = await session.sendAndWait(message);
      const finalText = handle.current().text || response?.data?.content || response?.content || '';
      const finalSnapshot: CopilotTurnSnapshot = {
        ...handle.current(),
        text: finalText,
        status: 'completed',
        completedAt: Date.now(),
      };
      handle.complete(finalSnapshot);

      // Fire turn-end "done" events before result so consumers see the
      // final accumulated text/reasoning in turn order. Skip when nothing
      // was emitted to avoid empty-string false-positives.
      if (finalSnapshot.text) {
        this.emit('text_done', finalSnapshot.text);
      }
      if (finalSnapshot.reasoning) {
        this.emit('reasoning_done', finalSnapshot.reasoning);
      }

      this.emit('result', finalSnapshot);
      this._history.push(finalSnapshot);
    } catch (err: any) {
      // If handle was already terminated (e.g., via interrupt()), skip re-failing and re-emitting.
      if (handle.current().status !== 'errored') {
        const wrapped = err instanceof Error
          ? new CopilotTurnError(err.message)
          : new CopilotTurnError(String(err));
        handle.fail(wrapped);
        this.emit('error', wrapped);
      }
      this._history.push(handle.current());
    } finally {
      if (typeof unsubscribe === 'function') unsubscribe();
      this._currentTurn = null;
      this.setStatus(handle.current().status === 'errored' ? 'error' : 'idle');
      this.processNextQueued();
    }
  }

  private handleSdkEvent(event: any, handle: CopilotTurnHandle): void {
    if (!event || typeof event !== 'object') return;
    this._lastEventType = event.type;
    this._lastEventTimestamp = event.timestamp ? Date.parse(event.timestamp) : Date.now();
    const type = event.type;

    switch (type) {
      case 'assistant.streaming_delta':
      case 'assistant.message_delta': {
        const delta = event.delta ?? event.text ?? '';
        if (delta) {
          const snapshot: CopilotTurnSnapshot = { ...handle.current(), text: handle.current().text + delta };
          handle.push({ kind: 'output', delta, snapshot });
          this.emit('text', delta);
        }
        // Some message_delta events also carry usage info
        if (event.usage) {
          const usage: CopilotUsage = {
            inputTokens: event.usage.inputTokens ?? 0,
            outputTokens: event.usage.outputTokens ?? 0,
          };
          const snapshot: CopilotTurnSnapshot = { ...handle.current(), usage };
          handle.push({ kind: 'usage', usage, snapshot });
          this.emit('usage_update', usage);
        }
        break;
      }
      case 'tool.execution_complete': {
        const toolUseId = event.toolUseId ?? event.id;
        const content = event.output ?? event.content ?? '';
        const isError = event.isError === true || event.success === false;
        const snapshot: CopilotTurnSnapshot = { ...handle.current() };
        handle.push({ kind: 'tool_result', toolUseId, content, isError, snapshot });
        this.emit('tool_result', { toolUseId, content, isError });
        break;
      }
      case 'session.idle':
      case 'session.error':
        // Terminal events — handled by sendAndWait's resolution/rejection; nothing to push here.
        break;
      default:
        // Unrecognized event — ignore. Adapter is forward-compat with new SDK event types.
        break;
    }
  }

  private processNextQueued(): void {
    if (this._status !== 'idle') return;
    const next = this._messageQueue.shift();
    if (next !== undefined) {
      try {
        this._dispatchMessage(next);
      } catch (err) {
        this.emit('error', err as Error);
      }
    }
  }

  async setModel(model: string): Promise<void> {
    const session = (this.transport as any).session;
    if (!session) throw new Error('Copilot session not started — call start() first.');
    await session.setModel(model);
  }

  async setPermissionMode(mode: PermissionMode | LegacyPermissionMode): Promise<void> {
    const session = (this.transport as any).session;
    if (!session) throw new Error('Copilot session not started — call start() first.');

    const normalized = translateLegacyPermissionMode(mode);
    if (!this.capabilities.permissionModes.includes(normalized)) {
      throw new UnsupportedModeError('copilot', String(mode));
    }

    const ops = permissionModeToOps(mode);
    await session.rpc.mode.set({ mode: ops.modeSet });
    await session.rpc.permissions.setApproveAll({ enabled: ops.approveAll });
    this.queue.setAutoEdit(ops.autoEdit);
    this._currentPermissionMode = normalized;
  }

  getDetailedStatus(): DetailedStatus {
    const status: 'idle' | 'running' | 'error' =
      this._status === 'error' ? 'error' :
      this._status === 'running' ? 'running' : 'idle';

    return {
      status,
      phase: this._lastEventType ?? (this._status === 'running' ? 'running' : 'idle'),
      pendingRequestCount: this.queue.size(),
      permissionMode: this._currentPermissionMode,
      raw: {
        provider: 'copilot',
        payload: {
          lastEventType: this._lastEventType,
          lastEventTimestamp: this._lastEventTimestamp,
        },
      },
    };
  }

  async listSupportedModels(_timeout?: number): Promise<SupportedModelsResponse> {
    const ghClient = (this.transport as any).gh;
    if (!ghClient) throw new Error('Copilot client not started — call start() first.');
    const models: Array<{ modelId?: string; id?: string; name?: string; displayName?: string }> =
      await ghClient.listModels();
    return {
      models: models.map(m => ({
        id: m.modelId ?? m.id ?? '',
        displayName: m.displayName ?? m.name,
      })),
    };
  }

  async getMessages(): Promise<UnifiedMessage[]> {
    const session = (this.transport as any).session;
    if (!session) throw new Error('Copilot session not started — call start() first.');
    const events: any[] = await session.getMessages();
    const out: UnifiedMessage[] = [];
    for (const ev of events) {
      const ts = ev.timestamp ? Date.parse(ev.timestamp) : Date.now();
      switch (ev.type) {
        case 'user.message':
          out.push({
            id: ev.id,
            role: 'user',
            text: ev.data?.content ?? '',
            timestamp: ts,
            raw: { provider: 'copilot', event: ev },
          });
          break;
        case 'assistant.message':
          out.push({
            id: ev.id,
            role: 'assistant',
            text: ev.data?.content ?? '',
            ...(ev.data?.reasoning && { reasoning: ev.data.reasoning }),
            timestamp: ts,
            raw: { provider: 'copilot', event: ev },
          });
          break;
        case 'tool.execution_start':
          out.push({
            id: ev.id,
            role: 'tool',
            toolUse: {
              id: ev.data?.toolUseId ?? ev.id,
              name: ev.data?.toolName ?? '',
              input: ev.data?.arguments ?? {},
            },
            timestamp: ts,
            raw: { provider: 'copilot', event: ev },
          });
          break;
        case 'tool.execution_complete':
          out.push({
            id: ev.id,
            role: 'tool',
            toolResult: {
              toolUseId: ev.data?.toolUseId ?? ev.id,
              content: ev.data?.output ?? ev.data?.content ?? '',
              isError: ev.data?.isError === true || ev.data?.success === false,
            },
            timestamp: ts,
            raw: { provider: 'copilot', event: ev },
          });
          break;
        default:
          // skip lifecycle / streaming-delta events — they are not user-visible messages
          break;
      }
    }
    return out;
  }

  async interrupt(): Promise<void> {
    const turn = this._currentTurn;
    if (!turn) return;
    const session = (this.transport as any).session;
    try {
      if (typeof session?.abort === 'function') await session.abort();
    } catch {
      // swallow — the rejection below covers it
    }
    turn.fail(new CopilotInterruptedError());
  }

  async interruptTurn(turnId?: string): Promise<void> {
    if (turnId !== undefined && process.env.COPILOT_VERBOSE === '1') {
      // eslint-disable-next-line no-console
      console.warn(`[copilot] interruptTurn turnId=${turnId} ignored — session-only granularity`);
    }
    const session = (this.transport as any).session;
    if (!session) return; // no-op when not started
    await session.abort?.();
  }

  // ─── Pull-style interactive approval API (Phase 1.2 — B6) ─────────────────

  /** Snapshot of all currently open pending requests, in insertion order. */
  getOpenRequests(): PendingRequest[] {
    return this.queue.list();
  }

  /**
   * Approve a pending permission request. Default scope is `'once'`; use
   * `{ scope: 'session' }` or `{ scope: 'location', locationKey }` for
   * broader approvals. Note: scope `'session'` and `'location'` rely on a
   * best-effort synthesis of the SDK approval payload — see
   * `pending-queue.ts#synthesizeApproval` for the matrix; unsupported kinds
   * gracefully degrade to `'once'` with a console.warn.
   */
  async approveRequest(id: string, decision?: ApproveDecision): Promise<void> {
    return this.queue.resolveApprove(id, decision);
  }

  /** Deny a pending permission request, optionally with feedback. */
  async denyRequest(id: string, feedback?: string): Promise<void> {
    return this.queue.resolveDeny(id, feedback);
  }

  /** Answer a pending elicitation or user-input question. */
  async answerQuestion(id: string, response: QuestionResponse): Promise<void> {
    return this.queue.resolveQuestion(id, response);
  }

  /** Returns the most recently added pending action, or null if none. */
  getPendingAction(): PendingAction | null {
    return this.queue.getMostRecent();
  }
}
