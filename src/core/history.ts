/** A session's undo history: earlier states to undo to, and undone states to redo. */
export interface UndoHistory<T> {
  readonly past: readonly T[];
  readonly future: readonly T[];
  /** The group the latest change belongs to; further changes in it extend that step. */
  readonly group?: string;
}

export function emptyHistory<T>(): UndoHistory<T> {
  return { past: [], future: [] };
}

/**
 * Records the state a change replaced. Consecutive changes with the same `group`, such as typing
 * in one Text Slot, form one step. A new change discards anything that could be redone.
 */
export function recordChange<T>(history: UndoHistory<T>, previous: T, group?: string): UndoHistory<T> {
  if (group !== undefined && history.group === group) return { ...history, future: [] };
  return { past: [...history.past, previous], future: [], group };
}

/** Makes the next change a new step, even if it is in the same group. */
export function endGroup<T>(history: UndoHistory<T>): UndoHistory<T> {
  return history.group === undefined ? history : { past: history.past, future: history.future };
}

export function canUndo(history: UndoHistory<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: UndoHistory<unknown>): boolean {
  return history.future.length > 0;
}

/** Steps back from `present`; null when there is nothing to undo. */
export function undo<T>(history: UndoHistory<T>, present: T): { history: UndoHistory<T>; state: T } | null {
  if (!canUndo(history)) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [present, ...history.future] },
    state: history.past.at(-1)!,
  };
}

/** Steps forward from `present`; null when there is nothing to redo. */
export function redo<T>(history: UndoHistory<T>, present: T): { history: UndoHistory<T>; state: T } | null {
  if (!canRedo(history)) return null;
  return {
    history: { past: [...history.past, present], future: history.future.slice(1) },
    state: history.future[0],
  };
}

export type HistoryDirection = "undo" | "redo";

/** Undoes or redoes one step from `present`; null when there is nothing to step to. */
export function stepHistory<T>(history: UndoHistory<T>, present: T, direction: HistoryDirection): { history: UndoHistory<T>; state: T } | null {
  return direction === "undo" ? undo(history, present) : redo(history, present);
}
