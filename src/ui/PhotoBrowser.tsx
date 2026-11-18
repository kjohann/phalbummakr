import { useEffect, useRef, useState } from "react";
import { photoUsage, type Album, type Photo, type PhotoScan } from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { writePhotoDrag } from "./photoDrag";

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

function PhotoThumbnail({ root, photo, usage, compact }: { root: string; photo: Photo; usage: number; compact: boolean }) {
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
    <figure className="photo-tile" title={`${photo.path}\n${photo.width} x ${photo.height} pixels`}
      draggable onDragStart={(event) => {
        writePhotoDrag(event.dataTransfer, photo, source ?? undefined);
        void tauriPhotoPorts.prewarmPreview(root, photo).catch(() => undefined);
      }}>
      <div className="photo-preview">
        {source && <img src={source} alt={name} loading="lazy" decoding="async" draggable={false} />}
        {!source && !error && <span className="photo-placeholder">{compact ? "…" : "Loading..."}</span>}
        {error && <span className="photo-failure" role="alert" title={error}>{compact ? "!" : "Thumbnail unavailable. Rescan to retry."}</span>}
        {usage > 0 && <span className="photo-usage" aria-label={`Used ${usage} ${usage === 1 ? "time" : "times"} in this Album`}>{usage}</span>}
      </div>
      {!compact && <figcaption>
        <span className="photo-name">{name}</span>
        <time dateTime={new Date(photo.captureDate).toISOString()}>{dateFormat.format(photo.captureDate)}</time>
      </figcaption>}
    </figure>
  );
}

function FolderTile({ path, compact, onOpen }: { path: string; compact: boolean; onOpen: (path: string) => void }) {
  const name = path.split("/").pop();
  return (
    <button type="button" className="folder-tile" title={path} aria-label={`Open folder ${name}`} onClick={() => onOpen(path)}>
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

function PhotoGrid({ root, photos, folders, usage, compact, onOpenFolder }: {
  root: string;
  photos: Photo[];
  folders: string[];
  usage: Map<string, number>;
  compact: boolean;
  onOpenFolder: (folder: string) => void;
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
              {entry.kind === "photo" ? <PhotoThumbnail root={root} photo={entry.photo} usage={usage.get(entry.photo.path) ?? 0} compact={compact} />
                : <FolderTile path={entry.path} compact={compact} onOpen={onOpenFolder} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PhotoBrowser({ root, album = null, compact = false, onCompactChange }: {
  root: string;
  album?: Album | null;
  compact?: boolean;
  onCompactChange?: (compact: boolean) => void;
}) {
  const [scan, setScan] = useState(0);
  const [unusedOnly, setUnusedOnly] = useState(false);
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
        if (active) setResult((previous) => {
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
            onClick={() => openFolder("")}>Library</button>
          {ancestors.map((ancestor) => (
            <span key={ancestor.path}>
              <span aria-hidden="true"> / </span>
              <button type="button" aria-current={ancestor.path === folder ? "page" : undefined}
                onClick={() => openFolder(ancestor.path)}>{ancestor.name}</button>
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
        photos={photos} folders={folders} usage={usage} compact={compact} onOpenFolder={openFolder} />}
    </aside>
  );
}
