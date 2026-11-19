import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEventHandler, type ReactNode, type RefObject } from "react";
import type { TextStyle } from "../core";
import { observeToolsRoom } from "./CommandBar";
import { keepFocus } from "./SlotTools";

const FONT_SIZES = [12, 18, 24, 36, 48, 72];

const FORMATS = [
  { key: "bold", label: "Bold", shortcut: "B", glyph: "B" },
  { key: "italic", label: "Italic", shortcut: "I", glyph: "I" },
  { key: "underline", label: "Underline", shortcut: "U", glyph: "U" },
] as const;

const ALIGNMENTS = [
  { align: "left", label: "Align left", option: "Left" },
  { align: "center", label: "Align centre", option: "Centre" },
  { align: "right", label: "Align right", option: "Right" },
] as const;

function AlignIcon({ align }: { align: TextStyle["align"] }) {
  return <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" fill="currentColor">
    {[14, 9, 14, 9].map((width, line) => (
      <rect key={line} y={line * 3} width={width} height="1.6"
        x={align === "left" ? 0 : align === "center" ? (14 - width) / 2 : 14 - width} />
    ))}
  </svg>;
}

/** The width an element would take without being squeezed by the bar. */
function naturalWidth(element: HTMLElement) {
  const { flexShrink } = element.style;
  element.style.flexShrink = "0";
  const width = element.offsetWidth;
  element.style.flexShrink = flexShrink;
  return width;
}

const totalWidth = (elements: Iterable<HTMLElement>) => Array.from(elements, (element) => element.offsetWidth).reduce((a, b) => a + b, 0);

/**
 * Whether the formatting and alignment buttons must fold into dropdowns to fit the command bar.
 * They fold before the bar moves its own commands into "⋯". The decision compares the room in the bar with the
 * width the tools need unfolded, which doesn't depend on whether they are folded, so it never flips back and forth.
 */
function useFolding(rootRef: RefObject<HTMLDivElement | null>) {
  const [folded, setFolded] = useState(false);
  // The tools always mount unfolded, so this is known before they first fold.
  const unfoldedSetsWidth = useRef<number | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let room: number | null = null;
    const update = () => {
      if (room === null) return;
      const sets = root.querySelectorAll<HTMLElement>(".slot-tools-set");
      if (sets.length > 0) unfoldedSetsWidth.current = totalWidth(sets);
      if (unfoldedSetsWidth.current === null) return;
      const unfolded = naturalWidth(root) + (sets.length > 0 ? 0
        : unfoldedSetsWidth.current - totalWidth(root.querySelectorAll<HTMLElement>(".slot-tools-fold")));
      setFolded(unfolded > room);
    };
    const stopRoom = observeToolsRoom(root, (next) => { room = next; update(); });
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => { stopRoom(); observer.disconnect(); };
  }, [rootRef]);

  return folded;
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const folded = useFolding(rootRef);

  useEffect(() => { setDraftSize(String(style.fontSize)); }, [style.fontSize]);

  // React's onChange follows the colour picker live; the native change event fires once the colour is chosen.
  useEffect(() => {
    const input = colourRef.current;
    if (!input) return;
    const commit = () => commitRef.current();
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);

  function setFormat(key: (typeof FORMATS)[number]["key"], on: boolean) {
    onStyle({ [key]: on });
    onCommit();
  }

  function setAlign(align: TextStyle["align"]) {
    onStyle({ align });
    onCommit();
  }

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
    <div className="slot-tools text-slot-tools" role="group" aria-label="Text Slot tools" ref={rootRef}
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
      {folded ? <>
        <details className="text-format-menu slot-tools-fold">
          <summary className="command" title="Bold, italic and underline">Format</summary>
          <div className="text-format-options">
            {FORMATS.map(({ key, label, shortcut }) => (
              <label key={key}>
                <input aria-label={label} type="checkbox" checked={style[key]} disabled={disabled}
                  onChange={(event) => setFormat(key, event.target.checked)} />
                {label}
                <span>Ctrl+{shortcut}</span>
              </label>
            ))}
          </div>
        </details>
        <select className="slot-tools-fold" aria-label="Text alignment" title="Text alignment" value={style.align} disabled={disabled}
          onChange={(event) => {
            const align = ALIGNMENTS.find((item) => item.align === event.target.value)?.align;
            if (align) setAlign(align);
          }}>
          {ALIGNMENTS.map(({ align, option }) => <option key={align} value={align}>{option}</option>)}
        </select>
      </> : <>
        <span className="slot-tools-set">
          {FORMATS.map(({ key, label, shortcut, glyph }) => (
            <button key={key} type="button" className={`command text-format-${key}`} aria-label={label} aria-pressed={style[key]}
              title={`${label} (Ctrl+${shortcut})`} aria-keyshortcuts={`Control+${shortcut}`} disabled={disabled}
              onClick={() => setFormat(key, !style[key])}>{glyph}</button>
          ))}
        </span>
        <span className="slot-tools-set">
          {ALIGNMENTS.map(({ align, label }) => (
            <button key={align} type="button" className="command" aria-label={label} aria-pressed={style.align === align}
              title={label} disabled={disabled} onClick={() => setAlign(align)}>
              <AlignIcon align={align} />
            </button>
          ))}
        </span>
      </>}
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
