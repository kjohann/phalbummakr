/** The Photos shown large in Sort mode: one Photo, or a Comparison of up to four. */
export interface Comparison {
  /** Library-relative paths, in the order they were added. */
  shown: readonly string[];
  /** The shown Photos chosen for sending to a Folder. A single shown Photo counts as chosen regardless. */
  chosen: readonly string[];
}

export const EMPTY_COMPARISON: Comparison = { shown: [], chosen: [] };
export const MAX_COMPARED = 4;

/** Shows one Photo on its own, replacing any Comparison. */
export function showPhoto(photo: string): Comparison {
  return { shown: [photo], chosen: [] };
}

export function canAddToComparison({ shown }: Comparison): boolean {
  return shown.length < MAX_COMPARED;
}

/** Removes Photos from what is shown, such as ones no longer in the Library. */
export function withoutPhotos(comparison: Comparison, removed: readonly string[]): Comparison {
  const { shown, chosen } = comparison;
  if (!shown.some((photo) => removed.includes(photo))) return comparison;
  return { shown: shown.filter((photo) => !removed.includes(photo)), chosen: chosen.filter((photo) => !removed.includes(photo)) };
}

/** Adds a Photo to the shown ones, or removes it if it is shown. Adding to a full Comparison does nothing. */
export function toggleComparison(comparison: Comparison, photo: string): Comparison {
  if (comparison.shown.includes(photo)) return withoutPhotos(comparison, [photo]);
  return canAddToComparison(comparison) ? { ...comparison, shown: [...comparison.shown, photo] } : comparison;
}

/** Chooses or unchooses a compared Photo. A Photo shown on its own is always chosen. */
export function toggleChosen(comparison: Comparison, photo: string): Comparison {
  const { shown, chosen } = comparison;
  if (shown.length < 2 || !shown.includes(photo)) return comparison;
  return { shown, chosen: chosen.includes(photo) ? chosen.filter((path) => path !== photo) : [...chosen, photo] };
}

/** Shows the next (1) or previous (-1) Photo in `grid` instead of a Photo shown on its own. */
export function stepPhoto(comparison: Comparison, grid: readonly string[], step: 1 | -1): Comparison {
  if (comparison.shown.length !== 1) return comparison;
  const index = grid.indexOf(comparison.shown[0]);
  const next = index < 0 ? undefined : grid[index + step];
  return next === undefined ? comparison : showPhoto(next);
}

/**
 * Drops moved Photos from what is shown. When the only shown Photo moved, the next Photo
 * left in `grid` (the grid before the move) is shown instead, or the previous one at the end.
 */
export function afterMove(comparison: Comparison, moved: readonly string[], grid: readonly string[]): Comparison {
  const { shown } = comparison;
  if (!shown.some((photo) => moved.includes(photo))) return comparison;
  if (shown.length === 1) {
    const index = grid.indexOf(shown[0]);
    const remaining = (photo: string) => !moved.includes(photo);
    const next = index < 0 ? undefined
      : grid.slice(index + 1).find(remaining) ?? grid.slice(0, index).reverse().find(remaining);
    return next === undefined ? EMPTY_COMPARISON : showPhoto(next);
  }
  return withoutPhotos(comparison, moved);
}

/** The Photos "Send to Folder" moves. */
export function chosenPhotos({ shown, chosen }: Comparison): string[] {
  return shown.length === 1 ? [...shown] : shown.filter((photo) => chosen.includes(photo));
}
