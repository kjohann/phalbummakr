import type { EdgeMargins, Rectangle, Slot } from "../core";

interface Options {
  slots: Slot[];
  photoAspect: number;
  pageMm: { width: number; height: number };
  pagePixels: { width: number; height: number };
  bleedMm: EdgeMargins;
  pointer: { x: number; y: number };
  previous?: { rect: Rectangle } | null;
}

export function smartPlacement({ slots, photoAspect, pageMm, pagePixels, bleedMm, pointer, previous }: Options): { rect: Rectangle } | null {
  const candidates: { rect: Rectangle; pattern: boolean; member?: string }[] = [];
  const patternMembers = new Set<string>();
  for (const slot of slots) {
    if (slot.type !== "photo") continue;
    const width = slot.height * pageMm.height * photoAspect / pageMm.width;
    const height = slot.width * pageMm.width / photoAspect / pageMm.height;
    const gapX = 3 / pageMm.width;
    const gapY = 3 / pageMm.height;
    candidates.push(
      { rect: { x: slot.x + slot.width + gapX, y: slot.y, width, height: slot.height }, pattern: false, member: `x:${slot.id}` },
      { rect: { x: slot.x - gapX - width, y: slot.y, width, height: slot.height }, pattern: false, member: `x:${slot.id}` },
      { rect: { x: slot.x, y: slot.y + slot.height + gapY, width: slot.width, height }, pattern: false, member: `y:${slot.id}` },
      { rect: { x: slot.x, y: slot.y - gapY - height, width: slot.width, height }, pattern: false, member: `y:${slot.id}` },
    );
  }
  for (const axis of ["x", "y"] as const) {
    const cross = axis === "x" ? "y" : "x";
    const length = axis === "x" ? "width" : "height";
    const crossLength = axis === "x" ? "height" : "width";
    const photos = slots.filter((slot) => slot.type === "photo").sort((a, b) => a[axis] - b[axis]);
    for (let i = 0; i < photos.length; i += 1) {
      const first = photos[i];
      const aligned = photos.filter((slot) => Math.abs(slot[cross] - first[cross]) * pagePixels[crossLength] <= 2
        && Math.abs(slot[crossLength] - first[crossLength]) * pagePixels[crossLength] <= 2);
      const index = aligned.indexOf(first);
      const second = aligned[index + 1];
      if (!second) continue;
      const gap = second[axis] - first[axis] - first[length];
      if (gap < -1e-9) continue;
      patternMembers.add(`${axis}:${first.id}`);
      patternMembers.add(`${axis}:${second.id}`);
      const add = (anchor: Slot, before: boolean) => {
        const width = axis === "x" ? anchor.height * pageMm.height * photoAspect / pageMm.width : anchor.width;
        const height = axis === "y" ? anchor.width * pageMm.width / photoAspect / pageMm.height : anchor.height;
        const rect = { x: anchor.x, y: anchor.y, width, height };
        rect[axis] = before ? anchor[axis] - gap - rect[length] : anchor[axis] + anchor[length] + gap;
        candidates.push({ rect, pattern: true });
      };
      if (index === 0) add(first, true);
      if (index + 2 === aligned.length) add(second, false);
    }
  }
  const valid = candidates.filter(({ rect, member }) => (!member || !patternMembers.has(member))
    && rect.x >= -bleedMm.x / pageMm.width - 1e-9
    && rect.y >= -bleedMm.y / pageMm.height - 1e-9
    && rect.x + rect.width <= 1 + bleedMm.x / pageMm.width + 1e-9
    && rect.y + rect.height <= 1 + bleedMm.y / pageMm.height + 1e-9
    && !slots.some((slot) => rect.x < slot.x + slot.width - 1e-9 && rect.x + rect.width > slot.x + 1e-9
      && rect.y < slot.y + slot.height - 1e-9 && rect.y + rect.height > slot.y + 1e-9))
    .map(({ rect, pattern }) => ({ rect, pattern, distance: Math.hypot(
      (rect.x + rect.width / 2 - pointer.x) * pagePixels.width,
      (rect.y + rect.height / 2 - pointer.y) * pagePixels.height,
    ) }))
    .filter(({ distance }) => distance <= 32)
    .sort((a, b) => Number(b.pattern) - Number(a.pattern) || a.distance - b.distance);
  const best = valid[0];
  const retained = best && previous && valid.find((candidate) => candidate.pattern === best.pattern
    && candidate.distance <= best.distance + 2
    && (["x", "y", "width", "height"] as const).every((key) => Math.abs(candidate.rect[key] - previous.rect[key]) < 1e-9));
  return best ? { rect: (retained || best).rect } : null;
}
