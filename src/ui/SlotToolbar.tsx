import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Rectangle } from "../core";

/** Places a toolbar above, below or beside its Slot, keeping it inside the editor. */
export function useAttachedPosition(ref: RefObject<HTMLElement | null>, anchor: Rectangle, viewport: { width: number; height: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setSize((current) => current.width === width && current.height === height ? current : { width, height });
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      setSize({ width: box?.inlineSize ?? entry.contentRect.width, height: box?.blockSize ?? entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  const fitsAbove = anchor.y >= size.height + 8;
  const fitsBelow = anchor.y + anchor.height + size.height + 8 <= viewport.height - 8;
  const fitsLeft = anchor.x >= size.width + 16;
  const fitsRight = anchor.x + anchor.width + size.width + 16 <= viewport.width;
  const beside = !fitsAbove && !fitsBelow && (fitsLeft || fitsRight);
  const left = beside
    ? fitsLeft ? anchor.x - size.width - 8 : anchor.x + anchor.width + 8
    : Math.max(8, Math.min(anchor.x, viewport.width - size.width - 8));
  const top = Math.max(8, Math.min(
    beside ? anchor.y : fitsAbove ? anchor.y - size.height - 8 : anchor.y + anchor.height + 8,
    viewport.height - size.height - 8,
  ));
  return { left, top, size };
}

export function SlotActions({ disabled, onRotate, onDelete }: {
  disabled: boolean;
  onRotate: (turn: 90 | -90) => void;
  onDelete: () => void;
}) {
  return <>
    <button type="button" className="button-quiet" aria-label="Rotate Slot counterclockwise" title="Rotate left"
      disabled={disabled} onClick={() => onRotate(-90)}>⟲</button>
    <button type="button" className="button-quiet" aria-label="Rotate Slot clockwise" title="Rotate right"
      disabled={disabled} onClick={() => onRotate(90)}>⟳</button>
    <button type="button" className="button-quiet" aria-label="Delete Slot" title="Delete"
      disabled={disabled} onClick={onDelete}>Delete</button>
  </>;
}

const ZOOM_STEP = 1.1;

export function PhotoSlotControls({ anchor, viewport, fit, disabled, onFit, onZoom, onRotate, onDelete }: {
  anchor: Rectangle;
  viewport: { width: number; height: number };
  /** Null when the Slot has no Placement. */
  fit: boolean | null;
  disabled: boolean;
  onFit: (fit: boolean) => void;
  onZoom: (factor: number) => void;
  onRotate: (turn: 90 | -90) => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { left, top } = useAttachedPosition(ref, anchor, viewport);
  return (
    <div ref={ref} className="slot-controls" role="toolbar" aria-label="Photo Slot controls"
      style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
      {fit !== null && <>
        <label className="slot-controls-toggle" title="Show the whole Photo">
          <input type="checkbox" aria-label="Fit Photo" disabled={disabled} checked={fit}
            onChange={(event) => onFit(event.target.checked)} /> Fit
        </label>
        {!fit && <>
          <button type="button" className="button-quiet" aria-label="Zoom out" title="Zoom out"
            disabled={disabled} onClick={() => onZoom(1 / ZOOM_STEP)}>−</button>
          <button type="button" className="button-quiet" aria-label="Zoom in" title="Zoom in"
            disabled={disabled} onClick={() => onZoom(ZOOM_STEP)}>+</button>
        </>}
        <span className="toolbar-divider" aria-hidden="true" />
      </>}
      <SlotActions disabled={disabled} onRotate={onRotate} onDelete={onDelete} />
    </div>
  );
}
