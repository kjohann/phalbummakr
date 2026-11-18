import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

export interface PhotoPaneSettings {
  width: number;
  collapsed: boolean;
  compact: boolean;
}

export const DEFAULT_PHOTO_PANE: PhotoPaneSettings = { width: 340, collapsed: false, compact: false };
const MIN_WIDTH = 200;
const MAX_WIDTH = 640;
const MAX_WINDOW_SHARE = 0.6;
const KEY_STEP = 16;

export function clampPaneWidth(width: number, maxWidth = MAX_WIDTH) {
  return Number.isFinite(width) ? Math.round(Math.min(maxWidth, Math.max(MIN_WIDTH, width))) : DEFAULT_PHOTO_PANE.width;
}

function windowMaxWidth() {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(window.innerWidth * MAX_WINDOW_SHARE)));
}

/** The left pane. Its header and pin stay the same whatever it shows; `title` names the current content. */
export default function PhotoPane({ title, settings, onChange, children }: {
  title: string;
  settings: PhotoPaneSettings;
  onChange: (change: Partial<PhotoPaneSettings>) => void;
  children: ReactNode;
}) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  const maxWidth = windowMaxWidth();
  const width = dragWidth ?? Math.min(settings.width, maxWidth);

  function startResize(event: ReactMouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const widthAt = (x: number) => clampPaneWidth(startWidth + x - startX, windowMaxWidth());
    const move = (moveEvent: MouseEvent) => setDragWidth(widthAt(moveEvent.clientX));
    const up = (upEvent: MouseEvent) => {
      stopDrag.current?.();
      setDragWidth(null);
      onChange({ width: widthAt(upEvent.clientX) });
    };
    const cursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    stopDrag.current = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = cursor;
      stopDrag.current = null;
    };
  }

  function resizeWithKeys(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : 0;
    if (!step) return;
    event.preventDefault();
    onChange({ width: clampPaneWidth(width + step, maxWidth) });
  }

  return (
    <>
      <section className="photo-pane" aria-label="Photo pane" hidden={settings.collapsed} style={{ width }}>
        <header className="photo-pane-header">
          <h1>{title}</h1>
          <button type="button" className="photo-pane-pin" aria-label="Pin Photo pane" aria-pressed={!settings.collapsed}
            aria-keyshortcuts="Control+B" title="Unpin Photo pane (Ctrl+B)"
            onClick={() => onChange({ collapsed: true })}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M5 1.5h6M6 1.5v5L3.5 9.5h9L10 6.5v-5M8 9.5V15" fill="none" stroke="currentColor"
                strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="photo-pane-content">{children}</div>
        <div className="photo-pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize Photos"
          aria-valuenow={width} aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth} tabIndex={0}
          onMouseDown={startResize} onKeyDown={resizeWithKeys} />
      </section>
      {settings.collapsed && (
        <button type="button" className="photo-pane-open" aria-label="Show Photo pane" aria-keyshortcuts="Control+B"
          title="Show Photo pane (Ctrl+B)" onClick={() => onChange({ collapsed: false })}>›</button>
      )}
    </>
  );
}
