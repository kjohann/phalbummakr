import { useCallback, useEffect, useRef, type DragEvent } from "react";
import { hasPhotoDrag, leftElement } from "./photoDrag";

const EDGE = 40;
const MAX_STEP = 18;
/** Browsers repeat dragover while the pointer rests, but only every 350 ms or so. */
const IDLE_MS = 400;

/** Pixels to scroll per frame for a pointer at `y`: faster the closer it is to the top or bottom edge. */
function edgeStep({ top, bottom, height }: DOMRect, y: number) {
  const zone = Math.min(EDGE, height / 4);
  const speed = (distance: number) => Math.ceil(MAX_STEP * Math.min(1, 1 - distance / zone));
  if (y < top + zone) return -speed(y - top);
  if (y > bottom - zone) return speed(bottom - y);
  return 0;
}

/**
 * Returns dragover and dragleave handlers that scroll the element they are on while a Photo is
 * dragged near its top or bottom edge. One scroll runs at a time, so a single hook can serve
 * several scrolling areas.
 */
export function useEdgeScroll() {
  const scroll = useRef<{ element: HTMLElement; step: number; seen: number } | null>(null);
  const frame = useRef<number | null>(null);

  const stop = useCallback(() => {
    scroll.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("drop", stop);
    window.addEventListener("dragend", stop);
    return () => {
      stop();
      window.removeEventListener("drop", stop);
      window.removeEventListener("dragend", stop);
    };
  }, [stop]);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasPhotoDrag(event.dataTransfer)) return;
    const element = event.currentTarget;
    const step = edgeStep(element.getBoundingClientRect(), event.clientY);
    if (step === 0) {
      if (scroll.current?.element === element) stop();
      return;
    }
    const running = frame.current !== null;
    const moved = scroll.current?.element !== element;
    scroll.current = { element, step, seen: performance.now() };
    if (moved) element.scrollTop += step;
    if (running) return;
    const tick = () => {
      const current = scroll.current;
      if (!current || performance.now() - current.seen > IDLE_MS) {
        stop();
        return;
      }
      current.element.scrollTop += current.step;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [stop]);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (leftElement(event) && scroll.current?.element === event.currentTarget) stop();
  }, [stop]);

  return { onDragOver, onDragLeave };
}
