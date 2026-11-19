import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  afterMove, canAddToComparison, chosenPhotos, EMPTY_COMPARISON, isProtectedFolder, photoUsage, showPhoto, stepPhoto,   toggleChosen, toggleComparison, withoutPhotos,
  type Album, type Comparison, type Photo, type PhotoMove, type PhotoScan,
} from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { hasPhotoDrag, readPhotoDrag, writePhotoDrag } from "./photoDrag";
import SortView, { usageLabel } from "./SortView";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import SendToFolderDialog from "./SendToFolderDialog";

/** Connects the Photo grid to Sort mode's work area and command bar. */
export interface SortLink {
  /** Where the shown Photos are rendered. */
  host: HTMLElement | null;
  /** Whether Sort mode is the current mode: grid clicks and arrow keys only act then. */
  active: boolean;
  /** "Send to Folder…" from the command bar; a new serial opens the dialog. */
  command?: { serial: number };
  /** Reports how many Photos "Send to Folder…" would move. */
  onChosenChange: (count: number) => void;
}

/** What a click on a Photo in the grid does, given whether Ctrl (or ⌘) was held. */
type PhotoClick = (photo: string, event: ReactMouseEvent) => void;

/** A right-click menu for a Photo in the grid or in Sort mode's work area. */
interface PhotoMenu {
  path: string;
  where: "grid" | "view";
  x: number;
  y: number;
}

/** Props that make a folder tile or breadcrumb a drop target while a Photo is dragged from the grid. */
type FolderDrop = (folder: string) => {
  className?: string;
  onDragOver?: (event: DragEvent) => void;
  onDragLeave?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
};

function withClass(base: string | undefined, extra: string | undefined) {
  return [base, extra].filter(Boolean).join(" ") || undefined;
}

const GRID = {
  regular: { rowHeight: 160, columnWidth: 140 },
  compact: { rowHeight: 68, columnWidth: 76 },
};
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});

function parentFolder(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function PhotoThumbnail({ root, photo, usage, compact, onDragChange, shown, onClick, onContextMenu }: {
  root: string; photo: Photo; usage: number; compact: boolean; onDragChange: (path: string | null) => void;
  shown: boolean; onClick?: PhotoClick; onContextMenu?: PhotoClick;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null);
    setError(null);
    tauriPhotoPorts.thumbnail(root, photo, controller.signal)
      .then((source) => {
        if (!controller.signal.aborted) setSource(source);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(String(cause));
      });
    return () => controller.abort();
  }, [root, photo]);

  const name = photo.path.split("/").pop()!;
  return (
    <figure className={shown ? "photo-tile photo-tile--shown" : "photo-tile"} title={`${photo.path}\n${photo.width} x ${photo.height} pixels`}
      onClick={onClick && ((event) => onClick(photo.path, event))}
      onContextMenu={onContextMenu && ((event) => { event.preventDefault(); onContextMenu(photo.path, event); })}
      draggable onDragStart={(event) => {
        writePhotoDrag(event.dataTransfer, photo, source ?? undefined);
        onDragChange(photo.path);
        void tauriPhotoPorts.prewarmPreview(root, photo).catch(() => undefined);
      }} onDragEnd={() => onDragChange(null)}>
      <div className="photo-preview">
        {source && <img src={source} alt={name} loading="lazy" decoding="async" draggable={false} />}
        {!source && !error && <span className="photo-placeholder">{compact ? "…" : "Loading..."}</span>}
        {error && <span className="photo-failure" role="alert" title={error}>{compact ? "!" : "Thumbnail unavailable. Rescan to retry."}</span>}
        {usage > 0 && <span className="photo-usage" aria-label={usageLabel(usage)}>{usage}</span>}
      </div>
      {!compact && <figcaption>
        <span className="photo-name">{name}</span>
        <time dateTime={new Date(photo.captureDate).toISOString()}>{dateFormat.format(photo.captureDate)}</time>
      </figcaption>}
    </figure>
  );
}

function FolderTile({ path, compact, onOpen, drop }: { path: string; compact: boolean; onOpen: (path: string) => void; drop: FolderDrop }) {
  const name = path.split("/").pop();
  const target = drop(path);
  return (
    <button type="button" title={path} aria-label={`Open folder ${name}`} onClick={() => onOpen(path)}
      {...target} className={withClass("folder-tile", target.className)}>
      <span className="photo-preview">
        <svg width="48" height="40" viewBox="0 0 48 40" fill="none" aria-hidden="true">
          <path d="M3 9V5h16l5 5h21v26H3V9Z" fill="currentColor" />
        </svg>
        {compact && <span className="photo-name">{name}</span>}
      </span>
      {!compact && <>
        <span className="photo-name">{name}</span>
        <span className="folder-label">Folder</span>
      </>}
    </button>
  );
}

function PhotoGrid({ root, photos, folders, usage, compact, onOpenFolder, onDragChange, drop, shown, onPhotoClick, onPhotoContextMenu }: {
  root: string;
  photos: Photo[];
  folders: string[];
  usage: Map<string, number>;
  compact: boolean;
  onOpenFolder: (folder: string) => void;
  onDragChange: (path: string | null) => void;
  drop: FolderDrop;
  shown: readonly string[];
  onPhotoClick?: PhotoClick;
  onPhotoContextMenu?: PhotoClick;
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

  const entries = [
    ...folders.map((path) => ({ kind: "folder" as const, path })),
    ...photos.map((photo) => ({ kind: "photo" as const, photo })),
  ];
  const { rowHeight, columnWidth } = compact ? GRID.compact : GRID.regular;
  const columns = Math.max(1, Math.floor(viewport.width / columnWidth));
  const rows = Math.ceil(entries.length / columns);
  const start = Math.max(0, Math.min(rows - 1, Math.floor(scrollTop / rowHeight)) - 2);
  const end = Math.min(rows, Math.ceil((scrollTop + viewport.height) / rowHeight) + 2);
  const visible = viewport.height > 0 ? entries.slice(start * columns, end * columns) : [];

  return (
    <div className={compact ? "photo-grid photo-grid-compact" : "photo-grid"} ref={viewportRef} aria-label="Photo grid" tabIndex={0}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="photo-grid-content" role="list" aria-label="Folders and Photos"
        style={{ height: rows * rowHeight }}>
        {visible.map((entry, offset) => {
          const index = start * columns + offset;
          return (
            <div key={entry.kind === "folder" ? entry.path : `${entry.photo.path}:${entry.photo.revision}`}
              className="photo-cell" role="listitem"
              aria-posinset={index + 1} aria-setsize={entries.length}
              style={{
                top: Math.floor(index / columns) * rowHeight,
                left: `${(index % columns) * 100 / columns}%`,
                width: `${100 / columns}%`,
                height: rowHeight,
              }}>
              {entry.kind === "photo" ? <PhotoThumbnail root={root} photo={entry.photo} usage={usage.get(entry.photo.path) ?? 0}
                compact={compact} onDragChange={onDragChange} shown={shown.includes(entry.photo.path)}
                onClick={onPhotoClick} onContextMenu={onPhotoContextMenu} />
                : <FolderTile path={entry.path} compact={compact} onOpen={onOpenFolder} drop={drop} />}
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

function fileName(path: string) {
  return path.split("/").pop()!;
}

function movedMessage(moves: PhotoMove[], target: string) {
  if (moves.length !== 1) return `Moved ${moves.length} Photos to ${folderName(target)}.`;
  const [{ from, to }] = moves;
  return fileName(from) === fileName(to) ? `Moved "${fileName(from)}" to ${folderName(target)}.`
    : `Moved "${fileName(from)}" to ${folderName(target)} as "${fileName(to)}".`;
}

export default function PhotoBrowser({ root, album = null, compact = false, onCompactChange, onSendPhotos, onCreateFolder, sort }: {
  root: string;
  album?: Album | null;
  compact?: boolean;
  onCompactChange?: (compact: boolean) => void;
  /** Moves Photos to a Folder ("" is the Library root), returning the moves made. Without it, Folders aren't drop targets. */
  onSendPhotos?: (photos: string[], target: string) => Promise<PhotoMove[]>;
  /** Creates Folder `name` inside `parent`, returning its Library-relative path, for "New Folder…". */
  onCreateFolder?: (parent: string, name: string) => Promise<string>;
  /** Set in Sort mode, where Photos are shown large and compared. */
  sort?: SortLink;
}) {
  const [comparison, setComparison] = useState<Comparison>(EMPTY_COMPARISON);
  const [menu, setMenu] = useState<PhotoMenu | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ paths: string[]; parent?: string } | null>(null);
  const [scan, setScan] = useState(0);
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [result, setResult] = useState<(PhotoScan & {
    generation: number;
    folder: string;
    notice: string | null;
  }) | null>(null);
  const [loading, setLoading] = useState(true);
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
        setResult((previous) => {
          const selected = previous?.folder ?? "";
          let folder = selected;
          while (folder && !result.folders.includes(folder)) folder = parentFolder(folder);
          return {
            ...result, generation: scan, folder,
            notice: folder !== selected
              ? `The folder "${selected}" is no longer available in this scan. Showing ${folder || "the Library root"}.`
              : null,
          };
        });
      })
      .catch((cause: unknown) => {
        if (active) setError(`Could not scan the Library: ${String(cause)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [root, scan]);

  const folder = result?.folder ?? "";
  const usage = album ? photoUsage(album) : new Map<string, number>();
  const photos = result?.photos.filter((photo) => parentFolder(photo.path) === folder
    && (!unusedOnly || !usage.has(photo.path))) ?? [];
  const folders = result?.folders.filter((path) => parentFolder(path) === folder) ?? [];
  const ancestors = folder ? folder.split("/").map((name, index, parts) => ({
    name, path: parts.slice(0, index + 1).join("/"),
  })) : [];
  function openFolder(path: string) {
    setResult((previous) => previous && { ...previous, folder: path, notice: null });
  }

  const sortActive = sort?.active ?? false;
  const grid = photos.map((photo) => photo.path);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const chosenCount = chosenPhotos(comparison).length;
  const onChosenChange = sort?.onChosenChange;
  useEffect(() => onChosenChange?.(chosenCount), [chosenCount, onChosenChange]);

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

  const photoClick: PhotoClick | undefined = sortActive ? (path, event) => {
    setComparison((current) => event.ctrlKey || event.metaKey ? toggleComparison(current, path) : showPhoto(path));
  } : undefined;
  const openMenu = (where: PhotoMenu["where"]) => (path: string, event: ReactMouseEvent) =>
    setMenu({ path, where, x: event.clientX, y: event.clientY });
  const byPath = new Map(result?.photos.map((photo) => [photo.path, photo]));
  const shownPhotos = comparison.shown.flatMap((path) => byPath.get(path) ?? []);

  function dragChange(path: string | null) {
    setDragged(path);
    setDropOver(null);
    if (path) setMoveMessage(null);
  }

  async function send(paths: string[], target: string) {
    const gridBefore = gridRef.current;
    setMoving(true);
    setMoveMessage(null);
    try {
      const moves = await onSendPhotos!(paths, target);
      if (moves.length > 0) {
        setMoveMessage({ text: movedMessage(moves, target), failed: false });
        setComparison((current) => afterMove(current, moves.map(({ from }) => from), gridBefore));
        setScan((value) => value + 1);
      }
    } catch (cause) {
      const what = paths.length === 1 ? `"${fileName(paths[0])}"` : `${paths.length} Photos`;
      setMoveMessage({ text: `Could not move ${what}: ${cause instanceof Error ? cause.message : String(cause)}`, failed: true });
    } finally {
      setMoving(false);
    }
  }

  /** The Folders `paths` can be sent to, nested as in the Library, each with "New Folder…" inside it. */
  const sendTargets = result?.folders.filter((path) => !isProtectedFolder(path)) ?? [];
  const isAllIn = (paths: string[]) => (target: string) => paths.every((path) => parentFolder(path) === target);
  function sendToFolderItems(paths: string[]): MenuItem[] {
    const unavailable = !onSendPhotos || moving;
    const alreadyIn = isAllIn(paths);
    const level = (parent: string): MenuItem[] => [
      ...sendTargets.filter((path) => parentFolder(path) === parent).map((path) => ({
        label: fileName(path), onSelect: () => void send(paths, path), disabled: unavailable || alreadyIn(path), items: level(path),
      })),
      { label: "New Folder…", onSelect: () => setFolderDialog({ paths, parent }), disabled: unavailable || !onCreateFolder },
    ];
    return [{ label: "Library", onSelect: () => void send(paths, ""), disabled: unavailable || alreadyIn("") }, ...level("")];
  }

  function siblingNames(parent: string) {
    return [
      ...result?.folders.filter((path) => parentFolder(path) === parent) ?? [],
      ...result?.photos.filter((photo) => parentFolder(photo.path) === parent).map((photo) => photo.path) ?? [],
    ].map(fileName);
  }

  async function sendFromDialog(paths: string[], target: string, name: string | null) {
    let destination = target;
    if (name !== null) {
      if (!onCreateFolder) throw new Error("Folders can't be created here.");
      destination = await onCreateFolder(target, name);
      setScan((value) => value + 1);
    }
    setFolderDialog(null);
    await send(paths, destination);
  }

  const comparisonRef = useRef(comparison);
  comparisonRef.current = comparison;
  const commandSerial = sort?.command?.serial;
  const handledSerial = useRef(commandSerial);
  useEffect(() => {
    if (commandSerial === undefined || commandSerial === handledSerial.current) return;
    handledSerial.current = commandSerial;
    const paths = chosenPhotos(comparisonRef.current);
    if (paths.length > 0) setFolderDialog({ paths });
  }, [commandSerial]);

  function menuItems({ path, where }: PhotoMenu): MenuItem[] {
    const inComparison = comparison.shown.includes(path);
    // Like a file manager's selection: a chosen Photo takes the other chosen Photos with it.
    const chosen = chosenPhotos(comparison);
    const sendItem = { label: "Send to Folder", items: sendToFolderItems(chosen.includes(path) ? chosen : [path]) };
    if (where === "grid") {
      return [
        { label: "Show", onSelect: () => setComparison(showPhoto(path)) },
        inComparison
          ? { label: "Remove from Comparison", onSelect: () => setComparison((current) => toggleComparison(current, path)) }
          : { label: "Add to Comparison", onSelect: () => setComparison((current) => toggleComparison(current, path)),
            disabled: !canAddToComparison(comparison) },
        sendItem,
      ];
    }
    const isChosen = comparison.chosen.includes(path);
    return [
      ...comparison.shown.length > 1 ? [{ label: isChosen ? "Unchoose" : "Choose", onSelect: () => setComparison((current) => toggleChosen(current, path)) }] : [],
      { label: "Remove from Comparison", onSelect: () => setComparison((current) => toggleComparison(current, path)) },
      sendItem,
    ];
  }

  // The current Folder and the Photo's own Folder are never targets; from the grid, these are usually the same.
  const drop: FolderDrop = (target) => {
    if (!onSendPhotos || !dragged || moving || target === folder || target === parentFolder(dragged)
      || isProtectedFolder(target)) return {};
    return {
      className: dropOver === target ? "drop-target drop-target-over" : "drop-target",
      onDragOver: (event) => {
        if (!hasPhotoDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropOver(target);
      },
      onDragLeave: (event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
          setDropOver((current) => current === target ? null : current);
        }
      },
      onDrop: (event) => {
        const photo = readPhotoDrag(event.dataTransfer);
        if (!photo) return;
        event.preventDefault();
        // The tile being dragged may be gone after the move, so dragend can't be relied on.
        dragChange(null);
        if (photo.path === dragged) void send([photo.path], target);
      },
    };
  };

  // A tile that leaves the grid mid-drag, e.g. once placed with "Unused in this Album" on, never gets
  // its dragend. Browsers send no mouse moves during a drag, so the next one means the drag is over.
  useEffect(() => {
    if (!dragged) return;
    const forget = () => dragChange(null);
    window.addEventListener("mousemove", forget);
    window.addEventListener("drop", forget);
    return () => {
      window.removeEventListener("mousemove", forget);
      window.removeEventListener("drop", forget);
    };
  }, [dragged]);

  return (
    <aside className="photo-browser" aria-label="Library Photos">
      <header className="photo-browser-header">
        <span className="photo-count" role="status">
          {loading ? "Scanning Library..." : result ? `${photos.length.toLocaleString()} Photos` : "Scan failed"}
        </span>
        <div className="photo-browser-tools">
          {onCompactChange && <button type="button" className="button-quiet" aria-pressed={compact}
            onClick={() => onCompactChange(!compact)}>Compact</button>}
          <button type="button" className="button-quiet" disabled={loading} onClick={() => setScan(scan + 1)}>
            Rescan
          </button>
        </div>
      </header>
      {result && (
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
      )}
      <label className="photo-filter">
        <input type="checkbox" checked={unusedOnly} disabled={!album} onChange={(event) => setUnusedOnly(event.target.checked)} />
        Unused in this Album
      </label>
      <p className="photo-order">Capture date · oldest first</p>
      {result?.notice && <p className="photo-empty" role="status">{result.notice}</p>}
      {moveMessage && (moveMessage.failed
        ? <p className="error-banner" role="alert">{moveMessage.text}</p>
        : <p className="photo-empty" role="status">{moveMessage.text}</p>)}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {result && result.warnings.length > 0 && (
        <details className="photo-warnings">
          <summary>{result.warnings.length} scan warning(s)</summary>
          <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </details>
      )}
      {!loading && result && photos.length === 0 && (
        <p className="photo-empty">{result.photos.length === 0 && result.folders.length === 0
          ? "No Photos yet. Add JPEG or PNG files to this Library, then rescan."
          : unusedOnly && album ? "No unused Photos in this folder." : "No Photos in this folder."}</p>
      )}
      {result && <PhotoGrid key={`${root}:${result.generation}:${folder}:${unusedOnly}`} root={root}
        photos={photos} folders={folders} usage={usage} compact={compact} onOpenFolder={openFolder}
        onDragChange={dragChange} drop={drop} shown={sortActive ? comparison.shown : []}
        onPhotoClick={photoClick} onPhotoContextMenu={sortActive ? openMenu("grid") : undefined} />}
      {sort?.host && createPortal(<SortView root={root} photos={shownPhotos} chosen={comparison.chosen} usage={usage}
        onToggleChosen={(path) => setComparison((current) => toggleChosen(current, path))}
        onContextMenu={openMenu("view")} />, sort.host)}
      {menu && <ContextMenu label="Photo actions" x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}
      {folderDialog && <SendToFolderDialog count={folderDialog.paths.length} folders={sendTargets} parent={folderDialog.parent}
        siblings={siblingNames} alreadyIn={isAllIn(folderDialog.paths)}
        onSend={(target, name) => sendFromDialog(folderDialog.paths, target, name)} onClose={() => setFolderDialog(null)} />}
    </aside>
  );
}
