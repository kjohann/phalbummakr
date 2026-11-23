import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  afterMove, canStepFolder, clearFolderReviewed, currentFolder, EMPTY_COMPARISON, folderNameProblem, folderRenameProblem,
  contentPhotoUsage, historyAfterRename, historyAfterRescan, isProtectedFolder, parentFolder, photosUpTo, progressAfterCopy, progressAfterMove, progressAfterRename, progressAfterRescan, usageForPhoto,
  rememberScroll, renamedPath, scanAfterMove, setReviewed, showInProgress, showPhoto, START_FOLDER_HISTORY, stepFolder, stepPhoto,
  photosActedOn, toggleComparison, toggleSelected, visitFolder, withoutPhotos,
  type Album, type Comparison, type ContentIndexStats, type FolderHistory, type FolderRename, type Photo, type PhotoCopy, type PhotoIdentity, type PhotoMove, type PhotoPane, type PhotoScan, type PhotoUsageState, type ZoomChange,
} from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { folderExists } from "./tauriSortingPorts";
import { useSortProgress } from "./useSortProgress";
import { hasPhotoDrag, leftElement, readPhotoDrag, writePhotoDragImage, writePhotoDrag, type PhotoDragStart } from "./photoDrag";
import { useEdgeScroll } from "./edgeScroll";
import SortView from "./SortView";
import UsageBadge from "./UsageBadge";
import { usePhotoIdentities } from "./usePhotoIdentities";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import SendToFolderDialog from "./SendToFolderDialog";
import FolderNameDialog from "./FolderNameDialog";
import ModalDialog from "./ModalDialog";

/** Sort mode's command bar commands that act on the Comparison. */
export type SortCommandName = "clear-comparison";

/** Connects the Photo grid to Sort mode's work area and command bar. */
export interface SortLink {
  /** Where the shown Photos are rendered. */
  host: HTMLElement | null;
  /** Whether Sort mode is the current mode: grid clicks and arrow keys only act then. */
  active: boolean;
  /** A command from the command bar; each new serial runs it once. */
  command?: { name: SortCommandName; serial: number };
  /** Reports how many Photos are shown. */
  onComparisonChange: (counts: { shown: number }) => void;
  /** How much the work area is zoomed, 1 being 100%. */
  zoom?: number;
  /** Ctrl+wheel or pinching over the work area changes the zoom. */
  onZoomChange?: (change: ZoomChange) => void;
}

/** What a click on a Photo in the grid does, given whether Ctrl (or ⌘) was held. */
type PhotoClick = (photo: string, event: ReactMouseEvent) => void;

/**
 * A right-click menu: for a Photo in the grid or in Sort mode's work area, for a folder tile,
 * or for empty grid space, where `path` is the current Folder.
 */
interface PhotoMenu {
  path: string;
  where: PhotoPane | "folder" | "space";
  x: number;
  y: number;
}

/** Whose current Folder and history the Photo pane shows. */
export type PhotoPaneMode = "album" | "sort";

type FolderPlaces = Record<PhotoPaneMode, { history: FolderHistory; notice: string | null }>;
const START_PLACES: FolderPlaces = {
  album: { history: START_FOLDER_HISTORY, notice: null },
  sort: { history: START_FOLDER_HISTORY, notice: null },
};

function mapPlaces(places: FolderPlaces, change: (place: FolderPlaces[PhotoPaneMode]) => FolderPlaces[PhotoPaneMode]): FolderPlaces {
  return { album: change(places.album), sort: change(places.sort) };
}

/** A dialog asking for a Folder name: a new Folder inside `parent`, or a new name for `folder`. */
type FolderNaming = { kind: "create"; parent: string } | { kind: "rename"; folder: string };

/** Props that make a folder tile or breadcrumb a drop target while a Photo is dragged from the grid. */
type FolderDrop = (folder: string) => {
  className?: string;
  onDragOver?: (event: DragEvent) => void;
  onDragLeave?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
};

type EdgeScroll = ReturnType<typeof useEdgeScroll>;

function withClass(base: string | undefined, extra: string | undefined) {
  return [base, extra].filter(Boolean).join(" ") || undefined;
}

/** Folder area rows are shorter than Photo rows, but its columns line up with the grid's. */
const GRID = {
  regular: { rowHeight: 160, folderRowHeight: 96, columnWidth: 140 },
  compact: { rowHeight: 68, folderRowHeight: 68, columnWidth: 76 },
};
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});

const NO_PHOTOS: ReadonlySet<string> = new Set();

function PhotoThumbnail({ root, photo, generation, usage, compact, onDragStart, onDragEnd, shown, reviewed, moving, onClick, onContextMenu }: {
  root: string; photo: Photo; generation: number; usage: PhotoUsageState; compact: boolean; onDragStart: PhotoDragStart; onDragEnd: () => void;
  shown: boolean; reviewed: boolean; moving: boolean; onClick?: PhotoClick; onContextMenu?: PhotoClick;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    // A rescan only retries failed thumbnails; one already shown stays as it is.
    const key = `${root}\0${photo.path}\0${photo.revision}`;
    if (loaded.current === key) return;
    const controller = new AbortController();
    setSource(null);
    setError(null);
    tauriPhotoPorts.thumbnail(root, photo, controller.signal)
      .then((source) => {
        if (controller.signal.aborted) return;
        loaded.current = key;
        setSource(source);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(String(cause));
      });
    return () => controller.abort();
  }, [root, photo, generation]);

  const name = photo.path.split("/").pop()!;
  const className = ["photo-tile", shown && "photo-tile--shown", moving && "photo-tile--busy"].filter(Boolean).join(" ");
  return (
    <figure className={className} title={`${photo.path}\n${photo.width} x ${photo.height} pixels`} aria-busy={moving || undefined}
      onClick={onClick && !moving ? (event) => onClick(photo.path, event) : undefined}
      onContextMenu={onContextMenu && ((event) => { event.preventDefault(); if (!moving) onContextMenu(photo.path, event); })}
      draggable={!moving} onDragStart={(event) => {
        writePhotoDrag(event.dataTransfer, photo, source ?? undefined);
        onDragStart(photo.path, event);
        void tauriPhotoPorts.prewarmPreview(root, photo).catch(() => undefined);
      }} onDragEnd={onDragEnd}>
      <div className="photo-preview">
        {source && <img src={source} alt={name} loading="lazy" decoding="async" draggable={false} />}
        {!source && !error && <span className="photo-placeholder">{compact ? "…" : "Loading..."}</span>}
        {error && <span className="photo-failure" role="alert" title={error}>{compact ? "!" : "Thumbnail unavailable. Rescan to retry."}</span>}
        <UsageBadge usage={usage} />
        {reviewed && <span className="photo-reviewed" aria-label="Reviewed" title="Reviewed">✓</span>}
        {moving && <span className="photo-busy" aria-hidden="true" />}
      </div>
      {!compact && <figcaption>
        <span className="photo-name">{name}</span>
        <time dateTime={new Date(photo.captureDate).toISOString()}>{dateFormat.format(photo.captureDate)}</time>
      </figcaption>}
    </figure>
  );
}

function FolderTile({ path, count, compact, onOpen, onContextMenu, drop }: {
  path: string; count: number; compact: boolean; onOpen: (path: string) => void; onContextMenu: PhotoClick; drop: FolderDrop;
}) {
  const name = path.split("/").pop();
  const target = drop(path);
  const countId = useId();
  const formattedCount = count.toLocaleString();
  return (
    <button type="button" title={path} aria-label={`Open folder ${name}`} aria-describedby={countId} onClick={() => onOpen(path)}
      onContextMenu={(event) => { event.preventDefault(); onContextMenu(path, event); }}
      {...target} className={withClass("folder-tile", target.className)}>
      <span className="photo-preview">
        <svg width="48" height="40" viewBox="0 0 48 40" fill="none" aria-hidden="true">
          <path d="M3 9V5h16l5 5h21v26H3V9Z" fill="currentColor" />
        </svg>
        <span id={countId} className="folder-photo-count" title="Photos in this Folder and its subfolders">
          {formattedCount}<span className="folder-photo-count-description"> Photos in this Folder and its subfolders</span>
        </span>
        {compact && <span className="photo-name">{name}</span>}
      </span>
      {!compact && <span className="photo-name">{name}</span>}
    </button>
  );
}

/** Opens the empty-space menu, unless a tile handled the right-click itself. */
function spaceMenu(onSpaceContextMenu: (event: ReactMouseEvent) => void) {
  return (event: ReactMouseEvent) => {
    if (event.defaultPrevented || (event.target instanceof Element && event.target.closest(".photo-cell, .folder-cell"))) return;
    event.preventDefault();
    onSpaceContextMenu(event);
  };
}

/** The current Folder's subfolders, pinned above the Photo grid: at most two rows, scrolling on their own. */
function FolderArea({ folders, counts, compact, onOpenFolder, drop, onFolderContextMenu, onSpaceContextMenu, edgeScroll }: {
  folders: string[];
  counts: ReadonlyMap<string, number>;
  compact: boolean;
  onOpenFolder: (folder: string) => void;
  drop: FolderDrop;
  onFolderContextMenu: PhotoClick;
  onSpaceContextMenu: (event: ReactMouseEvent) => void;
  edgeScroll: EdgeScroll;
}) {
  const { folderRowHeight: rowHeight, columnWidth } = compact ? GRID.compact : GRID.regular;
  return (
    <div className={compact ? "folder-area folder-area-compact" : "folder-area"} role="list" aria-label="Folders"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${columnWidth}px, 1fr))`, gridAutoRows: rowHeight, maxHeight: 2 * rowHeight }}
      onContextMenu={spaceMenu(onSpaceContextMenu)} {...edgeScroll}>
      {folders.map((path) => (
        <div key={path} className="folder-cell" role="listitem">
          <FolderTile path={path} count={counts.get(path) ?? 0} compact={compact} onOpen={onOpenFolder} onContextMenu={onFolderContextMenu} drop={drop} />
        </div>
      ))}
    </div>
  );
}

function PhotoGrid({ root, photos, generation, usage, compact, onDragStart, onDragEnd, dragging, shown, reviewed, moving, initialScrollTop, onScrollChange,
  onPhotoClick, onPhotoContextMenu, onSpaceContextMenu }: {
  root: string;
  photos: Photo[];
  /** Counts scans, so a rescan retries failed thumbnails. */
  generation: number;
  usage: ReadonlyMap<string, PhotoUsageState>;
  compact: boolean;
  onDragStart: PhotoDragStart;
  onDragEnd: () => void;
  dragging: boolean;
  shown: readonly string[];
  /** Reviewed Photos to mark; empty outside Sort mode. */
  reviewed: ReadonlySet<string>;
  /** Photos being moved, shown dimmed and busy. */
  moving: readonly string[];
  /** Where to scroll to once, when it is first known; undefined until then. */
  initialScrollTop?: number;
  /** Reports where the grid was scrolled to, shortly after scrolling stops and when the grid goes away. */
  onScrollChange?: (scrollTop: number) => void;
  onPhotoClick?: PhotoClick;
  onPhotoContextMenu?: PhotoClick;
  onSpaceContextMenu: (event: ReactMouseEvent) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const restored = useRef(false);
  useEffect(() => {
    const element = viewportRef.current;
    if (restored.current || initialScrollTop === undefined || viewport.height === 0 || !element) return;
    restored.current = true;
    element.scrollTop = initialScrollTop;
    setScrollTop(element.scrollTop);
  }, [initialScrollTop, viewport.height]);

  const reportScroll = useRef(onScrollChange);
  reportScroll.current = onScrollChange;
  const pendingScroll = useRef<{ timer: number; scrollTop: number } | null>(null);
  const flushScroll = useCallback(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingScroll.current = null;
    reportScroll.current?.(pending.scrollTop);
  }, []);
  useEffect(() => flushScroll, [flushScroll]);
  function scrolled(top: number) {
    setScrollTop(top);
    if (!reportScroll.current) return;
    if (pendingScroll.current) window.clearTimeout(pendingScroll.current.timer);
    pendingScroll.current = { timer: window.setTimeout(flushScroll, 250), scrollTop: top };
  }

  const { rowHeight, columnWidth } = compact ? GRID.compact : GRID.regular;
  const columns = Math.max(1, Math.floor(viewport.width / columnWidth));
  const rows = Math.ceil(photos.length / columns);
  const start = Math.max(0, Math.min(rows - 1, Math.floor(scrollTop / rowHeight)) - 2);
  const end = Math.min(rows, Math.ceil((scrollTop + viewport.height) / rowHeight) + 2);
  const visible = viewport.height > 0 ? photos.slice(start * columns, end * columns) : [];

  return (
    <div className={compact ? "photo-grid photo-grid-compact" : "photo-grid"} ref={viewportRef} aria-label="Photo grid" tabIndex={0}
      // The browser also scrolls overflow areas at drag edges, even without our edge-scroll handler.
      style={dragging ? { overflowY: "hidden" } : undefined}
      onScroll={(event) => scrolled(event.currentTarget.scrollTop)}
      // Tiles have menus of their own, or none; only empty space gets the grid's menu.
      onContextMenu={spaceMenu(onSpaceContextMenu)}>
      <div className="photo-grid-content" role="list" aria-label="Photos"
        style={{ height: rows * rowHeight }}>
        {visible.map((photo, offset) => {
          const index = start * columns + offset;
          return (
            <div key={`${photo.path}:${photo.revision}`}
              className="photo-cell" role="listitem"
              aria-posinset={index + 1} aria-setsize={photos.length}
              style={{
                top: Math.floor(index / columns) * rowHeight,
                left: `${(index % columns) * 100 / columns}%`,
                width: `${100 / columns}%`,
                height: rowHeight,
              }}>
              <PhotoThumbnail root={root} photo={photo} generation={generation} usage={usageForPhoto(usage, photo.path)}
                compact={compact} onDragStart={onDragStart} onDragEnd={onDragEnd} shown={shown.includes(photo.path)}
                reviewed={reviewed.has(photo.path)} moving={moving.includes(photo.path)}
                onClick={onPhotoClick} onContextMenu={onPhotoContextMenu} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function folderName(folder: string) {
  return folder ? folder.split("/").pop()! : "the Library";
}

/** An on/off switch whose visible label is its name. */
function Switch({ label, checked, title, disabled, onChange }: {
  label: string; checked: boolean; title?: string; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} title={title} disabled={disabled}
      onClick={() => onChange(!checked)}>
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      {label}
    </button>
  );
}

function fileName(path: string) {
  return path.split("/").pop()!;
}

function movedMessage(moves: PhotoMove[], target: string, copy: boolean) {
  const verb = copy ? "Copied" : "Moved";
  if (moves.length !== 1) {
    const renamed = moves.filter(({ from, to }) => fileName(from) !== fileName(to)).map(({ to }) => `"${fileName(to)}"`);
    return `${verb} ${moves.length} Photos to ${folderName(target)}.${copy && renamed.length ? ` Created: ${renamed.join(", ")}.` : ""}`;
  }
  const [{ from, to }] = moves;
  return fileName(from) === fileName(to) ? `${verb} "${fileName(from)}" to ${folderName(target)}.`
    : `${verb} "${fileName(from)}" to ${folderName(target)} as "${fileName(to)}".`;
}

export default function PhotoBrowser({ root, album = null, compact = false, onCompactChange, copyByDefault = false, onCopyByDefaultChange, onSendPhotos, onCopyPhotos, onCreateFolder, onRenameFolder, onPhotosChange, onIdentitiesChange, onContentIndexStatsChange, sort, mode = "album", visible = true }: {
  root: string;
  album?: Album | null;
  compact?: boolean;
  onCompactChange?: (compact: boolean) => void;
  copyByDefault?: boolean;
  onCopyByDefaultChange?: (copy: boolean) => void;
  /** Moves Photos to a Folder ("" is the Library root), returning the moves made. Without it, Folders aren't drop targets. */
  onSendPhotos?: (photos: string[], target: string) => Promise<PhotoMove[]>;
  /** Copies Photos without changing originals, Placements or Comparison selection. */
  onCopyPhotos?: (photos: string[], target: string) => Promise<PhotoCopy[]>;
  /** Creates Folder `name` inside `parent`, returning its Library-relative path, for "New Folder…". */
  onCreateFolder?: (parent: string, name: string) => Promise<string>;
  /** Renames `folder` to `name`, with everything under it, returning its new Library-relative path. */
  onRenameFolder?: (folder: string, name: string) => Promise<string>;
  /** Receives every Photo in the Library after each scan. */
  onPhotosChange?: (photos: readonly Photo[]) => void;
  onIdentitiesChange?: (identities: ReadonlyMap<string, PhotoIdentity>) => void;
  onContentIndexStatsChange?: (stats: ContentIndexStats | null) => void;
  /** Set in Sort mode, where Photos are shown large and compared. */
  sort?: SortLink;
  /** Whose current Folder and back/forward history are shown. */
  mode?: PhotoPaneMode;
  /** Whether the pane is on screen, so the mouse back/forward buttons and Alt+←/→ go back and forward. */
  visible?: boolean;
}) {
  const [comparison, setComparison] = useState<Comparison>(EMPTY_COMPARISON);
  const [menu, setMenu] = useState<PhotoMenu | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ paths: string[]; parent: string; copy: boolean } | null>(null);
  const [naming, setNaming] = useState<FolderNaming | null>(null);
  const [resetFolder, setResetFolder] = useState<{ root: string; folder: string } | null>(null);
  const [scan, setScan] = useState(0);
  const [unusedOnly, setUnusedOnly] = useState(false);
  // The Photos a drag from the grid or the work area moves; null when no such drag is running.
  const [dragged, setDragged] = useState<readonly string[] | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [altDrag, setAltDrag] = useState(false);
  const copyDrag = copyByDefault !== altDrag;
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const edgeScroll = useEdgeScroll();
  // The Photos being moved; empty when no move is running.
  const [movingPhotos, setMovingPhotos] = useState<readonly string[]>([]);
  const moving = movingPhotos.length > 0;
  const [moveMessage, setMoveMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [result, setResult] = useState<(PhotoScan & { generation: number }) | null>(null);
  const sortActive = sort?.active ?? false;
  const { progress, error: progressError, update: updateProgress } = useSortProgress(root, sortActive);
  // Each mode keeps its own place, in memory only; a new Library starts both at its root.
  const [places, setPlaces] = useState<FolderPlaces>(START_PLACES);
  const [placesRoot, setPlacesRoot] = useState(root);
  if (placesRoot !== root) {
    setPlacesRoot(root);
    setPlaces(START_PLACES);
    // The old Library's Photos would otherwise be taken for the new one's until its scan is done.
    setResult(null);
  }
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    tauriPhotoPorts.scan(root)
      .then((result) => {
        if (!active) return;
        // Photos removed outside the app leave the work area.
        const scanned = new Set(result.photos.map((photo) => photo.path));
        setComparison((current) => withoutPhotos(current, current.shown.filter((path) => !scanned.has(path))));
        setResult({ ...result, generation: scan });
        // A warning may mean a Photo was omitted, so its saved mark must remain available to reset.
        if (result.warnings.length === 0) {
          updateProgress((current) => progressAfterRescan(current, [...scanned], result.folders), { ifLoaded: true });
        }
        const fit = ({ history }: FolderPlaces[PhotoPaneMode]) => {
          const { history: next, fellBackFrom } = historyAfterRescan(history, result.folders);
          return {
            history: next,
            notice: fellBackFrom === null ? null
              : `The folder "${fellBackFrom}" is no longer available in this scan. Showing ${currentFolder(next) || "the Library root"}.`,
          };
        };
        setPlaces((current) => mapPlaces(current, fit));
      })
      .catch((cause: unknown) => {
        if (active) setError(`Could not scan the Library: ${String(cause)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [root, scan, updateProgress]);
  useEffect(() => {
    if (result) onPhotosChange?.(result.photos);
  }, [result, onPhotosChange]);
  const progressLoaded = progress !== null;
  const previouslyShown = useRef<{ root: string; photos: readonly string[] }>({ root, photos: [] });
  useEffect(() => {
    if (!progressLoaded || !sortActive || !result) return;
    const previous = new Set(previouslyShown.current.root === root ? previouslyShown.current.photos : []);
    const newlyShown = comparison.shown.filter((path) => !previous.has(path));
    previouslyShown.current = { root, photos: comparison.shown };
    if (newlyShown.length > 0) updateProgress((current) => showInProgress(current, newlyShown));
  }, [comparison.shown, progressLoaded, sortActive, root, result, updateProgress]);

  const { history, notice } = places[mode];
  const folder = result ? currentFolder(history) : "";
  const contentIndex = usePhotoIdentities(root, result?.photos ?? null, album);
  const usage = useMemo(() => contentPhotoUsage(album, contentIndex.identities), [album, contentIndex.identities]);
  useEffect(() => { onIdentitiesChange?.(contentIndex.identities); }, [contentIndex.identities, onIdentitiesChange]);
  const pendingIdentities = [...contentIndex.identities.values()].filter((identity) => identity.status === "pending").length;
  useEffect(() => {
    onContentIndexStatsChange?.(pendingIdentities === 0 ? contentIndex.stats : null);
  }, [pendingIdentities, contentIndex.stats, onContentIndexStatsChange]);
  const identityErrors = [...contentIndex.identities.values()].filter((identity) => identity.status === "error");
  const unknownMissing = [...contentIndex.identities.values()].filter((identity) => identity.status === "missing" && !identity.hash);
  const photos = result?.photos.filter((photo) => parentFolder(photo.path) === folder
    && (!unusedOnly || (usage.get(photo.path)?.status === "ready" && usage.get(photo.path)?.count === 0))) ?? [];
  const folders = result?.folders.filter((path) => parentFolder(path) === folder) ?? [];
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of result?.photos ?? []) {
      for (let parent = parentFolder(photo.path); parent; parent = parentFolder(parent)) {
        counts.set(parent, (counts.get(parent) ?? 0) + 1);
      }
    }
    return counts;
  }, [result?.photos]);
  const ancestors = folder ? folder.split("/").map((name, index, parts) => ({
    name, path: parts.slice(0, index + 1).join("/"),
  })) : [];
  function openFolder(path: string) {
    setPlaces((current) => ({ ...current, [mode]: { history: visitFolder(current[mode].history, path), notice: null } }));
  }

  /** Goes back (-1) or forward (1). A Folder gone from disk is found by a rescan, which falls back to its parent. */
  function stepFolderHistory(direction: 1 | -1) {
    if (!result || !canStepFolder(history, direction)) return;
    const next = stepFolder(history, direction);
    setPlaces((current) => ({ ...current, [mode]: { history: next, notice: null } }));
    const target = currentFolder(next);
    if (target && !result.folders.includes(target)) setScan((value) => value + 1);
    else {
      void folderExists(root, target)
        .then((exists) => { if (!exists) setScan((value) => value + 1); })
        .catch(() => undefined);
    }
  }
  const stepHistoryRef = useRef(stepFolderHistory);
  stepHistoryRef.current = stepFolderHistory;

  useEffect(() => {
    if (!visible) return;
    const blocked = () => window.document.querySelector("[aria-modal='true']") !== null;
    const key = (event: KeyboardEvent) => {
      const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!direction || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented || blocked()) return;
      event.preventDefault();
      stepHistoryRef.current(direction);
    };
    // Mouse buttons 3 and 4 are back and forward; the webview's own navigation is blocked in App.
    const mouse = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      if (!blocked()) stepHistoryRef.current(event.button === 3 ? -1 : 1);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("mouseup", mouse);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mouseup", mouse);
    };
  }, [visible]);

  useEffect(() => { setResetFolder(null); }, [root, sortActive]);
  const grid = photos.map((photo) => photo.path);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const comparisonRef = useRef(comparison);
  comparisonRef.current = comparison;

  // Opening a Folder in Sort mode brings back its last shown Photo, unless a Comparison is being built.
  const restoredFolder = useRef<{ root: string; folder: string } | null>(null);
  const hasResult = result !== null;
  useEffect(() => {
    if (!sortActive || !progress || !hasResult) return;
    if (restoredFolder.current?.root === root && restoredFolder.current.folder === folder) return;
    restoredFolder.current = { root, folder };
    const shown = progress.positions.get(folder)?.shown;
    if (shown && gridRef.current.includes(shown) && comparisonRef.current.shown.length <= 1) {
      updateProgress((current) => showInProgress(current, [shown]));
      setComparison(showPhoto(shown));
    }
  }, [sortActive, progress, hasResult, root, folder, updateProgress]);
  const shownCount = comparison.shown.length;
  const onComparisonChange = sort?.onComparisonChange;
  useEffect(() => onComparisonChange?.({ shown: shownCount }), [shownCount, onComparisonChange]);

  useEffect(() => {
    if (!sortActive) return;
    const step = (event: KeyboardEvent) => {
      const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!direction || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest(
        "input, textarea, select, [contenteditable], [role='separator'], [role='tab'], [role='menu']")) return;
      if (window.document.querySelector("[aria-modal='true']")) return;
      event.preventDefault();
      setComparison((current) => stepPhoto(current, gridRef.current, direction));
    };
    window.addEventListener("keydown", step);
    return () => window.removeEventListener("keydown", step);
  }, [sortActive]);

  function showSinglePhoto(path: string) {
    updateProgress((current) => showInProgress(current, [path]));
    setComparison(showPhoto(path));
  }

  const photoClick: PhotoClick | undefined = sortActive ? (path, event) => {
    if (event.ctrlKey || event.metaKey) setComparison((current) => toggleComparison(current, path));
    else showSinglePhoto(path);
  } : undefined;
  const openMenu = (where: PhotoMenu["where"]) => (path: string, event: ReactMouseEvent) =>
    setMenu({ path, where, x: event.clientX, y: event.clientY });
  const byPath = new Map(result?.photos.map((photo) => [photo.path, photo]));
  const shownPhotos = comparison.shown.flatMap((path) => byPath.get(path) ?? []);

  function dragChange(paths: readonly string[] | null) {
    setDragged(paths);
    setDropOver(null);
    if (!paths) setAltDrag(false);
  }

  /**
   * Like right-click, a Photo takes the Photos it goes with in its pane, but only in Sort mode, where they are
   * shown: from the grid the whole Comparison, from the Comparison the Selected Photos.
   */
  const startDrag = (pane: PhotoPane): PhotoDragStart => (path, event) => {
    const paths = sortActive ? photosActedOn(comparison, path, pane) : [path];
    const picture = event.currentTarget instanceof Element ? event.currentTarget.querySelector("img") : null;
    writePhotoDragImage(event.dataTransfer, picture);
    dragChange(paths);
    setAltDrag(event.altKey);
    setDragPoint({ x: event.clientX, y: event.clientY });
  };
  const endDrag = () => dragChange(null);

  async function send(paths: string[], target: string, copy = false) {
    const gridBefore = gridRef.current;
    // The last message stays until this move replaces it, so the grid below it doesn't jump.
    setMovingPhotos(paths);
    try {
      const operation = copy ? onCopyPhotos : onSendPhotos;
      if (!operation) throw new Error(`${copy ? "Copying" : "Moving"} Photos is unavailable.`);
      const moves = await operation(paths, target);
      if (moves.length > 0) {
        updateProgress((current) => copy ? progressAfterCopy(current, moves) : progressAfterMove(current, moves));
        // Only the new paths need records; originals remain in the scan for copies.
        let refreshError: string | null = null;
        const moved = await tauriPhotoPorts.read(root, moves.map(({ to }) => to)).catch((cause: unknown) => {
          if (copy) refreshError = ` Could not refresh copied Photos: ${String(cause)}. Rescanning the Library.`;
          return null;
        });
        setResult((current) => current && { ...scanAfterMove(current, copy ? [] : moves, moved ?? []), generation: current.generation });
        // A scan still running may have read the Library before the move, so it is replaced by a new one.
        if (!moved || loadingRef.current) setScan((value) => value + 1);
        const skipped = paths.length - moves.length;
        setMoveMessage({ text: movedMessage(moves, target, copy)
          + (copy && skipped > 0 ? ` Skipped ${skipped} Photo(s) already in ${folderName(target)}.` : "")
          + (refreshError ?? ""), failed: refreshError !== null });
        if (!copy) setComparison((current) => afterMove(current, moves.map(({ from }) => from), gridBefore));
      }
    } catch (cause) {
      const what = paths.length === 1 ? `"${fileName(paths[0])}"` : `${paths.length} Photos`;
      setMoveMessage({ text: `Could not ${copy ? "copy" : "move"} ${what}: ${cause instanceof Error ? cause.message : String(cause)}`, failed: true });
    } finally {
      setMovingPhotos([]);
    }
  }

  function addFolder(path: string) {
    setResult((current) => current && !current.folders.includes(path)
      ? { ...current, folders: [...current.folders, path].sort() } : current);
  }

  /** The Folders `paths` can be sent to, nested as in the Library, each with "New Folder…" inside it. */
  const sendTargets = result?.folders.filter((path) => !isProtectedFolder(path)) ?? [];
  const isAllIn = (paths: readonly string[]) => (target: string) => paths.every((path) => parentFolder(path) === target);
  function sendToFolderItems(paths: string[], copy: boolean): MenuItem[] {
    const unavailable = !(copy ? onCopyPhotos : onSendPhotos) || moving;
    const alreadyIn = isAllIn(paths);
    const level = (parent: string): MenuItem[] => [
      ...sendTargets.filter((path) => parentFolder(path) === parent).map((path) => ({
        label: fileName(path), onSelect: () => void send(paths, path, copy), disabled: unavailable || alreadyIn(path), items: level(path),
      })),
      { label: "New Folder…", onSelect: () => setFolderDialog({ paths, parent, copy }), disabled: unavailable || !onCreateFolder },
    ];
    return [{ label: "Library", onSelect: () => void send(paths, "", copy), disabled: unavailable || alreadyIn("") }, ...level("")];
  }

  function siblingNames(parent: string) {
    return [
      ...result?.folders.filter((path) => parentFolder(path) === parent) ?? [],
      ...result?.photos.filter((photo) => parentFolder(photo.path) === parent).map((photo) => photo.path) ?? [],
    ].map(fileName);
  }

  async function createFolder(parent: string, name: string) {
    addFolder(await onCreateFolder!(parent, name));
    setNaming(null);
  }

  async function renameFolder(folder: string, name: string) {
    const rename: FolderRename = { from: folder, to: await onRenameFolder!(folder, name) };
    updateProgress((current) => progressAfterRename(current, rename));
    setNaming(null);
    const follow = (path: string) => renamedPath(path, rename) ?? path;
    if (previouslyShown.current.root === root) {
      previouslyShown.current = { root, photos: previouslyShown.current.photos.map(follow) };
    }
    if (restoredFolder.current?.root === root) {
      restoredFolder.current = { root, folder: follow(restoredFolder.current.folder) };
    }
    setComparison((current) => ({ shown: current.shown.map(follow), selected: current.selected.map(follow) }));
    setPlaces((current) => mapPlaces(current, (place) => ({ ...place, history: historyAfterRename(place.history, rename) })));
    setMoveMessage({ text: `Renamed "${fileName(rename.from)}" to "${fileName(rename.to)}".`, failed: false });
    setScan((value) => value + 1);
  }

  const canRename = (path: string) => onRenameFolder !== undefined && !moving && path !== "" && !isProtectedFolder(path);
  const openFolderMenu = (where: "folder" | "space") => (path: string, event: ReactMouseEvent) =>
    setMenu({ path, where, x: event.clientX, y: event.clientY });
  const spaceContextMenu = (event: ReactMouseEvent) => openFolderMenu("space")(folder, event);

  async function sendToNewFolder(paths: string[], parent: string, name: string, copy: boolean) {
    if (!onCreateFolder) throw new Error("Folders can't be created here.");
    const destination = await onCreateFolder(parent, name);
    addFolder(destination);
    setFolderDialog(null);
    await send(paths, destination, copy);
  }

  const command = sort?.command;
  const handledSerial = useRef(command?.serial);
  useEffect(() => {
    if (!command || command.serial === handledSerial.current) return;
    handledSerial.current = command.serial;
    if (command.name === "clear-comparison") setComparison(EMPTY_COMPARISON);
  }, [command]);

  function menuItems({ path, where }: PhotoMenu): MenuItem[] {
    if (where === "folder") {
      return [{ label: "Rename…", onSelect: () => setNaming({ kind: "rename", folder: path }), disabled: !canRename(path) }];
    }
    if (where === "space") {
      return [{ label: "New Folder…", onSelect: () => setNaming({ kind: "create", parent: path }), disabled: !onCreateFolder }];
    }
    const inComparison = comparison.shown.includes(path);
    const targets = sortActive ? photosActedOn(comparison, path, where) : [path];
    const sendItem = { label: "Move to Folder...", items: sendToFolderItems(targets, false) };
    const copyItem = { label: "Copy to Folder...", items: sendToFolderItems(targets, true) };
    if (!sortActive) return [sendItem, copyItem];
    const allReviewed = progress !== null && targets.every((target) => progress.reviewed.has(target));
    const reviewItem: MenuItem = {
      label: allReviewed ? "Mark as unreviewed" : "Mark as reviewed",
      onSelect: () => updateProgress((current) => setReviewed(current, targets, !allReviewed)),
      disabled: !progress,
    };
    if (where === "grid") {
      return [
        { label: "Show", onSelect: () => showSinglePhoto(path) },
        inComparison
          ? { label: "Remove from Comparison", onSelect: () => setComparison((current) => toggleComparison(current, path)) }
          : { label: "Add to Comparison", onSelect: () => setComparison((current) => toggleComparison(current, path)) },
        sendItem,
        copyItem,
        reviewItem,
        { label: "Mark all up to here as reviewed", disabled: !progress,
          onSelect: () => updateProgress((current) => setReviewed(current, photosUpTo(gridRef.current, path), true)) },
      ];
    }
    const isSelected = comparison.selected.includes(path);
    return [
      ...comparison.shown.length > 1 ? [{ label: isSelected ? "Unselect" : "Select", onSelect: () => setComparison((current) => toggleSelected(current, path)) }] : [],
      { label: "Remove from Comparison", onSelect: () => setComparison((current) => toggleComparison(current, path)) },
      sendItem,
      copyItem,
      reviewItem,
    ];
  }

  // A Folder already holding every dragged Photo is no target, such as the current Folder for a drag from the grid.
  const drop: FolderDrop = (target) => {
    if (!(copyDrag ? onCopyPhotos : onSendPhotos) || !dragged || moving || isAllIn(dragged)(target)
      || isProtectedFolder(target)) return {};
    return {
      className: ["drop-target", dropOver === target && "drop-target-over", copyDrag && "drop-target-copy"].filter(Boolean).join(" "),
      onDragOver: (event) => {
        if (!hasPhotoDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = copyByDefault !== event.altKey ? "copy" : "move";
        setAltDrag(event.altKey);
        setDropOver(target);
      },
      onDragLeave: (event) => {
        if (leftElement(event)) {
          setDropOver((current) => current === target ? null : current);
        }
      },
      onDrop: (event) => {
        const photo = readPhotoDrag(event.dataTransfer);
        if (!photo) return;
        event.preventDefault();
        // The tile being dragged may be gone after the move, so dragend can't be relied on.
        dragChange(null);
        if (dragged.includes(photo.path)) void send([...dragged], target, copyByDefault !== event.altKey);
      },
    };
  };

  // A tile that leaves the grid mid-drag, e.g. once placed with "Unused in this Album" on, never gets
  // its dragend. Browsers send no mouse moves during a drag, so the next one means the drag is over.
  useEffect(() => {
    if (!dragged) return;
    const forget = () => dragChange(null);
    const modifier = (event: KeyboardEvent | globalThis.DragEvent) => {
      setAltDrag(event.altKey);
      if ("clientX" in event) setDragPoint({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener("mousemove", forget);
    window.addEventListener("drop", forget);
    window.addEventListener("keydown", modifier);
    window.addEventListener("keyup", modifier);
    window.addEventListener("dragover", modifier);
    window.addEventListener("dragend", forget);
    window.addEventListener("blur", forget);
    return () => {
      window.removeEventListener("mousemove", forget);
      window.removeEventListener("drop", forget);
      window.removeEventListener("keydown", modifier);
      window.removeEventListener("keyup", modifier);
      window.removeEventListener("dragover", modifier);
      window.removeEventListener("dragend", forget);
      window.removeEventListener("blur", forget);
    };
  }, [dragged]);

  return (
    <aside className="photo-browser" aria-label="Library Photos">
      {dragged && createPortal(<span className="photo-drag-count" role="status"
        style={{ left: Math.min(dragPoint.x + 12, Math.max(0, window.innerWidth - 180)),
          top: Math.min(dragPoint.y + 72, Math.max(0, window.innerHeight - 32)) }}>
        {dropOver !== null && `${copyDrag ? "Copy" : "Move"} `}{dragged.length} {dragged.length === 1 ? "Photo" : "Photos"}
      </span>, window.document.body)}
      <header className="photo-browser-header">
        <span className="photo-count" role="status">
          {loading ? "Scanning Library..." : result ? `${photos.length.toLocaleString()} Photos` : "Scan failed"}
        </span>
        <div className="photo-browser-tools">
          {onCopyByDefaultChange && <div className="photo-drag-action" role="group" aria-label="Photo drag action"
            title="Default Photo-to-Folder drag action. Hold Alt to temporarily reverse it.">
            <button type="button" className="button-quiet" aria-pressed={!copyByDefault}
              onClick={() => onCopyByDefaultChange(false)}>Move</button>
            <button type="button" className="button-quiet" aria-pressed={copyByDefault}
              onClick={() => onCopyByDefaultChange(true)}>Copy</button>
          </div>}
          {onCreateFolder && <button type="button" className="button-quiet" disabled={!result}
            onClick={() => setNaming({ kind: "create", parent: folder })}>New Folder…</button>}
          {sortActive && <button type="button" className="button-quiet" disabled={!result || !progress}
            onClick={() => setResetFolder({ root, folder })}>Mark all unreviewed</button>}
          <button type="button" className="button-quiet" disabled={loading} onClick={() => setScan(scan + 1)}>
            Rescan
          </button>
          {onCompactChange && <Switch label="Compact" checked={compact} onChange={onCompactChange} />}
        </div>
      </header>
      {result && (
        <div className="photo-folder-bar">
          <button type="button" className="photo-history-button" aria-label="Back" title="Back (Alt+←)"
            disabled={!canStepFolder(history, -1)} onClick={() => stepFolderHistory(-1)}>←</button>
          <button type="button" className="photo-history-button" aria-label="Forward" title="Forward (Alt+→)"
            disabled={!canStepFolder(history, 1)} onClick={() => stepFolderHistory(1)}>→</button>
          <nav className="photo-breadcrumbs" aria-label="Photo folders">
            <button type="button" aria-current={folder === "" ? "page" : undefined}
              onClick={() => openFolder("")} {...drop("")}>Library</button>
            {ancestors.map((ancestor) => (
              <span key={ancestor.path}>
                <span aria-hidden="true"> / </span>
                <button type="button" aria-current={ancestor.path === folder ? "page" : undefined}
                  onClick={() => openFolder(ancestor.path)} {...drop(ancestor.path)}>{ancestor.name}</button>
              </span>
            ))}
          </nav>
          <Switch label={unusedOnly ? "Unused" : "All"} checked={unusedOnly} disabled={!album}
            title="Only Photos not used in this Album" onChange={setUnusedOnly} />
        </div>
      )}
      {folders.length > 0 && <FolderArea key={`${root}:${folder}`} folders={folders} counts={folderCounts} compact={compact} onOpenFolder={openFolder} drop={drop}
        onFolderContextMenu={openFolderMenu("folder")} onSpaceContextMenu={spaceContextMenu} edgeScroll={edgeScroll} />}
      {notice && <p className="photo-empty" role="status">{notice}</p>}
      {moveMessage && (moveMessage.failed
        ? <p className="error-banner" role="alert">{moveMessage.text}</p>
        : <p className="photo-empty" role="status">{moveMessage.text}</p>)}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {pendingIdentities > 0 && <p className="photo-empty" role="status">
        Checking Photo Usage... {pendingIdentities} Photos remaining.{unusedOnly && " Unresolved Photos are excluded from Unused."}
      </p>}
      {unknownMissing.length > 0 && <p className="usage-warning" role="status">
        Duplicate check incomplete: {unknownMissing.length} Missing Photo(s) have no known content identity.
      </p>}
      {identityErrors.length > 0 && <div className="error-banner" role="alert">
        <p>Photo Usage check failed.</p>
        <ul>{identityErrors.map((identity) => <li key={identity.path}>
          {identity.path}: {identity.status === "error" && identity.message}
        </li>)}</ul>
        <button type="button" className="button-quiet" onClick={contentIndex.retry}>Retry Usage check</button>
      </div>}
      {progressError && <p className="error-banner" role="alert">{progressError}</p>}
      {result && result.warnings.length > 0 && (
        <details className="photo-warnings">
          <summary>{result.warnings.length} scan warning(s)</summary>
          <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </details>
      )}
      {!loading && result && photos.length === 0 && (
        <p className="photo-empty">{result.photos.length === 0 && result.folders.length === 0
          ? "No Photos yet. Add JPEG or PNG files to this Library, then rescan."
          : unusedOnly && album && (pendingIdentities > 0 || unknownMissing.length > 0 || identityErrors.length > 0)
            ? "No verified unused Photos in this folder yet."
            : unusedOnly && album ? "No unused Photos in this folder." : "No Photos in this folder."}</p>
      )}
      {result && <PhotoGrid key={`${root}:${folder}:${unusedOnly}`} root={root} generation={result.generation}
        photos={photos} usage={usage} compact={compact}
        onDragStart={startDrag("grid")} onDragEnd={endDrag} dragging={dragged !== null}
        shown={sortActive ? comparison.shown : []} moving={movingPhotos}
        reviewed={sortActive && progress ? progress.reviewed : NO_PHOTOS}
        initialScrollTop={sortActive && progress ? progress.positions.get(folder)?.scrollTop ?? 0 : undefined}
        onScrollChange={sortActive ? (scrollTop) => updateProgress((current) => rememberScroll(current, folder, scrollTop)) : undefined}
        onPhotoClick={photoClick} onPhotoContextMenu={openMenu("grid")}
        onSpaceContextMenu={spaceContextMenu} />}
      {sort?.host && createPortal(<SortView root={root} photos={shownPhotos} selected={comparison.selected} usage={usage} leaving={movingPhotos}
        zoom={sort.zoom ?? 1} onZoomChange={sort.onZoomChange}
        onToggleSelected={(path) => setComparison((current) => toggleSelected(current, path))}
        onContextMenu={openMenu("comparison")} onDragStart={startDrag("comparison")} onDragEnd={endDrag} />, sort.host)}
      {menu && <ContextMenu label="Photo actions" x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}
      {folderDialog && <SendToFolderDialog count={folderDialog.paths.length} parent={folderDialog.parent} copy={folderDialog.copy} siblings={siblingNames}
        onSend={(parent, name) => sendToNewFolder(folderDialog.paths, parent, name, folderDialog.copy)} onClose={() => setFolderDialog(null)} />}
      {resetFolder && resetFolder.root === root && sortActive && <ModalDialog label="Mark all unreviewed" onClose={() => setResetFolder(null)}>
        <h2>Mark all unreviewed</h2>
        <p>Mark all Photos in {resetFolder.folder ? `"${resetFolder.folder}"` : "the Library root"} as unreviewed?
          This clears marks for direct Photos, including those hidden by filters or absent from the scan; subfolders are not affected.</p>
        <div className="album-toolbar">
          <button type="button" className="button-quiet" onClick={() => setResetFolder(null)}>Cancel</button>
          <button type="button" className="button-primary" onClick={() => {
            updateProgress((current) => clearFolderReviewed(current, resetFolder.folder));
            setResetFolder(null);
          }}>Mark all unreviewed</button>
        </div>
      </ModalDialog>}
      {naming?.kind === "create" && <FolderNameDialog label="New Folder" submitLabel="Create"
        description={`Creates a Folder inside ${folderName(naming.parent)}.`}
        problem={(name) => folderNameProblem(name, siblingNames(naming.parent))}
        onSubmit={(name) => createFolder(naming.parent, name)} onClose={() => setNaming(null)} />}
      {naming?.kind === "rename" && <FolderNameDialog label="Rename Folder" submitLabel="Rename" initialName={fileName(naming.folder)}
        description={`Renames the Folder ${fileName(naming.folder)} and everything in it.`}
        problem={(name) => folderRenameProblem(naming.folder, name, siblingNames(parentFolder(naming.folder)))}
        confirm={(name) => `Rename "${fileName(naming.folder)}" to "${name}"? Everything in it moves with it, and the Albums in the Library are updated to match.`}
        onSubmit={(name) => renameFolder(naming.folder, name)} onClose={() => setNaming(null)} />}
    </aside>
  );
}
