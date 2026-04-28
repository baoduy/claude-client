import type { TurnHandleBase } from '../turn-handle.js';
import type { CopilotTurnSnapshot, CopilotTurnUpdate } from './types.js';
/**
 * In-memory turn handle. Buffers updates so late subscribers see the full stream.
 * Internal. Adapter calls push()/complete()/fail(); consumers read updates()/done.
 */
export declare class CopilotTurnHandle implements TurnHandleBase<CopilotTurnSnapshot, CopilotTurnUpdate> {
    private _snapshot;
    private _history;
    private _resolvers;
    private _terminated;
    private _doneResolve;
    private _doneReject;
    readonly done: Promise<CopilotTurnSnapshot>;
    constructor(initial: CopilotTurnSnapshot);
    current(): CopilotTurnSnapshot;
    history(): CopilotTurnUpdate[];
    /** Internal: adapter pushes a non-terminal update. */
    push(update: CopilotTurnUpdate): void;
    /** Internal: adapter signals successful completion. */
    complete(finalSnapshot: CopilotTurnSnapshot): void;
    /** Internal: adapter signals failure. */
    fail(error: Error): void;
    updates(): AsyncIterableIterator<CopilotTurnUpdate>;
}
