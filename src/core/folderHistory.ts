import { parentFolder, renamedPath, type FolderRename } from "./sorting";

/**
 * The Folders a mode has visited in the Photo pane, like a web browser's history: `steps[index]`
 * is the current Folder ("" is the Library root), with back steps before it and forward steps after.
 */
export interface FolderHistory {
  readonly steps: readonly string[];
  readonly index: number;
}

export const START_FOLDER_HISTORY: FolderHistory = { steps: [""], index: 0 };

export function currentFolder({ steps, index }: FolderHistory): string {
  return steps[index];
}

/** Opens `folder`, dropping any forward steps. Opening the current Folder adds no step. */
export function visitFolder(history: FolderHistory, folder: string): FolderHistory {
  if (folder === currentFolder(history)) return history;
  return { steps: [...history.steps.slice(0, history.index + 1), folder], index: history.index + 1 };
}

/** Whether there is a step back (-1) or forward (1). */
export function canStepFolder({ steps, index }: FolderHistory, direction: 1 | -1): boolean {
  return index + direction >= 0 && index + direction < steps.length;
}

export function stepFolder(history: FolderHistory, direction: 1 | -1): FolderHistory {
  return canStepFolder(history, direction) ? { ...history, index: history.index + direction } : history;
}

/**
 * Fits the history to the Folders found by a rescan. A missing current Folder falls back to its
 * nearest existing parent in place; if a back or forward step is missing, only the current Folder is kept.
 * `fellBackFrom` names the current Folder when it had to fall back.
 */
export function historyAfterRescan(history: FolderHistory, folders: readonly string[]): { history: FolderHistory; fellBackFrom: string | null } {
  const exists = (folder: string) => folder === "" || folders.includes(folder);
  const current = currentFolder(history);
  let fallback = current;
  while (!exists(fallback)) fallback = parentFolder(fallback);
  const fellBackFrom = fallback === current ? null : current;
  if (history.steps.some((folder, index) => index !== history.index && !exists(folder))) {
    return { history: { steps: [fallback], index: 0 }, fellBackFrom };
  }
  if (fellBackFrom === null) return { history, fellBackFrom };
  return { history: { ...history, steps: history.steps.map((folder, index) => index === history.index ? fallback : folder) }, fellBackFrom };
}

/** Clears the history if it includes the renamed Folder or anything under it; the current Folder follows the rename. */
export function historyAfterRename(history: FolderHistory, rename: FolderRename): FolderHistory {
  if (history.steps.every((folder) => renamedPath(folder, rename) === undefined)) return history;
  const current = currentFolder(history);
  return { steps: [renamedPath(current, rename) ?? current], index: 0 };
}
