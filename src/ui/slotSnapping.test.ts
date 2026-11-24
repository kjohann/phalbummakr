import { expect, it } from "vitest";
import { snapSlot } from "./slotSnapping";

it("snaps near the Safe Zone but leaves a free position unchanged", () => {
  const options = {
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [],
    kind: "move" as const,
    resizeHeight: true,
  };
  const near = snapSlot({ ...options, rect: { x: 0.026, y: 0.2, width: 0.3, height: 0.2 } });
  expect(near.rect.x).toBeCloseTo(0.02, 9);
  expect(near.guides).toContainEqual({ axis: "x", position: 0.02, target: "Safe Zone" });

  const free = snapSlot({ ...options, rect: { x: 0.09, y: 0.2, width: 0.3, height: 0.2 } });
  expect(free.rect.x).toBe(0.09);
  expect(free.guides).toEqual([]);
});

it("aligns a moving Slot with another Slot's edge and center on independent axes", () => {
  const result = snapSlot({
    rect: { x: 0.221, y: 0.551, width: 0.2, height: 0.1 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [{ x: 0.42, y: 0.5, width: 0.2, height: 0.2 }],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.x).toBeCloseTo(0.22, 9);
  expect(result.rect.y).toBeCloseTo(0.55, 9);
  expect(result.guides).toEqual([
    { axis: "x", position: 0.42, target: "Slot" },
    { axis: "y", position: 0.6, target: "Slot" },
  ]);
});

it("snaps a Photo Slot's resized edges without moving its fixed corner", () => {
  const result = snapSlot({
    rect: { x: 0.2, y: 0.2, width: 0.304, height: 0.794 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [{ x: 0.5, y: 0.45, width: 0.2, height: 0.12 }],
    kind: "resize",
    resizeHeight: true,
  });
  expect(result.rect.x).toBe(0.2);
  expect(result.rect.y).toBe(0.2);
  expect(result.rect.width).toBeCloseTo(0.3, 9);
  expect(result.rect.height).toBeCloseTo(0.8, 9);
  expect(result.guides).toEqual([
    { axis: "x", position: 0.5, target: "Slot" },
    { axis: "y", position: 1, target: "Page edge" },
  ]);
});

it("snaps the moving top and left edges without moving the opposite corner", () => {
  const result = snapSlot({
    rect: { x: 0.023, y: 0.026, width: 0.677, height: 0.674 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 }, otherSlots: [],
    kind: "resize", resizeHeight: true, resizeEdges: { x: -1, y: -1 },
  });
  expect(result.rect.x).toBeCloseTo(0.02, 9);
  expect(result.rect.y).toBeCloseTo(0.03, 9);
  expect(result.rect.x + result.rect.width).toBeCloseTo(0.7, 9);
  expect(result.rect.y + result.rect.height).toBeCloseTo(0.7, 9);
  expect(result.guides).toEqual([
    { axis: "x", position: 0.02, target: "Safe Zone" },
    { axis: "y", position: 0.03, target: "Safe Zone" },
  ]);
});

it.each(["between", "after"] as const)("matches equal gaps when resizing a left edge %s other Slots", (position) => {
  const rect = position === "between"
    ? { x: 0.379, y: 0.25, width: 0.246, height: 0.25 }
    : { x: 0.629, y: 0.25, width: 0.246, height: 0.25 };
  const otherSlots = position === "between"
    ? [{ x: 0.125, y: 0.25, width: 0.125, height: 0.25 }, { x: 0.75, y: 0.25, width: 0.125, height: 0.25 }]
    : [{ x: 0.125, y: 0.25, width: 0.125, height: 0.25 }, { x: 0.375, y: 0.25, width: 0.125, height: 0.25 }];
  const result = snapSlot({
    rect, pageSize: { width: 600, height: 400 }, safeZone: { x: 0.02, y: 0.03 }, otherSlots,
    kind: "resize", resizeHeight: false, resizeEdges: { x: -1, y: 0 },
  });
  expect(result.rect.x).toBeCloseTo(position === "between" ? 0.375 : 0.625, 9);
  expect(result.rect.x + result.rect.width).toBeCloseTo(rect.x + rect.width, 9);
  expect(result.guides).toContainEqual({
    axis: "x", target: "Equal gap", cross: 0.375,
    gaps: position === "between"
      ? [{ start: 0.25, end: 0.375 }, { start: 0.625, end: 0.75 }]
      : [{ start: 0.25, end: 0.375 }, { start: 0.5, end: 0.625 }],
  });
});

it("rejects unreachable left-edge targets using the unclamped pointer rather than the minimum-size edge", () => {
  const options = {
    rect: { x: 0.68, y: 0.2, width: 0.02, height: 0.2 },
    pageSize: { width: 600, height: 400 }, safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [{ x: 0.684, y: 0.5, width: 0.1, height: 0.1 }, { x: 0.676, y: 0.8, width: 0.1, height: 0.1 }],
    kind: "resize" as const, resizeHeight: false, resizeEdges: { x: -1 as const, y: 0 as const },
    project: (rect: { x: number; y: number; width: number; height: number }) => {
      const width = Math.max(0.02, rect.width);
      return { ...rect, x: 0.7 - width, width };
    },
  };
  const result = snapSlot({ ...options, unclamped: { ...options.rect, x: 0.685, width: 0.015 } });
  expect(result.rect.x).toBeCloseTo(0.676, 9);
  expect(result.rect.width).toBeCloseTo(0.024, 9);
  expect(result.guides).toContainEqual({ axis: "x", position: 0.676, target: "Slot" });
  expect(snapSlot({ ...options, unclamped: { ...options.rect, x: 2, width: -1.3 } }).guides).toEqual([]);
});

it("shows matching top, center and bottom guides for equal-height Slots", () => {
  const result = snapSlot({
    rect: { x: 0.125, y: 0.254, width: 0.125, height: 0.25 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.625, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.8, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.5, y: 0.245, width: 0.125, height: 0.25 },
    ],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.y).toBeCloseTo(0.25, 9);
  expect(result.guides).toEqual([
    { axis: "y", position: 0.25, target: "Slot" },
    { axis: "y", position: 0.5, target: "Page centre" },
    { axis: "y", position: 0.375, target: "Slot" },
  ]);
});

it("shows all alignments on both axes after resizing and Text Slot reflow", () => {
  const result = snapSlot({
    rect: { x: 0.125, y: 0.125, width: 0.254, height: 0.1 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [{ x: 0.125, y: 0.125, width: 0.25, height: 0.25 }],
    kind: "resize",
    resizeHeight: false,
    project: (rect) => ({ ...rect, height: rect.width <= 0.25 ? 0.25 : 0.1 }),
  });
  expect(result.rect).toEqual({ x: 0.125, y: 0.125, width: 0.25, height: 0.25 });
  expect(result.guides).toEqual([
    { axis: "x", position: 0.375, target: "Slot" },
    { axis: "x", position: 0.125, target: "Slot" },
    { axis: "x", position: 0.25, target: "Slot" },
    { axis: "y", position: 0.125, target: "Slot" },
    { axis: "y", position: 0.25, target: "Slot" },
    { axis: "y", position: 0.375, target: "Slot" },
  ]);
});

it("centers a moving Slot between two Slots with equal gaps", () => {
  const result = snapSlot({
    rect: { x: 0.379, y: 0.25, width: 0.25, height: 0.25 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.125, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.75, y: 0.25, width: 0.125, height: 0.25 },
    ],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.x).toBeCloseTo(0.375, 9);
  expect(result.guides).toContainEqual({
    axis: "x", target: "Equal gap", cross: 0.375,
    gaps: [{ start: 0.25, end: 0.375 }, { start: 0.625, end: 0.75 }],
  });
});

it("extends an existing vertical gap when moving a third Slot", () => {
  const result = snapSlot({
    rect: { x: 0.25, y: 0.629, width: 0.25, height: 0.125 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.25, y: 0.125, width: 0.25, height: 0.125 },
      { x: 0.25, y: 0.375, width: 0.25, height: 0.125 },
    ],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.y).toBeCloseTo(0.625, 9);
  expect(result.guides).toContainEqual({
    axis: "y", target: "Equal gap", cross: 0.375,
    gaps: [{ start: 0.25, end: 0.375 }, { start: 0.5, end: 0.625 }],
  });
});

it("matches equal gaps when resizing a Text Slot without changing its height", () => {
  const result = snapSlot({
    rect: { x: 0.375, y: 0.25, width: 0.254, height: 0.25 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.125, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.75, y: 0.25, width: 0.125, height: 0.25 },
    ],
    kind: "resize",
    resizeHeight: false,
  });
  expect(result.rect.x).toBe(0.375);
  expect(result.rect.width).toBeCloseTo(0.25, 9);
  expect(result.rect.height).toBe(0.25);
  expect(result.guides).toEqual([
    {
      axis: "x", target: "Equal gap", cross: 0.375,
      gaps: [{ start: 0.25, end: 0.375 }, { start: 0.625, end: 0.75 }],
    },
    { axis: "x", position: 0.5, target: "Page centre" },
    { axis: "y", position: 0.5, target: "Page centre" },
    { axis: "y", position: 0.25, target: "Slot" },
    { axis: "y", position: 0.375, target: "Slot" },
  ]);
});

it("does not claim equal gaps through an intervening Slot", () => {
  // Shifted left so the obstructed equal gap is not also at the Page centre.
  const result = snapSlot({
    rect: { x: 0.402, y: 0.25, width: 0.125, height: 0.25 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.025, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.2125, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.36875, y: 0.25, width: 0.0234375, height: 0.25 },
    ],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.x).toBeCloseTo(0.3921875, 9);
  expect(result.guides).toContainEqual({ axis: "x", position: 0.3921875, target: "Slot" });
});

it("finds equal gaps in one row even when another row has an intervening Slot", () => {
  const result = snapSlot({
    rect: { x: 0.379, y: 0.125, width: 0.25, height: 0.625 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.125, y: 0.125, width: 0.125, height: 0.125 },
      { x: 0.75, y: 0.125, width: 0.125, height: 0.125 },
      { x: 0.43, y: 0.625, width: 0.04, height: 0.125 },
    ],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.x).toBeCloseTo(0.375, 9);
  expect(result.guides).toContainEqual({
    axis: "x", target: "Equal gap", cross: 0.1875,
    gaps: [{ start: 0.25, end: 0.375 }, { start: 0.625, end: 0.75 }],
  });
});

it("rejects a gap obstructed after a resized Text Slot reflows", () => {
  const result = snapSlot({
    rect: { x: 0.375, y: 0.2, width: 0.254, height: 0.1 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.125, y: 0.125, width: 0.125, height: 0.375 },
      { x: 0.75, y: 0.125, width: 0.125, height: 0.375 },
      { x: 0.3, y: 0.35, width: 0.02, height: 0.1 },
    ],
    kind: "resize",
    resizeHeight: false,
    project: (rect) => ({ ...rect, height: rect.width < 0.252 ? 0.3 : 0.1 }),
  });
  expect(result.rect.width).toBe(0.254);
  expect(result.guides).toEqual([]);
});

it("uses a six-screen-pixel proximity threshold at different Page scales", () => {
  const options = {
    rect: { x: 0.01, y: 0.3, width: 0.2, height: 0.2 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.1, y: 0.1 },
    otherSlots: [],
    kind: "move" as const,
    resizeHeight: true,
  };
  expect(snapSlot(options).rect.x).toBeCloseTo(0, 9);
  expect(snapSlot({ ...options, rect: { ...options.rect, x: 6.01 / 600 } }).rect.x).toBe(6.01 / 600);
  expect(snapSlot({ ...options, pageSize: { width: 1200, height: 800 } }).rect.x).toBe(0.01);
});

it("snaps a moving Slot's centre or edge to the Page centre on both axes", () => {
  const result = snapSlot({
    rect: { x: 0.394, y: 0.503, width: 0.2, height: 0.2 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.x).toBeCloseTo(0.4, 9);
  expect(result.rect.y).toBeCloseTo(0.5, 9);
  expect(result.guides).toEqual([
    { axis: "x", position: 0.5, target: "Page centre" },
    { axis: "y", position: 0.5, target: "Page centre" },
  ]);
});
it("only snaps Selected Slots to an equal gap that one of them actually borders", () => {
  const options = {
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [{ x: 0.5, y: 0.1, width: 0.1, height: 0.1 }, { x: 0.7, y: 0.1, width: 0.1, height: 0.1 }],
    kind: "move" as const,
    resizeHeight: true,
  };
  // The right edge of the bounds belongs to the lower Slot, which is not in the row.
  const diagonal = snapSlot({
    ...options,
    rect: { x: 0.1 + 4 / 600, y: 0.1, width: 0.3, height: 0.6 },
    members: [{ x: 0, y: 0, width: 0.1, height: 0.1 }, { x: 0.2, y: 0.5, width: 0.1, height: 0.1 }],
  });
  expect(diagonal.guides.some((guide) => guide.target === "Equal gap")).toBe(false);

  const inRow = snapSlot({
    ...options,
    rect: { x: 0.1 + 4 / 600, y: 0.1, width: 0.3, height: 0.6 },
    members: [{ x: 0.2, y: 0, width: 0.1, height: 0.1 }, { x: 0, y: 0.5, width: 0.1, height: 0.1 }],
  });
  expect(inRow.rect.x).toBeCloseTo(0.1, 9);
  expect(inRow.guides).toContainEqual({
    axis: "x", target: "Equal gap", cross: expect.closeTo(0.15, 9),
    gaps: [{ start: 0.4, end: 0.5 }, { start: 0.6, end: 0.7 }],
  });
});