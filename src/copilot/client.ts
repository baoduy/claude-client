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
import type { AICliCapabilities, SendInput, ContentBlock } from '../unified/index.js';
import { UnsupportedContentError } from '../unified/index.js';

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
    richContent: false,
    setModel: false,
    setPermissionMode: false,
    setMaxThinkingTokens: false,
    listSupportedModels: false,
  };

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
   * Flatten a `SendInput` to a plain text prompt suitable for the Copilot SDK.
   *
   * - `string` — passed through unchanged.
   * - `{ text }` — unwrapped.
   * - `{ content: [...] }` — text blocks are concatenated; non-text blocks
   *   (e.g. images) cause a synchronous `UnsupportedContentError` carrying
   *   the offending block and its index. The pre-scan happens before any
   *   side effects so callers can retry with corrected input.
   *
   * Empty `content: []` arrays throw as well — there is no text to send.
   */
  private _flattenSendInput(input: SendInput): string {
    if (typeof input === 'string') return input;
    if ('text' in input) return input.text;

    if (input.content.length === 0) {
      throw new UnsupportedContentError(
        'copilot',
        { type: 'text', text: '' } as ContentBlock,
        0,
      );
    }

    let out = '';
    for (let i = 0; i < input.content.length; i++) {
      const block = input.content[i];
      if (block.type !== 'text') {
        throw new UnsupportedContentError('copilot', block, i);
      }
      out += block.text;
    }
    return out;
  }

  send(input: SendInput): CopilotTurnHandle {
    const prompt = this._flattenSendInput(input);
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
    queueMicrotask(() => this.runTurn(prompt, handle).catch(err => {
      this.emit('error', err);
    }));

    return handle;
  }

  sendMessage(input: SendInput): Promise<void> {
    // Note: not `async`. Validation runs synchronously so bad input throws
    // before the Promise is constructed. send() pre-scans content blocks
    // and throws UnsupportedContentError if any are not text.
    const turn = this.send(input);
    return turn.done.then(() => undefined);
  }

  queueMessage(input: SendInput): void {
    // Pre-scan synchronously so bad input fails fast even when queued.
    const prompt = this._flattenSendInput(input);
    if (this._status === 'running') {
      this._messageQueue.push(prompt);
    } else {
      this.sendMessage(prompt).catch(err => this.emit('error', err));
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
