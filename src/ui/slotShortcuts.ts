import { useEffect, useRef } from "react";

export const ZOOM_STEP = 1.1;

type SlotShortcut = { kind: "delete" } | { kind: "zoom"; factor: number } | { kind: "rotate"; turn: 90 | -90 };

/** Ctrl+Plus or Ctrl+Minus, the webview's page zoom. Ctrl+Plus may arrive as "+" or "=", depending on the layout and Shift. */
function pageZoom(event: KeyboardEvent): number | null {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") return ZOOM_STEP;
  if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") return 1 / ZOOM_STEP;
  return null;
}

export function isPageZoomKey(event: KeyboardEvent) {
  return pageZoom(event) !== null;
}

/** 1 for Ctrl+Plus, -1 for Ctrl+Minus, otherwise null. */
export function pageZoomStep(event: KeyboardEvent): 1 | -1 | null {
  const factor = pageZoom(event);
  return factor === null ? null : factor > 1 ? 1 : -1;
}

/** Ctrl+0, the webview's reset of page zoom. */
export function isPageZoomResetKey(event: KeyboardEvent) {
  return !event.altKey && (event.ctrlKey || event.metaKey) && (event.key === "0" || event.code === "Numpad0");
}

function slotShortcut(event: KeyboardEvent): SlotShortcut | null {
  if (event.key === "Delete") return { kind: "delete" };
  const factor = pageZoom(event);
  if (factor !== null) return { kind: "zoom", factor };
  if (event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return null;
  if (event.key === "ArrowLeft") return { kind: "rotate", turn: -90 };
  if (event.key === "ArrowRight") return { kind: "rotate", turn: 90 };
  return null;
}

/** Typing in a text field, editing a Text Slot or a dialog, including the New Album form, owns the keyboard. */
export function keyboardTaken(event: KeyboardEvent) {
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return true;
  return document.querySelector("[aria-modal='true']") !== null;
}

export interface SlotShortcutHandlers {
  /** Each handler is left out while its action is unavailable, such as with no Slot selected. */
  delete?: () => void;
  zoom?: (factor: number) => void;
  rotate?: (turn: 90 | -90) => void;
}

/**
 * Delete, Ctrl+Plus/Minus and Ctrl+Left/Right for the selected Slot while `active`.
 * `App` already stops Ctrl+Plus/Minus zooming the page, so a prevented zoom key still zooms the Crop.
 */
export function useSlotShortcuts(active: boolean, handlers: SlotShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!active) return;
    const keyDown = (event: KeyboardEvent) => {
      const shortcut = slotShortcut(event);
      if (!shortcut || (event.defaultPrevented && shortcut.kind !== "zoom") || keyboardTaken(event)) return;
      const { delete: remove, zoom, rotate } = latest.current;
      if (shortcut.kind === "delete" && remove) remove();
      else if (shortcut.kind === "zoom" && zoom) zoom(shortcut.factor);
      else if (shortcut.kind === "rotate" && rotate) rotate(shortcut.turn);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [active]);
}
