import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import { anchoredScroll, comparisonGrid, MAX_ZOOM, MIN_ZOOM, stepZoom, zoomBy, zoomLabel, type Photo, type ZoomChange } from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { writePhotoDrag, type PhotoDragStart } from "./photoDrag";

export function usageLabel(usage: number) {
  return `Used ${usage} ${usage === 1 ? "time" : "times"} in this Album`;
}

function SortPhoto({ root, photo, usage }: { root: string; photo: Photo; usage: number }) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSource(null);
    setError(null);
    tauriPhotoPorts.prewarmPreview(root, photo)
      .then((url) => { if (active) setSource(url); })
      .catch((cause: unknown) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [root, photo]);
  return <div className="sort-photo-image">
    {source && <img src={source} alt={photo.path} draggable={false} />}
    {!source && !error && <span className="photo-placeholder">Loading...</span>}
    {error && <span className="photo-failure" role="alert" title={error}>Preview unavailable.</span>}
    {usage > 0 && <span className="photo-usage" aria-label={usageLabel(usage)}>{usage}</span>}
  </div>;
}

/** The command bar's − 100% + for Sort mode's work area. The percentage resets the zoom. */
export function SortZoomTools({ zoom, disabled, onZoom }: {
  zoom: number;
  disabled: boolean;
  onZoom: (change: ZoomChange) => void;
}) {
  return <div className="slot-tools" role="group" aria-label="Zoom">
    <button type="button" className="command" aria-label="Zoom out" title="Zoom out (Ctrl+Minus)" aria-keyshortcuts="Control+-"
      disabled={disabled || zoom <= MIN_ZOOM} onClick={() => onZoom((current) => stepZoom(current, -1))}>−</button>
    <button type="button" className="command sort-zoom-level" aria-label="Reset zoom" title="Reset zoom to 100% (Ctrl+0)" aria-keyshortcuts="Control+0"
      disabled={disabled} onClick={() => onZoom(() => 1)}>{zoomLabel(zoom)}</button>
    <button type="button" className="command" aria-label="Zoom in" title="Zoom in (Ctrl+Plus)" aria-keyshortcuts="Control+Plus"
      disabled={disabled || zoom >= MAX_ZOOM} onClick={() => onZoom((current) => stepZoom(current, 1))}>+</button>
  </div>;
}

/** A point in the work area, relative to its top-left corner, that stays put while zooming. */
interface ZoomAnchor { x: number; y: number }

/** Where the work area is scrolled to, and where its grid starts in it, as last laid out. */
interface ViewLayout { left: number; top: number; offsetLeft: number; offsetTop: number }

function measure(view: HTMLElement): ViewLayout {
  const grid = view.firstElementChild as HTMLElement | null;
  return { left: view.scrollLeft, top: view.scrollTop, offsetLeft: grid?.offsetLeft ?? 0, offsetTop: grid?.offsetTop ?? 0 };
}

/**
 * Ctrl+wheel (also a touchpad pinch) and a two-finger touch pinch over `view` change the zoom,
 * which keeps the point under the pointer, or between the fingers, in place.
 */
function useViewZoom(view: HTMLElement | null, zoom: number, onZoomChange: ((change: ZoomChange) => void) | undefined) {
  const anchor = useRef<ZoomAnchor | null>(null);
  // Kept from before a zoom renders, as the browser clamps the scroll position once the content shrinks.
  const layout = useRef<ViewLayout>({ left: 0, top: 0, offsetLeft: 0, offsetTop: 0 });
  const zoomRef = useRef(zoom);
  const changeRef = useRef(onZoomChange);
  changeRef.current = onZoomChange;

  useEffect(() => {
    if (!view) return;
    const remember = () => { layout.current = { ...layout.current, left: view.scrollLeft, top: view.scrollTop }; };
    const anchorAt = (clientX: number, clientY: number) => {
      const bounds = view.getBoundingClientRect();
      anchor.current = { x: clientX - bounds.left, y: clientY - bounds.top };
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 400 : 1);
      anchorAt(event.clientX, event.clientY);
      // About 13% per 100-pixel wheel notch; touchpad pinches send many small deltas.
      changeRef.current?.((current) => zoomBy(current, Math.exp(-pixels / 800)));
    };
    let pinch: { distance: number; zoom: number } | null = null;
    const fingers = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      return { distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };
    const touchStart = (event: TouchEvent) => {
      pinch = event.touches.length === 2 ? { distance: fingers(event).distance, zoom: zoomRef.current } : null;
    };
    const touchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2 || pinch.distance === 0) return;
      event.preventDefault();
      const { distance, x, y } = fingers(event);
      const target = zoomBy(pinch.zoom, distance / pinch.distance);
      anchorAt(x, y);
      changeRef.current?.(() => target);
    };
    const touchEnd = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
    view.addEventListener("scroll", remember);
    view.addEventListener("wheel", wheel, { passive: false });
    view.addEventListener("touchstart", touchStart);
    view.addEventListener("touchmove", touchMove, { passive: false });
    view.addEventListener("touchend", touchEnd);
    view.addEventListener("touchcancel", touchEnd);
    return () => {
      view.removeEventListener("scroll", remember);
      view.removeEventListener("wheel", wheel);
      view.removeEventListener("touchstart", touchStart);
      view.removeEventListener("touchmove", touchMove);
      view.removeEventListener("touchend", touchEnd);
      view.removeEventListener("touchcancel", touchEnd);
    };
  }, [view]);

  // After every render, as a new number of Photos also moves a grid centred in the work area.
  useLayoutEffect(() => {
    const previous = zoomRef.current;
    zoomRef.current = zoom;
    // A wheel or pinch at the zoom limits leaves the zoom as it was, and its anchor must not linger.
    const point = anchor.current;
    anchor.current = null;
    if (!view) return;
    if (previous !== zoom) {
      // Zooming from the keyboard or the command bar keeps the middle of the work area in place.
      const { x, y } = point ?? { x: view.clientWidth / 2, y: view.clientHeight / 2 };
      const before = layout.current;
      const after = measure(view);
      const scale = zoom / previous;
      view.scrollLeft = anchoredScroll({ scroll: before.left, anchor: x, offset: before.offsetLeft, nextOffset: after.offsetLeft, scale });
      view.scrollTop = anchoredScroll({ scroll: before.top, anchor: y, offset: before.offsetTop, nextOffset: after.offsetTop, scale });
    }
    layout.current = measure(view);
  });
}
/** Sort mode's work area: one Photo shown large, or a Comparison of any number in a grid, zoomed as a whole. */
export default function SortView({ root, photos, selected, usage, leaving = [], zoom = 1, onZoomChange, onToggleSelected, onContextMenu, onDragStart, onDragEnd }: {
  root: string;
  photos: Photo[];
  /** Paths of the Selected Photos; ignored for a single Photo, which always counts as selected. */
  selected: readonly string[];
  usage: Map<string, number>;
  /** Photos being moved away, which fade out until the move is done. */
  leaving?: readonly string[];
  /** How much the work area is zoomed, 1 being 100%. */
  zoom?: number;
  onZoomChange?: (change: ZoomChange) => void;
  onToggleSelected: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent) => void;
  /** A shown Photo is dragged, e.g. to a Folder. */
  onDragStart: PhotoDragStart;
  onDragEnd: () => void;
}) {
  const [view, setView] = useState<HTMLDivElement | null>(null);
  useViewZoom(view, zoom, onZoomChange);
  if (photos.length === 0) {
    return <div className="sort-view sort-view--empty">
      <p>Click a Photo to show it here. Ctrl-click Photos to compare them.</p>
    </div>;
  }
  const comparing = photos.length > 1;
  const { columns, rows } = comparisonGrid(photos.length);
  const layout = { "--columns": columns, "--rows": rows, "--zoom": zoom } as CSSProperties;
  return <div className="sort-view" ref={setView}>
    <div className={comparing ? "sort-view-grid" : "sort-view-grid sort-view-grid--single"} role="group" aria-label={comparing ? "Comparison" : "Shown Photo"} style={layout}>
      {photos.map((photo) => {
        const name = photo.path.split("/").pop()!;
        const isSelected = comparing && selected.includes(photo.path);
        const content = <>
          <SortPhoto root={root} photo={photo} usage={usage.get(photo.path) ?? 0} />
          <span className="sort-photo-caption">
            <span className="photo-name">{name}</span>
            {isSelected && <span className="sort-photo-selected">Selected</span>}
          </span>
        </>;
        const menu = (event: MouseEvent) => { event.preventDefault(); onContextMenu(photo.path, event); };
        const isLeaving = leaving.includes(photo.path);
        const drag = { draggable: !isLeaving, onDragStart: (event: DragEvent) => {
          writePhotoDrag(event.dataTransfer, photo);
          onDragStart(photo.path, event);
        }, onDragEnd };
        const className = ["sort-photo", isSelected && "sort-photo--selected", isLeaving && "sort-photo--leaving"]
          .filter(Boolean).join(" ");
        return comparing
          ? <button key={photo.path} type="button" className={className}
            aria-pressed={isSelected} aria-label={`${isSelected ? "Unselect" : "Select"} ${name}`} title={photo.path}
            onClick={() => onToggleSelected(photo.path)} onContextMenu={menu} {...drag}>{content}</button>
          : <figure key={photo.path} className={className} title={photo.path} onContextMenu={menu} {...drag}>{content}</figure>;
      })}
    </div>
  </div>;
}