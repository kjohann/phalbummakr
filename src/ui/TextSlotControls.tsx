import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEventHandler, type ReactNode } from "react";
import type { Rectangle, TextStyle } from "../core";
import { useAttachedPosition } from "./SlotToolbar";

const FONT_SIZES = [12, 18, 24, 36, 48, 72];

interface Props {
  anchor: Rectangle;
  viewport: { width: number; height: number };
  style: TextStyle;
  fonts: string[] | null;
  fontError: string | null;
  disabled: boolean;
  onStyle: (style: Partial<TextStyle>) => void;
  onRetryFonts: () => void;
  onShortcut: KeyboardEventHandler<HTMLDivElement>;
  /** Slot actions shown after the text controls. */
  children?: ReactNode;
}

export default function TextSlotControls({ anchor, viewport, style, fonts, fontError, disabled, onStyle, onRetryFonts, onShortcut, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDetailsElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const { left, top, size } = useAttachedPosition(ref, anchor, viewport);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0, height: 0, menuHeight: 0 });
  const [customSize, setCustomSize] = useState(!FONT_SIZES.includes(style.fontSize));
  const [draftSize, setDraftSize] = useState(String(style.fontSize));
  const [sizeError, setSizeError] = useState<string | null>(null);

  useEffect(() => { setDraftSize(String(style.fontSize)); }, [style.fontSize]);

  function positionFormatMenu() {
    const details = formatRef.current;
    const options = optionsRef.current;
    if (!details || !options) return;
    setMenuAnchor({ x: details.offsetLeft, y: details.offsetTop, height: details.offsetHeight, menuHeight: options.offsetHeight });
  }

  useLayoutEffect(positionFormatMenu, [size.width, size.height]);

  function applyExactSize() {
    const fontSize = Number(draftSize);
    if (!draftSize.trim() || !Number.isFinite(fontSize) || fontSize < 1 || fontSize > 1000) {
      setSizeError("Enter a font size between 1 and 1000 pt.");
      return;
    }
    setSizeError(null);
    if (fontSize !== style.fontSize) onStyle({ fontSize });
  }

  const menuWidth = Math.min(180, Math.max(0, viewport.width - 16));
  const menuLeft = Math.max(8, Math.min(left + menuAnchor.x, viewport.width - menuWidth - 8)) - left - menuAnchor.x;
  const below = top + menuAnchor.y + menuAnchor.height + 8;
  const menuTop = Math.max(8, Math.min(
    below + menuAnchor.menuHeight <= viewport.height - 8 ? below : top + menuAnchor.y - menuAnchor.menuHeight - 8,
    viewport.height - menuAnchor.menuHeight - 8,
  )) - top - menuAnchor.y;

  return (
    <div ref={ref} className="slot-controls text-slot-controls" role="toolbar" aria-label="Text Slot controls"
      style={{ left, top }} onMouseDown={(event) => event.stopPropagation()} onKeyDown={onShortcut}>
      <select aria-label="Font family" title="Font family" value={style.fontFamily} disabled={disabled}
        onChange={(event) => onStyle({ fontFamily: event.target.value })}>
        {[...new Set([style.fontFamily, ...(fonts ?? [])])].map((font) => <option key={font} value={font}>{font}</option>)}
      </select>
      <select aria-label="Font size" title="Font size" value={customSize || !FONT_SIZES.includes(style.fontSize) ? "custom" : style.fontSize}
        disabled={disabled} onChange={(event) => {
          const custom = event.target.value === "custom";
          setCustomSize(custom);
          setSizeError(null);
          if (!custom) onStyle({ fontSize: Number(event.target.value) });
        }}>
        {FONT_SIZES.map((points) => <option key={points} value={points}>{points} pt</option>)}
        <option value="custom">Custom...</option>
      </select>
      {customSize && (
        <input aria-label="Font size (pt)" title="Exact size in points" type="number" min="1" max="1000" step="any"
          disabled={disabled} value={draftSize} onChange={(event) => { setDraftSize(event.target.value); setSizeError(null); }}
          onBlur={applyExactSize} onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); applyExactSize(); }
          }} />
      )}
      <input aria-label="Text colour" title="Text colour" type="color" value={style.color} disabled={disabled}
        onChange={(event) => onStyle({ color: event.target.value })} />
      <details ref={formatRef} className="text-format-menu" onToggle={positionFormatMenu}>
        <summary title="Bold, italic and underline">Format</summary>
        <div ref={optionsRef} className="text-format-options" style={{ left: menuLeft, top: menuTop, width: menuWidth }}>
          {(["bold", "italic", "underline"] as const).map((key) => (
            <label key={key}>
              <input aria-label={key[0].toUpperCase() + key.slice(1)} type="checkbox" checked={style[key]} disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onChange={(event) => onStyle({ [key]: event.target.checked })} />
              {key[0].toUpperCase() + key.slice(1)}
              <span>Ctrl+{key === "bold" ? "B" : key === "italic" ? "I" : "U"}</span>
            </label>
          ))}
        </div>
      </details>
      <select aria-label="Text alignment" title="Text alignment" value={style.align} disabled={disabled}
        onChange={(event) => {
          const align = event.target.value;
          if (align === "left" || align === "center" || align === "right") onStyle({ align });
        }}>
        <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
      </select>
      {children && <><span className="toolbar-divider" aria-hidden="true" />{children}</>}
      {sizeError && <span className="text-controls-error" role="alert">{sizeError}</span>}
      {fontError && (
        <span className="text-controls-error" role="alert">
          {fontError}{" "}<button type="button" className="button-quiet" onClick={onRetryFonts}>Retry fonts</button>
        </span>
      )}
    </div>
  );
}
