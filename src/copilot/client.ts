import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { CopilotTransport } from './transport.js';
import { GhCopilotClient } from './sdk.js';
import { CopilotTurnHandle } from './turn-handle.js';
import { CopilotTurnError, CopilotInterruptedError } from './errors.js';
import type {
  CopilotClientConfig,
  CopilotStatus,
  CopilotPendingAction,
  CopilotTurnSnapshot,
  CopilotTurnUpdate,
  CopilotUsage,
} from './types.js';
import type { AICliClient } from '../ai-cli-client.js';

export interface CopilotClientInternals {
  /** Test injection point for the SDK constructor. */
  GhClientCtor?: typeof GhCopilotClient;
}

export declare interface CopilotClient {
  on(event: 'ready',           listener: () => void): this;
  on(event: 'output_delta',    listener: (delta: string) => void): this;
  on(event: 'reasoning_delta', listener: (delta: string) => void): this;
  on(event: 'tool_use_start',  listener: (tool: { id: string; name: string; input: Record<string, any> }) => void): this;
  on(event: 'tool_result',     listener: (res: { toolUseId: string; content: string; isError: boolean }) => void): this;
  on(event: 'usage_update',    listener: (u: { inputTokens: number; outputTokens: number }) => void): this;
  on(event: 'result',          listener: (snapshot: CopilotTurnSnapshot) => void): this;
  on(event: 'status_change',   listener: (status: CopilotStatus, action: CopilotPendingAction | null) => void): this;
  on(event: 'error',           listener: (err: Error) => void): this;
}

export class CopilotClient extends EventEmitter implements AICliClient {
  readonly provider = 'copilot' as const;

  private readonly config: CopilotClientConfig;
  private readonly transport: CopilotTransport;

  private _status: CopilotStatus = 'idle';
  private _currentTurn: CopilotTurnHandle | null = null;
  private _history: CopilotTurnSnapshot[] = [];
  private _messageQueue: string[] = [];

  constructor(config: CopilotClientConfig, internals?: CopilotClientInternals) {
    super();
    this.config = config;
    this.transport = new CopilotTransport({ config, GhClientCtor: internals?.GhClientCtor });
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.setStatus('idle');
    this.emit('ready');
  }

  async close(): Promise<void> {
    await this.transport.stop();
    this._currentTurn = null;
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

  getCurrentTurn(): CopilotTurnHandle | null {
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

  send(prompt: string): CopilotTurnHandle {
    if (this._currentTurn) {
      throw new Error('A turn is already in flight. Call interrupt() first or await turn.done.');
    }
    const turnId = randomUUID();
    const initial: CopilotTurnSnapshot = {
      turnId,
      status: 'running',
      text: '',
      reasoningText: '',
      toolCalls: [],
      usage: null,
      startedAt: Date.now(),
      endedAt: null,
      error: null,
    };
    const handle = new CopilotTurnHandle(initial);
    this._currentTurn = handle;
    this.setStatus('running');

    // Wire SDK events → handle updates + client events. Microtask so callers can subscribe first.
    queueMicrotask(() => this.runTurn(prompt, handle).catch(err => {
      this.emit('error', err);
    }));

    return handle;
  }

  async sendMessage(text: string): Promise<void> {
    const turn = this.send(text);
    await turn.done;
  }

  queueMessage(text: string): void {
    if (this._status === 'running') {
      this._messageQueue.push(text);
    } else {
      this.sendMessage(text).catch(err => this.emit('error', err));
    }
  }

  private async runTurn(prompt: string, handle: CopilotTurnHandle): Promise<void> {
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
      // sendAndWait returns AssistantMessageEvent | undefined; content is at response.data.content
      const response = await session.sendAndWait({ prompt });
      const finalText = handle.current().text || response?.data?.content || response?.content || '';
      const finalSnapshot: CopilotTurnSnapshot = {
        ...handle.current(),
        text: finalText,
        status: 'completed',
        endedAt: Date.now(),
      };
      handle.complete(finalSnapshot);
      this.emit('result', finalSnapshot);
      this._history.push(finalSnapshot);
    } catch (err: any) {
      // If handle was already terminated (e.g., via interrupt()), skip re-failing and re-emitting.
      if (handle.current().status !== 'error') {
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
      this.setStatus(handle.current().status === 'error' ? 'error' : 'idle');
      this.processNextQueued();
    }
  }

  private handleSdkEvent(event: any, handle: CopilotTurnHandle): void {
    if (!event || typeof event !== 'object') return;
    const type = event.type;

    switch (type) {
      case 'assistant.streaming_delta':
      case 'assistant.message_delta': {
        const delta = event.delta ?? event.text ?? '';
        if (delta) {
          const snapshot: CopilotTurnSnapshot = { ...handle.current(), text: handle.current().text + delta };
          handle.push({ kind: 'output', delta, snapshot });
          this.emit('output_delta', delta);
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
      void this.sendMessage(next).catch(err => this.emit('error', err));
    }
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
}
