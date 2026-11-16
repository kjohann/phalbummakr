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

const SNAP_DISTANCE = 6;

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

interface Candidate {
  offset: number;
  distance: number;
  guide: SnapGuide;
  crossRange: { start: number; end: number } | null;
}

function size(rect: Rectangle, axis: "x" | "y") {
  return axis === "x" ? rect.width : rect.height;
}

function end(rect: Rectangle, axis: "x" | "y") {
  return rect[axis] + size(rect, axis);
}

function guideForRect(candidate: Candidate, rect: Rectangle): SnapGuide | null {
  if (!candidate.crossRange) return candidate.guide;
  if (candidate.guide.target !== "Equal gap") throw new Error("Only equal-gap guides have a cross range.");
  const crossAxis = candidate.guide.axis === "x" ? "y" : "x";
  const start = Math.max(candidate.crossRange.start, rect[crossAxis]);
  const finish = Math.min(candidate.crossRange.end, end(rect, crossAxis));
  return start < finish ? { ...candidate.guide, cross: (start + finish) / 2 } : null;
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
        if (distance <= SNAP_DISTANCE) {
          candidates.push({ offset, distance, guide: { axis, position, target }, crossRange: null });
        }
      }
    }

    {
      const crossAxis = axis === "x" ? "y" : "x";
      const neighbors = otherSlots.filter((slot) => slot[crossAxis] < end(current, crossAxis) && end(slot, crossAxis) > current[crossAxis])
        .sort((a, b) => a[axis] - b[axis]);
      for (let index = 0; index + 1 < neighbors.length; index += 1) {
        const left = neighbors[index];
        const right = neighbors[index + 1];
        const crossRange = {
          start: Math.max(left[crossAxis], right[crossAxis]),
          end: Math.min(end(left, crossAxis), end(right, crossAxis)),
        };
        const crossStart = Math.max(current[crossAxis], crossRange.start);
        const crossEnd = Math.min(end(current, crossAxis), crossRange.end);
        const existingGap = right[axis] - end(left, axis);
        if (crossStart >= crossEnd || existingGap <= 0) continue;
        const available = (start: number, finish: number) => !neighbors.some((slot) => slot !== left && slot !== right
          && slot[axis] < finish && end(slot, axis) > start);
        const offer = (edge: number, gaps: GapGuide["gaps"]) => {
          const offset = edge - (kind === "move" ? current[axis] : current[axis] + length);
          const pointerEdge = kind === "move" ? unclamped[axis] : end(unclamped, axis);
          const distance = Math.abs(edge - pointerEdge) * pixels;
          if (distance > SNAP_DISTANCE) return;
          candidates.push({
            offset, distance, crossRange,
            guide: {
              axis, target: "Equal gap", cross: (crossStart + crossEnd) / 2,
              gaps,
            },
          });
        };
        if (kind === "move") {
          const betweenGap = (existingGap - length) / 2;
          if (betweenGap > 0) {
            const start = end(left, axis) + betweenGap;
            offer(start, [{ start: end(left, axis), end: start }, { start: start + length, end: right[axis] }]);
          }
          const after = end(right, axis) + existingGap;
          if (available(end(right, axis), after + length)) {
            offer(after, [{ start: end(left, axis), end: right[axis] }, { start: end(right, axis), end: after }]);
          }
          const before = left[axis] - existingGap - length;
          if (available(before, left[axis])) {
            offer(before, [{ start: before + length, end: left[axis] }, { start: end(left, axis), end: right[axis] }]);
          }
        } else {
          const leftGap = current[axis] - end(left, axis);
          const betweenEnd = right[axis] - leftGap;
          if (leftGap > 0 && betweenEnd > current[axis]) {
            offer(betweenEnd, [{ start: end(left, axis), end: current[axis] }, { start: betweenEnd, end: right[axis] }]);
          }
          const beforeEnd = left[axis] - existingGap;
          if (beforeEnd > current[axis] && available(current[axis], left[axis])) {
            offer(beforeEnd, [{ start: beforeEnd, end: left[axis] }, { start: end(left, axis), end: right[axis] }]);
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
        || !guideForRect(candidate, projected)
        || chosen.some((previous) => !guideForRect(previous, projected))) continue;
      snapped = projected;
      chosen.push(candidate);
      break;
    }
  }
  return { rect: snapped, guides: chosen.map((candidate) => guideForRect(candidate, snapped)!) };
}
