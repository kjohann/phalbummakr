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
  expect(result.guides).toEqual([{
    axis: "x", target: "Equal gap", cross: 0.375,
    gaps: [{ start: 0.25, end: 0.375 }, { start: 0.625, end: 0.75 }],
  }]);
});

it("does not claim equal gaps through an intervening Slot", () => {
  const result = snapSlot({
    rect: { x: 0.502, y: 0.25, width: 0.125, height: 0.25 },
    pageSize: { width: 600, height: 400 },
    safeZone: { x: 0.02, y: 0.03 },
    otherSlots: [
      { x: 0.125, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.3125, y: 0.25, width: 0.125, height: 0.25 },
      { x: 0.46875, y: 0.25, width: 0.0234375, height: 0.25 },
    ],
    kind: "move",
    resizeHeight: true,
  });
  expect(result.rect.x).toBeCloseTo(0.4921875, 9);
  expect(result.guides).toContainEqual({ axis: "x", position: 0.4921875, target: "Slot" });
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
