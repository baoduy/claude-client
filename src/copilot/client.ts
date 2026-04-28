import { EventEmitter } from 'events';
import { CopilotTransport } from './transport.js';
import { GhCopilotClient } from './sdk.js';
import type {
  CopilotClientConfig,
  CopilotStatus,
  CopilotPendingAction,
  CopilotTurnSnapshot,
} from './types.js';
import type { CopilotTurnHandle } from './turn-handle.js';

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

export class CopilotClient extends EventEmitter {
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

  // send / sendMessage / queueMessage / interrupt arrive in Task C7+.
}
