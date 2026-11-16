import type { Rectangle } from "../core";

interface AlignmentGuide {
  axis: "x" | "y";
  position: number;
  target: "Page edge" | "Safe Zone" | "Slot";
}

interface GapGuide {
  axis: "x" | "y";
  target: "Equal gap";
  cross: number;
  gaps: { start: number; end: number }[];
}

export type SnapGuide = AlignmentGuide | GapGuide;

const SNAP_DISTANCE_PX = 6;

interface SnapOptions {
  rect: Rectangle;
  unclamped?: Rectangle;
  pageSize: { width: number; height: number };
  safeZone: { x: number; y: number };
  otherSlots: Rectangle[];
  kind: "move" | "resize";
  resizeHeight: boolean;
  project?: (rect: Rectangle) => Rectangle;
}

type Candidate = {
  offset: number;
  distance: number;
} & (
  | { guide: AlignmentGuide; crossRange: null }
  | {
    guide: GapGuide;
    crossRange: { start: number; end: number };
    references: [Rectangle, Rectangle];
    clearRanges: GapGuide["gaps"];
  }
);

function size(rect: Rectangle, axis: "x" | "y") {
  return axis === "x" ? rect.width : rect.height;
}

function end(rect: Rectangle, axis: "x" | "y") {
  return rect[axis] + size(rect, axis);
}

function guideForRect(candidate: Candidate, rect: Rectangle, otherSlots: Rectangle[]): SnapGuide | null {
  if (!candidate.crossRange) return candidate.guide;
  const crossAxis = candidate.guide.axis === "x" ? "y" : "x";
  const start = Math.max(candidate.crossRange.start, rect[crossAxis]);
  const finish = Math.min(candidate.crossRange.end, end(rect, crossAxis));
  if (start >= finish || otherSlots.some((slot) => !candidate.references.includes(slot)
    && slot[crossAxis] < finish && end(slot, crossAxis) > start
    && candidate.clearRanges.some((range) => slot[candidate.guide.axis] < range.end
      && end(slot, candidate.guide.axis) > range.start))) return null;
  return { ...candidate.guide, cross: (start + finish) / 2 };
}

export function snapSlot({ rect, unclamped = rect, pageSize, safeZone, otherSlots, kind, resizeHeight, project }: SnapOptions): {
  rect: Rectangle;
  guides: SnapGuide[];
} {
  let snapped = { ...rect };
  const chosen: Candidate[] = [];

  for (const axis of ["x", "y"] as const) {
    if (kind === "resize" && axis === "y" && !resizeHeight) continue;
    const current = snapped;
    const length = size(current, axis);
    const pixels = axis === "x" ? pageSize.width : pageSize.height;
    const anchors = kind === "move" ? [0, 0.5, 1] : [1];
    const candidates: Candidate[] = [];
    const targets: { position: number; target: AlignmentGuide["target"] }[] = [
      { position: 0, target: "Page edge" },
      { position: 1, target: "Page edge" },
      { position: safeZone[axis], target: "Safe Zone" },
      { position: 1 - safeZone[axis], target: "Safe Zone" },
      ...otherSlots.flatMap((slot) => {
        const size = axis === "x" ? slot.width : slot.height;
        return [slot[axis], slot[axis] + size / 2, slot[axis] + size]
          .map((position) => ({ position, target: "Slot" as const }));
      }),
    ];
    for (const { position, target } of targets) {
      for (const anchor of anchors) {
        const offset = position - (current[axis] + length * anchor);
        const pointerAnchor = kind === "move" ? unclamped[axis] + length * anchor : end(unclamped, axis);
        const distance = Math.abs(position - pointerAnchor) * pixels;
        if (distance <= SNAP_DISTANCE_PX) {
          candidates.push({ offset, distance, guide: { axis, position, target }, crossRange: null });
        }
      }
    }

    {
      const crossAxis = axis === "x" ? "y" : "x";
      const neighbors = otherSlots.filter((slot) => slot[crossAxis] < end(current, crossAxis) && end(slot, crossAxis) > current[crossAxis])
        .sort((a, b) => a[axis] - b[axis]);
      for (let index = 0; index + 1 < neighbors.length; index += 1) {
        const first = neighbors[index];
        for (let nextIndex = index + 1; nextIndex < neighbors.length; nextIndex += 1) {
          const second = neighbors[nextIndex];
          const crossRange = {
            start: Math.max(first[crossAxis], second[crossAxis]),
            end: Math.min(end(first, crossAxis), end(second, crossAxis)),
          };
          const crossStart = Math.max(current[crossAxis], crossRange.start);
          const crossEnd = Math.min(end(current, crossAxis), crossRange.end);
          const existingGap = second[axis] - end(first, axis);
          if (crossStart >= crossEnd || existingGap <= 0) continue;
          const offer = (edge: number, gaps: GapGuide["gaps"], ranges: GapGuide["gaps"]) => {
            const offset = edge - (kind === "move" ? current[axis] : current[axis] + length);
            const pointerEdge = kind === "move" ? unclamped[axis] : end(unclamped, axis);
            const distance = Math.abs(edge - pointerEdge) * pixels;
            if (distance > SNAP_DISTANCE_PX) return;
            candidates.push({
              offset, distance, crossRange, references: [first, second], clearRanges: ranges,
              guide: {
                axis, target: "Equal gap", cross: (crossStart + crossEnd) / 2,
                gaps,
              },
            });
          };
          const existing = { start: end(first, axis), end: second[axis] };
          if (kind === "move") {
            const betweenGap = (existingGap - length) / 2;
            if (betweenGap > 0) {
              const start = end(first, axis) + betweenGap;
              offer(start, [{ start: end(first, axis), end: start }, { start: start + length, end: second[axis] }], [existing]);
            }
            const after = end(second, axis) + existingGap;
            offer(after, [existing, { start: end(second, axis), end: after }],
              [existing, { start: end(second, axis), end: after + length }]);
            const before = first[axis] - existingGap - length;
            offer(before, [{ start: before + length, end: first[axis] }, existing], [existing, { start: before, end: first[axis] }]);
          } else {
            const firstGap = current[axis] - end(first, axis);
            const betweenEnd = second[axis] - firstGap;
            if (firstGap > 0 && betweenEnd > current[axis]) {
              offer(betweenEnd, [{ start: end(first, axis), end: current[axis] }, { start: betweenEnd, end: second[axis] }], [existing]);
            }
            const beforeEnd = first[axis] - existingGap;
            if (beforeEnd > current[axis]) {
              offer(beforeEnd, [{ start: beforeEnd, end: first[axis] }, existing], [existing, { start: current[axis], end: first[axis] }]);
            }
          }
        }
      }
    }

    for (const candidate of candidates.sort((a, b) => a.distance - b.distance)) {
      const next = { ...snapped };
      if (kind === "move") next[axis] += candidate.offset;
      else if (axis === "x") next.width += candidate.offset;
      else next.height += candidate.offset;
      const projected = project ? project(next) : next;
      const property = kind === "move" ? axis : axis === "x" ? "width" : "height";
      if (Math.abs(projected[property] - next[property]) >= 1e-9
        || !guideForRect(candidate, projected, otherSlots)
        || chosen.some((previous) => !guideForRect(previous, projected, otherSlots))) continue;
      snapped = projected;
      chosen.push(candidate);
      break;
    }
  }
  const guides = chosen.map((candidate) => {
    const guide = guideForRect(candidate, snapped, otherSlots);
    if (!guide) throw new Error("A snapped guide no longer matches the Slot.");
    return guide;
  });
  return { rect: snapped, guides };
}
