/**
 * Provider-agnostic turn handle contract. Both ClaudeTurnHandle and
 * CopilotTurnHandle implement this. Provider-specific extensions
 * (e.g. open-request methods on Claude) live on the concrete classes.
 */
export interface TurnHandleBase<TSnapshot, TUpdate> {
  /** Async iterator yielding live updates as the turn progresses. */
  updates(): AsyncIterableIterator<TUpdate>;

  /** Latest snapshot of turn state. Cheap to call repeatedly. */
  current(): TSnapshot;

  /** Per-turn update history (already-emitted updates). */
  history(): TUpdate[];

  /** Resolves with the final snapshot when the turn completes. Rejects on turn error. */
  done: Promise<TSnapshot>;
}
