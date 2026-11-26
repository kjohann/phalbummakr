import { describe, expect, it } from "vitest";
import { smartPlacement } from "./smartPlacement";
import type { PhotoSlot, TextSlot } from "../core";

const anchor: PhotoSlot = {
  id: "anchor", type: "photo", x: 0.2, y: 0.3, width: 0.2, height: 0.2, placement: null,
};

describe("smart placement", () => {
  it("matches the height of a neighbouring Photo Slot without changing Photo proportions", () => {
    const result = smartPlacement({
      slots: [anchor], photoAspect: 2, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
      pointer: { x: 0.615, y: 0.4 },
    });
    expect(result?.rect.x).toBeCloseTo(0.415);
    expect(result?.rect.y).toBeCloseTo(0.3);
    expect(result?.rect.width).toBeCloseTo(0.4);
    expect(result?.rect.height).toBeCloseTo(0.2);
  });

  it("extends both ends of a row of differently proportioned Slots with its established gap", () => {
    const slots: PhotoSlot[] = [
      { ...anchor, x: 0.3, width: 0.1 },
      { ...anchor, id: "second", x: 0.42, width: 0.2 },
    ];
    const options = {
      slots, photoAspect: 0.5, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
    };
    expect(smartPlacement({ ...options, pointer: { x: 0.69, y: 0.4 } })?.rect.x).toBeCloseTo(0.64);
    expect(smartPlacement({ ...options, pointer: { x: 0.23, y: 0.4 } })?.rect.x).toBeCloseTo(0.18);
  });

  it("extends a locally established pair even when a third aligned Slot has a different gap", () => {
    const slots = [
      { ...anchor, x: 0.1, width: 0.1 },
      { ...anchor, id: "b", x: 0.22, width: 0.1 },
      { ...anchor, id: "c", x: 0.36, width: 0.1 },
    ];
    const result = smartPlacement({
      slots, photoAspect: 0.5, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
      pointer: { x: 0.53, y: 0.4 },
    });
    expect(result?.rect.x).toBeCloseTo(0.5, 6);
  });

  it("keeps the previous equally ranked suggestion when distances nearly tie", () => {
    const options = {
      slots: [{ ...anchor, width: 0.1, height: 0.1 },
        { ...anchor, id: "b", width: 0.1, height: 0.1, y: 0.31 }],
      photoAspect: 1, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
    };
    const previous = smartPlacement({ ...options, pointer: { x: 0.365, y: 0.35 } });
    const result = smartPlacement({ ...options, pointer: { x: 0.365, y: 0.356 }, previous });
    expect(result).toEqual(previous);
  });

  it("extends both ends of a column of rotated and empty Slots with zero gap", () => {
    const slots: PhotoSlot[] = [
      { ...anchor, x: 0.3, y: 0.2, width: 0.2, height: 0.1, rotation: 90 },
      { ...anchor, id: "b", x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
    ];
    const options = {
      slots, photoAspect: 2, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
    };
    expect(smartPlacement({ ...options, pointer: { x: 0.4, y: 0.55 } })?.rect).toEqual({
      x: 0.3, y: 0.5, width: 0.2, height: 0.1,
    });
    expect(smartPlacement({ ...options, pointer: { x: 0.4, y: 0.15 } })?.rect.y).toBeCloseTo(0.1);
  });

  it("allows Bleed and touching boundaries but suppresses overlap with a Text Slot", () => {
    const photo = { ...anchor, x: 0.7 };
    const text: TextSlot = {
      id: "text", type: "text", x: 1.015, y: 0.3, width: 0.1, height: 0.2,
      text: "", placeholder: "Text",
      style: { fontFamily: "Arial", fontSize: 12, color: "#000000", bold: false, italic: false, underline: false, align: "left" },
    };
    const options = {
      slots: [photo, text], photoAspect: 0.5, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, pointer: { x: 0.965, y: 0.4 },
    };
    expect(smartPlacement({ ...options, bleedMm: { x: 0, y: 0 } })).toBeNull();
    expect(smartPlacement({ ...options, bleedMm: { x: 3, y: 3 } })?.rect.x).toBeCloseTo(0.915);
    expect(smartPlacement({ ...options, bleedMm: { x: 3, y: 3 }, slots: [photo, { ...text, x: 0.99 }] })).toBeNull();
    expect(smartPlacement({ ...options, bleedMm: { x: 3, y: 3 }, slots: [text] })).toBeNull();
  });

  it("uses screen pixels for activation independently of zoom", () => {
    const options = {
      slots: [anchor], photoAspect: 2, pageMm: { width: 200, height: 200 }, bleedMm: { x: 0, y: 0 },
      pointer: { x: 0.615 + 31 / 400, y: 0.4 },
    };
    expect(smartPlacement({ ...options, pagePixels: { width: 400, height: 400 } })).not.toBeNull();
    expect(smartPlacement({ ...options, pagePixels: { width: 800, height: 800 } })).toBeNull();
  });

  it("prefers an established row over a closer single neighbour", () => {
    const slots = [
      { ...anchor, x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
      { ...anchor, id: "b", x: 0.22, y: 0.2, width: 0.1, height: 0.1 },
      { ...anchor, id: "c", x: 0.23, y: 0.25, width: 0.1, height: 0.1 },
    ];
    const result = smartPlacement({
      slots, photoAspect: 1, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 }, pointer: { x: 0.395, y: 0.3 },
    });
    expect(result?.rect.x).toBeCloseTo(0.34);
    expect(result?.rect.y).toBeCloseTo(0.2);
  });

  it("recognises small alignment and size differences in screen pixels", () => {
    const slots = [
      { ...anchor, x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
      { ...anchor, id: "b", x: 0.22, y: 0.204, width: 0.1, height: 0.104 },
    ];
    const options = {
      slots, photoAspect: 1, pageMm: { width: 200, height: 200 }, bleedMm: { x: 0, y: 0 },
      pointer: { x: 0.392, y: 0.256 },
    };
    expect(smartPlacement({ ...options, pagePixels: { width: 400, height: 400 } })?.rect.x).toBeCloseTo(0.34, 6);
    expect(smartPlacement({ ...options, pagePixels: { width: 800, height: 800 } })?.rect.x).toBeCloseTo(0.335, 6);
  });

  it("extends a three-Slot row with gaps differing by less than two screen pixels", () => {
    const slots = [
      { ...anchor, x: 0.1, y: 0.2, width: 0.1, height: 0.1 },
      { ...anchor, id: "b", x: 0.22, y: 0.2, width: 0.1, height: 0.1 },
      { ...anchor, id: "c", x: 0.344, y: 0.2, width: 0.1, height: 0.1 },
    ];
    const result = smartPlacement({
      slots, photoAspect: 1, pageMm: { width: 200, height: 200 }, bleedMm: { x: 0, y: 0 },
      pagePixels: { width: 400, height: 400 }, pointer: { x: 0.518, y: 0.25 },
    });
    expect(result?.rect.x).toBeCloseTo(0.468, 6);
  });

  it("chooses the closer valid direction for a diagonal approach", () => {
    const options = {
      slots: [{ ...anchor, width: 0.02, height: 0.02 }], photoAspect: 1,
      pageMm: { width: 200, height: 200 }, pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
    };
    expect(smartPlacement({ ...options, pointer: { x: 0.24, y: 0.32 } })?.rect.x).toBeCloseTo(0.235);
    expect(smartPlacement({ ...options, pointer: { x: 0.22, y: 0.34 } })?.rect.y).toBeCloseTo(0.335);
  });

  it("preserves each outer pair's spacing when separate pairs share an alignment", () => {
    const slots = [
      { ...anchor, x: 0.15, width: 0.1, height: 0.1 },
      { ...anchor, id: "b", x: 0.27, width: 0.1, height: 0.1 },
      { ...anchor, id: "c", x: 0.6, width: 0.1, height: 0.1 },
      { ...anchor, id: "d", x: 0.73, width: 0.1, height: 0.1 },
    ];
    const options = {
      slots, photoAspect: 1, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
    };
    expect(smartPlacement({ ...options, pointer: { x: 0.08, y: 0.35 } })?.rect.x).toBeCloseTo(0.03, 6);
    expect(smartPlacement({ ...options, pointer: { x: 0.91, y: 0.35 } })?.rect.x).toBeCloseTo(0.86, 6);
  });

  it("does not offer a 3 mm single-neighbour match within or instead of a widely spaced row", () => {
    const slots = [
      { ...anchor, x: 0.1, width: 0.1, height: 0.1 },
      { ...anchor, id: "b", x: 0.4, width: 0.1, height: 0.1 },
    ];
    const options = {
      slots, photoAspect: 1, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 },
    };
    expect(smartPlacement({ ...options, pointer: { x: 0.265, y: 0.35 } })).toBeNull();
    expect(smartPlacement({ ...options, pointer: { x: 0.565, y: 0.35 } })).toBeNull();
    expect(smartPlacement({ ...options, pointer: { x: 0.75, y: 0.35 } })?.rect.x).toBeCloseTo(0.7);
  });

  it("uses a valid alternative when another direction is blocked", () => {
    const small = { ...anchor, width: 0.02, height: 0.02 };
    const blocker: TextSlot = {
      id: "blocker", type: "text", x: 0.235, y: 0.3, width: 0.02, height: 0.02,
      text: "", placeholder: "Text",
      style: { fontFamily: "Arial", fontSize: 12, color: "#000000", bold: false, italic: false, underline: false, align: "left" },
    };
    const result = smartPlacement({
      slots: [small, blocker], photoAspect: 1, pageMm: { width: 200, height: 200 },
      pagePixels: { width: 400, height: 400 }, bleedMm: { x: 0, y: 0 }, pointer: { x: 0.23, y: 0.33 },
    });
    expect(result?.rect.x).toBeCloseTo(0.2);
    expect(result?.rect.y).toBeCloseTo(0.335);
  });
});
