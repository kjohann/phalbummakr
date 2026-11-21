/** How much Sort mode's work area is zoomed, where 1 shows the shown Photos at 100%. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
const LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
// A zoom this close to a preset counts as that preset, so a step always moves on.
const TOLERANCE = 0.005;

/** A change to the zoom, given the zoom it applies to. */
export type ZoomChange = (zoom: number) => number;

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The next preset level in (1) or out (-1), as Ctrl+Plus and Ctrl+Minus do. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next = direction > 0
    ? LEVELS.find((level) => level > zoom + TOLERANCE)
    : [...LEVELS].reverse().find((level) => level < zoom - TOLERANCE);
  return next ?? (direction > 0 ? MAX_ZOOM : MIN_ZOOM);
}

/** Scales the zoom smoothly, as Ctrl+wheel and pinching do. */
export function zoomBy(zoom: number, factor: number): number {
  return clampZoom(zoom * factor);
}

// Chromium sends a touchpad pinch as Ctrl+wheel with deltaY = -100 × ln(pinch scale), in small steps,
// while a mouse wheel notch is at least 100 px.
const PINCH_MAX_PIXELS = 50;

/**
 * The zoom factor for a Ctrl+wheel of `pixels`. A touchpad pinch follows the fingers;
 * a mouse wheel notch zooms about 13%.
 */
export function wheelZoomFactor(pixels: number): number {
  return Math.exp(-pixels / (Math.abs(pixels) < PINCH_MAX_PIXELS ? 100 : 800));
}

export function zoomLabel(zoom: number) {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * The scroll position, along one axis, that keeps the point `anchor` pixels into the work area in place
 * when the content scales by `scale`. `offset` and `nextOffset` are where the content starts before and
 * after, as a grid smaller than the work area is centred in it.
 */
export function anchoredScroll({ scroll, anchor, offset, nextOffset, scale }: {
  scroll: number; anchor: number; offset: number; nextOffset: number; scale: number;
}): number {
  return (scroll + anchor - offset) * scale + nextOffset - anchor;
}
