import type { TurnHandleBase } from '../turn-handle.js';
import type { CopilotTurnSnapshot, CopilotTurnUpdate } from './types.js';

/**
 * In-memory turn handle. Buffers updates so late subscribers see the full stream.
 * Internal. Adapter calls push()/complete()/fail(); consumers read updates()/done.
 */
export class CopilotTurnHandle implements TurnHandleBase<CopilotTurnSnapshot, CopilotTurnUpdate> {
  private _snapshot: CopilotTurnSnapshot;
  private _history: CopilotTurnUpdate[] = [];
  private _resolvers: Array<(value: IteratorResult<CopilotTurnUpdate>) => void> = [];
  private _terminated = false;
  private _doneResolve!: (s: CopilotTurnSnapshot) => void;
  private _doneReject!: (err: Error) => void;

  readonly done: Promise<CopilotTurnSnapshot>;

  constructor(initial: CopilotTurnSnapshot) {
    this._snapshot = initial;
    this.done = new Promise((res, rej) => {
      this._doneResolve = res;
      this._doneReject = rej;
    });
  }

  current(): CopilotTurnSnapshot {
    return this._snapshot;
  }

  history(): CopilotTurnUpdate[] {
    return this._history.slice();
  }

  /** Internal: adapter pushes a non-terminal update. */
  push(update: CopilotTurnUpdate): void {
    if (this._terminated) return;
    this._snapshot = update.snapshot;
    this._history.push(update);
    const r = this._resolvers.shift();
    if (r) r({ value: update, done: false });
  }

  /** Internal: adapter signals successful completion. */
  complete(finalSnapshot: CopilotTurnSnapshot): void {
    if (this._terminated) return;
    this._snapshot = finalSnapshot;
    const finalUpdate: CopilotTurnUpdate = { kind: 'result', snapshot: finalSnapshot };
    this._history.push(finalUpdate);
    const r = this._resolvers.shift();
    if (r) r({ value: finalUpdate, done: false });
    this._terminated = true;
    while (this._resolvers.length) this._resolvers.shift()!({ value: undefined as any, done: true });
    this._doneResolve(finalSnapshot);
  }

  /** Internal: adapter signals failure. */
  fail(error: Error): void {
    if (this._terminated) return;
    const errSnapshot: CopilotTurnSnapshot = {
      ...this._snapshot,
      status: 'error',
      endedAt: Date.now(),
      error: { name: error.name, message: error.message },
    };
    this._snapshot = errSnapshot;
    const errUpdate: CopilotTurnUpdate = { kind: 'error', error, snapshot: errSnapshot };
    this._history.push(errUpdate);
    const r = this._resolvers.shift();
    if (r) r({ value: errUpdate, done: false });
    this._terminated = true;
    while (this._resolvers.length) this._resolvers.shift()!({ value: undefined as any, done: true });
    this._doneReject(error);
  }

  updates(): AsyncIterableIterator<CopilotTurnUpdate> {
    let cursor = 0;
    const self = this;
    return {
      [Symbol.asyncIterator]() { return this; },
      async next(): Promise<IteratorResult<CopilotTurnUpdate>> {
        if (cursor < self._history.length) {
          return { value: self._history[cursor++], done: false };
        }
        if (self._terminated) return { value: undefined as any, done: true };
        return new Promise(resolve => {
          self._resolvers.push((res) => {
            if (!res.done) cursor = self._history.length;
            resolve(res);
          });
        });
      },
    };
  }
}
