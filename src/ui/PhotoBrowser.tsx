import { useEffect, useRef, useState } from "react";
import type { Photo, PhotoScan } from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { writePhotoDrag } from "./photoDrag";

const ROW_HEIGHT = 160;
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});

function parentFolder(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function PhotoThumbnail({ root, photo }: { root: string; photo: Photo }) {
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
      draggable onDragStart={(event) => writePhotoDrag(event.dataTransfer, photo)}>
      <div className="photo-preview">
        {source && <img src={source} alt={name} loading="lazy" decoding="async" draggable={false} />}
        {!source && !error && <span className="photo-placeholder">Loading...</span>}
        {error && <span className="photo-failure" role="alert" title={error}>Thumbnail unavailable. Rescan to retry.</span>}
      </div>
      <figcaption>
        <span className="photo-name">{name}</span>
        <time dateTime={new Date(photo.captureDate).toISOString()}>{dateFormat.format(photo.captureDate)}</time>
      </figcaption>
    </figure>
  );
}

function PhotoGrid({ root, photos, folders, onOpenFolder }: {
  root: string;
  photos: Photo[];
  folders: string[];
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
  const columns = Math.max(1, Math.floor(viewport.width / 140));
  const rows = Math.ceil(entries.length / columns);
  const start = Math.max(0, Math.min(rows - 1, Math.floor(scrollTop / ROW_HEIGHT)) - 2);
  const end = Math.min(rows, Math.ceil((scrollTop + viewport.height) / ROW_HEIGHT) + 2);
  const visible = viewport.height > 0 ? entries.slice(start * columns, end * columns) : [];

  return (
    <div className="photo-grid" ref={viewportRef} aria-label="Photo grid" tabIndex={0}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="photo-grid-content" role="list" aria-label="Folders and Photos"
        style={{ height: rows * ROW_HEIGHT }}>
        {visible.map((entry, offset) => {
          const index = start * columns + offset;
          return (
            <div key={entry.kind === "folder" ? entry.path : `${entry.photo.path}:${entry.photo.revision}`}
              className="photo-cell" role="listitem"
              aria-posinset={index + 1} aria-setsize={entries.length}
              style={{
                top: Math.floor(index / columns) * ROW_HEIGHT,
                left: `${(index % columns) * 100 / columns}%`,
                width: `${100 / columns}%`,
                height: ROW_HEIGHT,
              }}>
              {entry.kind === "photo" ? <PhotoThumbnail root={root} photo={entry.photo} /> : (
                <button type="button" className="folder-tile" title={entry.path}
                  aria-label={`Open folder ${entry.path.split("/").pop()}`}
                  onClick={() => onOpenFolder(entry.path)}>
                  <span className="photo-preview">
                    <svg width="48" height="40" viewBox="0 0 48 40" fill="none" aria-hidden="true">
                      <path d="M3 9V5h16l5 5h21v26H3V9Z" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="photo-name">{entry.path.split("/").pop()}</span>
                  <span className="folder-label">Folder</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PhotoBrowser({ root }: { root: string }) {
  const [scan, setScan] = useState(0);
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
  const photos = result?.photos.filter((photo) => parentFolder(photo.path) === folder) ?? [];
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
        <div>
          <h1>Photos</h1>
          <span className="photo-count" role="status">
            {loading ? "Scanning Library..." : result ? `${photos.length.toLocaleString()} Photos` : "Scan failed"}
          </span>
        </div>
        <button type="button" className="button-quiet" disabled={loading} onClick={() => setScan(scan + 1)}>
          Rescan
        </button>
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
          : "No Photos in this folder."}</p>
      )}
      {result && <PhotoGrid key={`${root}:${result.generation}:${folder}`} root={root}
        photos={photos} folders={folders} onOpenFolder={openFolder} />}
    </aside>
  );
}
