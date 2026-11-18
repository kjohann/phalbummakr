import type { MouseEvent } from "react";

/**
 * Keeps focus where it is, such as in a Text Slot being edited, when a tool is clicked.
 * Selects and text inputs still take focus, as they need it to work.
 */
export function keepFocus(event: MouseEvent) {
  if (event.target instanceof Element && !event.target.closest("select, input:not([type='checkbox'])")) event.preventDefault();
}

export function SlotActions({ disabled, onRotate, onDelete }: {
  disabled: boolean;
  onRotate: (turn: 90 | -90) => void;
  onDelete: () => void;
}) {
  return <>
    <button type="button" className="command" aria-label="Rotate Slot counterclockwise" title="Rotate left"
      disabled={disabled} onClick={() => onRotate(-90)}>⟲</button>
    <button type="button" className="command" aria-label="Rotate Slot clockwise" title="Rotate right"
      disabled={disabled} onClick={() => onRotate(90)}>⟳</button>
    <button type="button" className="command" aria-label="Delete Slot" title="Delete (Delete)" aria-keyshortcuts="Delete"
      disabled={disabled} onClick={onDelete}>Delete</button>
  </>;
}

const ZOOM_STEP = 1.1;

export function PhotoSlotTools({ fit, content = true, disabled, onFit, onZoom, onRotate, onDelete }: {
  /** Null when the Slot has no Placement. */
  fit: boolean | null;
  /** False where Slots hold no Photos, as in Layout mode: hides Fit and Zoom. */
  content?: boolean;
  disabled: boolean;
  onFit: (fit: boolean) => void;
  onZoom: (factor: number) => void;
  onRotate: (turn: 90 | -90) => void;
  onDelete: () => void;
}) {
  return (
    <div className="slot-tools" role="group" aria-label="Photo Slot tools" onMouseDown={keepFocus}>
      {content && fit !== null && <>
        <button type="button" className="command" aria-label="Fit Photo" aria-pressed={fit} title="Show the whole Photo"
          disabled={disabled} onClick={() => onFit(!fit)}>Fit</button>
        {!fit && <>
          <button type="button" className="command" aria-label="Zoom out" title="Zoom out"
            disabled={disabled} onClick={() => onZoom(1 / ZOOM_STEP)}>−</button>
          <button type="button" className="command" aria-label="Zoom in" title="Zoom in"
            disabled={disabled} onClick={() => onZoom(ZOOM_STEP)}>+</button>
        </>}
        <span className="toolbar-divider" aria-hidden="true" />
      </>}
      <SlotActions disabled={disabled} onRotate={onRotate} onDelete={onDelete} />
    </div>
  );
}
