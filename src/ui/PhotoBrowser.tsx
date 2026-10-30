import { useEffect, useRef, useState } from "react";
import type { Photo, PhotoScan } from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";

const ROW_HEIGHT = 160;
const dateFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});

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
    <figure className="photo-tile" title={`${photo.path}\n${photo.width} x ${photo.height} pixels`}>
      <div className="photo-preview">
        {source && <img src={source} alt={name} loading="lazy" decoding="async" />}
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

function PhotoGrid({ root, photos }: { root: string; photos: Photo[] }) {
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

  const columns = Math.max(1, Math.floor(viewport.width / 140));
  const rows = Math.ceil(photos.length / columns);
  const start = Math.max(0, Math.min(rows - 1, Math.floor(scrollTop / ROW_HEIGHT)) - 2);
  const end = Math.min(rows, Math.ceil((scrollTop + viewport.height) / ROW_HEIGHT) + 2);
  const visible = viewport.height > 0 ? photos.slice(start * columns, end * columns) : [];

  return (
    <div className="photo-grid" ref={viewportRef} aria-label="Photo grid" tabIndex={0}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="photo-grid-content" role="list" aria-label="Photos"
        style={{ height: rows * ROW_HEIGHT }}>
        {visible.map((photo, offset) => {
          const index = start * columns + offset;
          return (
            <div key={`${photo.path}:${photo.revision}`} className="photo-cell" role="listitem"
              aria-posinset={index + 1} aria-setsize={photos.length}
              style={{
                top: Math.floor(index / columns) * ROW_HEIGHT,
                left: `${(index % columns) * 100 / columns}%`,
                width: `${100 / columns}%`,
                height: ROW_HEIGHT,
              }}>
              <PhotoThumbnail root={root} photo={photo} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PhotoBrowser({ root }: { root: string }) {
  const [scan, setScan] = useState(0);
  const [result, setResult] = useState<(PhotoScan & { generation: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    tauriPhotoPorts.scan(root)
      .then((result) => {
        if (active) setResult({ ...result, generation: scan });
      })
      .catch((cause: unknown) => {
        if (active) setError(`Could not scan the Library: ${String(cause)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [root, scan]);

  return (
    <aside className="photo-browser" aria-label="Library Photos">
      <header className="photo-browser-header">
        <div>
          <h1>Photos</h1>
          <span className="photo-count" role="status">
            {loading ? "Scanning Library..." : result ? `${result.photos.length.toLocaleString()} Photos` : "Scan failed"}
          </span>
        </div>
        <button type="button" className="button-quiet" disabled={loading} onClick={() => setScan(scan + 1)}>
          Rescan
        </button>
      </header>
      <p className="photo-order">Capture date · oldest first</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {result && result.warnings.length > 0 && (
        <details className="photo-warnings">
          <summary>{result.warnings.length} scan warning(s)</summary>
          <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
        </details>
      )}
      {!loading && result?.photos.length === 0 && (
        <p className="photo-empty">No Photos yet. Add JPEG or PNG files to this Library, then rescan.</p>
      )}
      {result && <PhotoGrid key={`${root}:${result.generation}`} root={root} photos={result.photos} />}
    </aside>
  );
}
