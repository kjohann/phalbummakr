import { describe, expect, it } from "vitest";
import { anchoredScroll, stepZoom, zoomBy, zoomLabel } from "./workAreaZoom";

describe("work-area zoom", () => {
  it("steps through the preset levels and stops at 25% and 400%", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(3, 1)).toBe(4);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });

  it("steps from a level between presets, such as after pinching, to the next preset that way", () => {
    expect(stepZoom(1.3, 1)).toBe(1.5);
    expect(stepZoom(1.3, -1)).toBe(1.25);
  });

  it("scales smoothly by a factor within 25% and 400%", () => {
    expect(zoomBy(1, 1.2)).toBeCloseTo(1.2);
    expect(zoomBy(3, 2)).toBe(4);
    expect(zoomBy(0.3, 0.5)).toBe(0.25);
  });

  it("shows the zoom as a whole percentage", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(1 / 3)).toBe("33%");
  });

  it("scrolls so the anchor point stays put, including when the grid was centred in a larger work area", () => {
    // 100 px into the work area, scrolled 200 px, the grid at its left edge: the point is 300 px into the grid.
    expect(anchoredScroll({ scroll: 200, anchor: 100, offset: 0, nextOffset: 0, scale: 2 })).toBe(500);
    // A grid centred 50 px in starts the point 50 px into the grid; twice as wide it fills the work area.
    expect(anchoredScroll({ scroll: 0, anchor: 100, offset: 50, nextOffset: 0, scale: 2 })).toBe(0);
    expect(anchoredScroll({ scroll: 0, anchor: 300, offset: 50, nextOffset: 0, scale: 2 })).toBe(200);
  });
});
