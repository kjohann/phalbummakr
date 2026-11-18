import type { HistoryDirection } from "../core";

/** The undo or redo step a key press asks for: Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo. */
export function historyShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): HistoryDirection | null {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" && !event.shiftKey ? "redo" : null;
}