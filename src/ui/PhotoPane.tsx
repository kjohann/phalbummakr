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

export default function PhotoPane({ settings, onChange, children }: {
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
        {children}
        <div className="photo-pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize Photos"
          aria-valuenow={width} aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth} tabIndex={0}
          onMouseDown={startResize} onKeyDown={resizeWithKeys} />
        <button type="button" className="photo-pane-toggle" aria-label="Hide Photos" title="Hide Photos (Ctrl+B)"
          onClick={() => onChange({ collapsed: true })}>‹</button>
      </section>
      {settings.collapsed && (
        <button type="button" className="photo-pane-open" aria-label="Show Photos" title="Show Photos (Ctrl+B)"
          onClick={() => onChange({ collapsed: false })}>›</button>
      )}
    </>
  );
}
