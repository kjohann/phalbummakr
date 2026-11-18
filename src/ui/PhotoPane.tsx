import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { MODES, type Mode } from "./modes";

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

const MODE_ICONS: Record<Mode, ReactNode> = {
  album: <path d="M3 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 0-1.5-1.5H3zM15 3.5h-4.5A1.5 1.5 0 0 0 9 5v9a1.5 1.5 0 0 1 1.5-1.5H15z" />,
  layouts: <path d="M3 3h12v12H3zM3 9h7M10 3v12" />,
  sort: <path d="M2.5 5.5V14a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H9L7.5 4h-4a1 1 0 0 0-1 1.5zM9 8.5v4M7 10.5l2 2 2-2" />,
};

export interface PaneModes {
  current: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

function ModeSwitch({ modes, collapsed, onToggle, focusOnMount }: {
  modes: PaneModes;
  collapsed: boolean;
  onToggle: () => void;
  /** The expanded switch and the rail are separate elements, so the clicked mode takes focus in the one that replaces it. */
  focusOnMount: { current: Mode | null };
}) {
  return (
    <div className={collapsed ? "pane-modes pane-modes--rail" : "pane-modes"} role="group" aria-label="Mode">
      {MODES.map(({ id, label }) => {
        const selected = modes.current === id;
        return (
          <button key={id} type="button" className="pane-mode" aria-label={label}
            aria-pressed={selected} aria-expanded={selected ? !collapsed : undefined}
            aria-keyshortcuts={selected ? "Control+B" : undefined} disabled={modes.disabled}
            title={selected ? `${label} · ${collapsed ? "Show" : "Hide"} the Photo pane (Ctrl+B)` : label}
            ref={(button) => {
              if (button && focusOnMount.current === id) {
                focusOnMount.current = null;
                button.focus();
              }
            }}
            onClick={() => {
              if (selected || collapsed) focusOnMount.current = id;
              if (!selected) modes.onChange(id);
              if (selected || collapsed) onToggle();
            }}>
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor"
              strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">{MODE_ICONS[id]}</svg>
            {!collapsed && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The left pane. It always shows the mode switch, and collapses to an icon-only rail of it, as in VS Code. */
export default function PhotoPane({ modes, settings, onChange, children }: {
  modes: PaneModes;
  settings: PhotoPaneSettings;
  onChange: (change: Partial<PhotoPaneSettings>) => void;
  children: ReactNode;
}) {
  const toggle = () => onChange({ collapsed: !settings.collapsed });
  const focusOnMount = useRef<Mode | null>(null);
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
        {!settings.collapsed && <ModeSwitch modes={modes} collapsed={false} onToggle={toggle} focusOnMount={focusOnMount} />}
        <div className="photo-pane-content">{children}</div>
        <div className="photo-pane-resizer" role="separator" aria-orientation="vertical" aria-label="Resize Photos"
          aria-valuenow={width} aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth} tabIndex={0}
          onMouseDown={startResize} onKeyDown={resizeWithKeys} />
      </section>
      {settings.collapsed && (
        <nav className="photo-pane-rail" aria-label="Modes">
          <ModeSwitch modes={modes} collapsed onToggle={toggle} focusOnMount={focusOnMount} />
        </nav>
      )}
    </>
  );
}
