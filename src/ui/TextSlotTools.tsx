import { useEffect, useRef, useState, type KeyboardEventHandler, type ReactNode } from "react";
import type { TextStyle } from "../core";
import { keepFocus } from "./SlotTools";

const FONT_SIZES = [12, 18, 24, 36, 48, 72];

interface Props {
  style: TextStyle;
  fonts: string[] | null;
  fontError: string | null;
  disabled: boolean;
  onStyle: (style: Partial<TextStyle>) => void;
  /** Called once a style choice is complete, so focus can go back to the text being edited. */
  onCommit: () => void;
  onRetryFonts: () => void;
  onShortcut: KeyboardEventHandler<HTMLDivElement>;
  /** Slot actions shown after the text controls. */
  children?: ReactNode;
}

export default function TextSlotTools({ style, fonts, fontError, disabled, onStyle, onCommit, onRetryFonts, onShortcut, children }: Props) {
  const colourRef = useRef<HTMLInputElement>(null);
  const appliedOnEnter = useRef(false);
  const [customSize, setCustomSize] = useState(!FONT_SIZES.includes(style.fontSize));
  const [draftSize, setDraftSize] = useState(String(style.fontSize));
  const [sizeError, setSizeError] = useState<string | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => { setDraftSize(String(style.fontSize)); }, [style.fontSize]);

  // React's onChange follows the colour picker live; the native change event fires once the colour is chosen.
  useEffect(() => {
    const input = colourRef.current;
    if (!input) return;
    const commit = () => commitRef.current();
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);

  function applyExactSize() {
    const fontSize = Number(draftSize);
    if (!draftSize.trim() || !Number.isFinite(fontSize) || fontSize < 1 || fontSize > 1000) {
      setSizeError("Enter a font size between 1 and 1000 pt.");
      return false;
    }
    setSizeError(null);
    if (fontSize !== style.fontSize) onStyle({ fontSize });
    return true;
  }

  return (
    <div className="slot-tools text-slot-tools" role="group" aria-label="Text Slot tools"
      onMouseDown={keepFocus} onKeyDown={onShortcut}>
      <select aria-label="Font family" title="Font family" value={style.fontFamily} disabled={disabled}
        onChange={(event) => { onStyle({ fontFamily: event.target.value }); onCommit(); }}>
        {[...new Set([style.fontFamily, ...(fonts ?? [])])].map((font) => <option key={font} value={font}>{font}</option>)}
      </select>
      <select aria-label="Font size" title="Font size" value={customSize || !FONT_SIZES.includes(style.fontSize) ? "custom" : style.fontSize}
        disabled={disabled} onChange={(event) => {
          const custom = event.target.value === "custom";
          setCustomSize(custom);
          setSizeError(null);
          if (!custom) {
            onStyle({ fontSize: Number(event.target.value) });
            onCommit();
          }
        }}>
        {FONT_SIZES.map((points) => <option key={points} value={points}>{points} pt</option>)}
        <option value="custom">Custom...</option>
      </select>
      {customSize && (
        <input aria-label="Font size (pt)" title="Exact size in points" type="number" min="1" max="1000" step="any"
          disabled={disabled} value={draftSize} onChange={(event) => { setDraftSize(event.target.value); setSizeError(null); }}
          onBlur={() => {
            if (appliedOnEnter.current) appliedOnEnter.current = false;
            else applyExactSize();
          }} onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!applyExactSize()) return;
            // Returning focus to the text blurs this input, which must not apply the size again.
            appliedOnEnter.current = true;
            onCommit();
            if (document.activeElement === event.currentTarget) appliedOnEnter.current = false;
          }} />
      )}
      <input ref={colourRef} aria-label="Text colour" title="Text colour" type="color" value={style.color} disabled={disabled}
        onChange={(event) => onStyle({ color: event.target.value })} />
      <details className="text-format-menu">
        <summary className="command" title="Bold, italic and underline">Format</summary>
        <div className="text-format-options">
          {(["bold", "italic", "underline"] as const).map((key) => (
            <label key={key}>
              <input aria-label={key[0].toUpperCase() + key.slice(1)} type="checkbox" checked={style[key]} disabled={disabled}
                onChange={(event) => { onStyle({ [key]: event.target.checked }); onCommit(); }} />
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
          onCommit();
        }}>
        <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
      </select>
      {children && <><span className="toolbar-divider" aria-hidden="true" />{children}</>}
      {sizeError && <span className="slot-tools-error" role="alert">{sizeError}</span>}
      {fontError && (
        <span className="slot-tools-error" role="alert">
          {fontError}{" "}<button type="button" className="command" onClick={onRetryFonts}>Retry fonts</button>
        </span>
      )}
    </div>
  );
}
