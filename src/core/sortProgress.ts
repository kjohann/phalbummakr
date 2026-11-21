import { parentFolder, renamedPath, type FolderRename, type PhotoCopy, type PhotoMove } from "./sorting";

/** Where the user was in a Folder in Sort mode. */
export interface FolderPosition {
  /** The Photo grid's scroll offset in pixels. */
  scrollTop: number;
  /** The last of the Folder's Photos shown in the work area. */
  shown: string | null;
}

/** How far Sorting has come in a Library: its Reviewed Photos and where the user was in each Folder. */
export interface SortProgress {
  /** Library-relative paths of the Reviewed Photos. */
  reviewed: ReadonlySet<string>;
  /** By Folder ("" is the Library root). */
  positions: ReadonlyMap<string, FolderPosition>;
}

export const EMPTY_SORT_PROGRESS: SortProgress = { reviewed: new Set(), positions: new Map() };

const START_POSITION: FolderPosition = { scrollTop: 0, shown: null };

/** Marks or unmarks Photos as reviewed; returns `progress` itself when nothing changes. */
export function setReviewed(progress: SortProgress, photos: readonly string[], reviewed: boolean): SortProgress {
  if (photos.every((photo) => progress.reviewed.has(photo) === reviewed)) return progress;
  const next = new Set(progress.reviewed);
  for (const photo of photos) {
    if (reviewed) next.add(photo);
    else next.delete(photo);
  }
  return { ...progress, reviewed: next };
}

/** The grid tile `photo` and every Photo before it, or nothing if it isn't in `grid`. */
export function photosUpTo(grid: readonly string[], photo: string): string[] {
  const index = grid.indexOf(photo);
  return index < 0 ? [] : grid.slice(0, index + 1);
}

function withPosition(progress: SortProgress, folder: string, change: Partial<FolderPosition>): SortProgress {
  const current = progress.positions.get(folder) ?? START_POSITION;
  const next = { ...current, ...change };
  if (next.scrollTop === current.scrollTop && next.shown === current.shown && progress.positions.has(folder)) return progress;
  return { ...progress, positions: new Map(progress.positions).set(folder, next) };
}

/** Photos shown in the work area become reviewed, and each becomes its Folder's last shown Photo. */
export function showInProgress(progress: SortProgress, shown: readonly string[]): SortProgress {
  let next = setReviewed(progress, shown, true);
  for (const photo of shown) next = withPosition(next, parentFolder(photo), { shown: photo });
  return next;
}

export function rememberScroll(progress: SortProgress, folder: string, scrollTop: number): SortProgress {
  return withPosition(progress, folder, { scrollTop });
}

/** Reviewed marks follow Photos moved in the app; a moved Photo is no longer its old Folder's shown Photo. */
export function progressAfterMove(progress: SortProgress, moves: readonly PhotoMove[]): SortProgress {
  const marked = moves.filter(({ from }) => progress.reviewed.has(from));
  let next = setReviewed(progress, marked.map(({ from }) => from), false);
  next = setReviewed(next, marked.map(({ to }) => to), true);
  const moved = new Set(moves.map(({ from }) => from));
  for (const [folder, position] of next.positions) {
    if (position.shown !== null && moved.has(position.shown)) next = withPosition(next, folder, { shown: null });
  }
  return next;
}

export function progressAfterCopy(progress: SortProgress, copies: readonly PhotoCopy[]): SortProgress {
  const reviewed = copies.filter(({ from }) => progress.reviewed.has(from)).map(({ to }) => to);
  const unreviewed = copies.filter(({ from }) => !progress.reviewed.has(from)).map(({ to }) => to);
  return setReviewed(setReviewed(progress, reviewed, true), unreviewed, false);
}

/** Reviewed marks and positions inside a renamed Folder follow it. */
export function progressAfterRename(progress: SortProgress, rename: FolderRename): SortProgress {
  const follow = (path: string) => renamedPath(path, rename) ?? path;
  const affected = (path: string) => renamedPath(path, rename) !== undefined;
  if (![...progress.reviewed].some(affected) && ![...progress.positions.keys()].some(affected)) return progress;
  return {
    reviewed: new Set([...progress.reviewed].map(follow)),
    positions: new Map([...progress.positions].map(([folder, { scrollTop, shown }]) =>
      [follow(folder), { scrollTop, shown: shown === null ? null : follow(shown) }])),
  };
}

/** Forgets Photos and Folders that a rescan no longer finds, such as ones changed outside the app. */
export function progressAfterRescan(progress: SortProgress, photos: readonly string[], folders: readonly string[]): SortProgress {
  const scannedPhotos = new Set(photos);
  const scannedFolders = new Set(["", ...folders]);
  const reviewed = [...progress.reviewed].filter((photo) => scannedPhotos.has(photo));
  const positions = [...progress.positions].filter(([folder]) => scannedFolders.has(folder));
  if (reviewed.length === progress.reviewed.size && positions.length === progress.positions.size) return progress;
  return { reviewed: new Set(reviewed), positions: new Map(positions) };
}

export function serializeSortProgress({ reviewed, positions }: SortProgress): string {
  return JSON.stringify({
    reviewed: [...reviewed].sort(),
    folders: Object.fromEntries([...positions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  }, null, 2);
}

/**
 * Reads saved progress, or empty progress without a file. Progress is a convenience, so anything
 * unreadable is skipped rather than refused.
 */
export function readSortProgress(json: string | null): SortProgress {
  let data: unknown;
  try {
    data = json === null ? null : JSON.parse(json);
  } catch {
    return EMPTY_SORT_PROGRESS;
  }
  if (typeof data !== "object" || data === null) return EMPTY_SORT_PROGRESS;
  const { reviewed, folders } = data as { reviewed?: unknown; folders?: unknown };
  const positions = new Map<string, FolderPosition>();
  if (typeof folders === "object" && folders !== null) {
    for (const [folder, value] of Object.entries(folders)) {
      const { scrollTop, shown } = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof FolderPosition, unknown>>;
      positions.set(folder, {
        scrollTop: typeof scrollTop === "number" && Number.isFinite(scrollTop) && scrollTop >= 0 ? scrollTop : 0,
        shown: typeof shown === "string" ? shown : null,
      });
    }
  }
  return {
    reviewed: new Set(Array.isArray(reviewed) ? reviewed.filter((path): path is string => typeof path === "string") : []),
    positions,
  };
}

/** Stores a Library's Sort progress in its `.phalbummakr/` folder. */
export interface SortProgressPorts {
  /** The saved progress, or null when none was saved yet. */
  read(root: string): Promise<string | null>;
  /** Creates `.phalbummakr/` when it is missing. */
  write(root: string, json: string): Promise<void>;
}
