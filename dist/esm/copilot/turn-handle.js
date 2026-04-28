/**
 * In-memory turn handle. Buffers updates so late subscribers see the full stream.
 * Internal. Adapter calls push()/complete()/fail(); consumers read updates()/done.
 */
export class CopilotTurnHandle {
    _snapshot;
    _history = [];
    _resolvers = [];
    _terminated = false;
    _doneResolve;
    _doneReject;
    done;
    constructor(initial) {
        this._snapshot = initial;
        this.done = new Promise((res, rej) => {
            this._doneResolve = res;
            this._doneReject = rej;
        });
    }
    current() {
        return this._snapshot;
    }
    history() {
        return this._history.slice();
    }
    /** Internal: adapter pushes a non-terminal update. */
    push(update) {
        if (this._terminated)
            return;
        this._snapshot = update.snapshot;
        this._history.push(update);
        const r = this._resolvers.shift();
        if (r)
            r({ value: update, done: false });
    }
    /** Internal: adapter signals successful completion. */
    complete(finalSnapshot) {
        if (this._terminated)
            return;
        this._snapshot = finalSnapshot;
        const finalUpdate = { kind: 'result', snapshot: finalSnapshot };
        this._history.push(finalUpdate);
        const r = this._resolvers.shift();
        if (r)
            r({ value: finalUpdate, done: false });
        this._terminated = true;
        while (this._resolvers.length)
            this._resolvers.shift()({ value: undefined, done: true });
        this._doneResolve(finalSnapshot);
    }
    /** Internal: adapter signals failure. */
    fail(error) {
        if (this._terminated)
            return;
        const errSnapshot = {
            ...this._snapshot,
            status: 'error',
            endedAt: Date.now(),
            error: { name: error.name, message: error.message },
        };
        this._snapshot = errSnapshot;
        const errUpdate = { kind: 'error', error, snapshot: errSnapshot };
        this._history.push(errUpdate);
        const r = this._resolvers.shift();
        if (r)
            r({ value: errUpdate, done: false });
        this._terminated = true;
        while (this._resolvers.length)
            this._resolvers.shift()({ value: undefined, done: true });
        this._doneReject(error);
    }
    updates() {
        let cursor = 0;
        const self = this;
        return {
            [Symbol.asyncIterator]() { return this; },
            async next() {
                if (cursor < self._history.length) {
                    return { value: self._history[cursor++], done: false };
                }
                if (self._terminated)
                    return { value: undefined, done: true };
                return new Promise(resolve => {
                    self._resolvers.push((res) => {
                        if (!res.done)
                            cursor = self._history.length;
                        resolve(res);
                    });
                });
            },
        };
    }
}
