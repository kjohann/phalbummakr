import { describe, expect, it } from "vitest";
import { afterMove, comparisonGrid, EMPTY_COMPARISON, selectedPhotos, showPhoto, stepPhoto, toggleComparison, toggleSelected } from "./comparison";

describe("Comparison", () => {
  it("shows a single Photo, which counts as selected", () => {
    const shown = showPhoto("a.jpg");
    expect(shown.shown).toEqual(["a.jpg"]);
    expect(selectedPhotos(shown)).toEqual(["a.jpg"]);
    expect(selectedPhotos(EMPTY_COMPARISON)).toEqual([]);
  });

  it("adds any number of Photos to the shown one, and removes them again", () => {
    let comparison = toggleComparison(showPhoto("a.jpg"), "b.jpg");
    expect(comparison.shown).toEqual(["a.jpg", "b.jpg"]);
    expect(selectedPhotos(comparison)).toEqual([]);
    for (const photo of ["c.jpg", "d.jpg", "e.jpg", "f.jpg"]) comparison = toggleComparison(comparison, photo);
    expect(comparison.shown).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"]);
    comparison = toggleSelected(toggleSelected(comparison, "b.jpg"), "c.jpg");
    comparison = toggleComparison(comparison, "b.jpg");
    expect(comparison.shown).toEqual(["a.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"]);
    expect(selectedPhotos(comparison)).toEqual(["c.jpg"]);
    expect(toggleComparison(EMPTY_COMPARISON, "a.jpg").shown).toEqual(["a.jpg"]);
  });

  it("selects and unselects compared Photos, but never a Photo shown on its own", () => {
    let comparison = toggleComparison(showPhoto("a.jpg"), "b.jpg");
    comparison = toggleSelected(comparison, "b.jpg");
    expect(selectedPhotos(comparison)).toEqual(["b.jpg"]);
    expect(selectedPhotos(toggleSelected(comparison, "b.jpg"))).toEqual([]);
    expect(toggleSelected(comparison, "z.jpg")).toBe(comparison);
    const single = showPhoto("a.jpg");
    expect(toggleSelected(single, "a.jpg")).toBe(single);
    // Down to one Photo, it counts as selected again.
    expect(selectedPhotos(toggleComparison(comparison, "b.jpg"))).toEqual(["a.jpg"]);
  });

  it("lays the shown Photos out in the smallest near-square grid that fits them", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10, 13].map((count) => comparisonGrid(count))).toEqual([
      { columns: 1, rows: 1 }, { columns: 2, rows: 1 }, { columns: 2, rows: 2 }, { columns: 2, rows: 2 },
      { columns: 3, rows: 2 }, { columns: 3, rows: 2 }, { columns: 3, rows: 3 }, { columns: 3, rows: 3 },
      { columns: 4, rows: 3 }, { columns: 4, rows: 4 },
    ]);
  });

  it("steps a Photo shown on its own through the grid, stopping at either end", () => {
    const grid = ["a.jpg", "b.jpg", "c.jpg"];
    expect(stepPhoto(showPhoto("b.jpg"), grid, 1).shown).toEqual(["c.jpg"]);
    expect(stepPhoto(showPhoto("b.jpg"), grid, -1).shown).toEqual(["a.jpg"]);
    for (const [comparison, step] of [
      [showPhoto("c.jpg"), 1], [showPhoto("a.jpg"), -1], [showPhoto("elsewhere/x.jpg"), 1],
      [toggleComparison(showPhoto("a.jpg"), "b.jpg"), 1], [EMPTY_COMPARISON, 1],
    ] as const) {
      expect(stepPhoto(comparison, grid, step)).toBe(comparison);
    }
  });

  it("drops moved Photos from the Comparison and keeps the rest", () => {
    let comparison = toggleComparison(toggleComparison(showPhoto("a.jpg"), "b.jpg"), "c.jpg");
    comparison = toggleSelected(toggleSelected(comparison, "a.jpg"), "c.jpg");
    const after = afterMove(comparison, ["a.jpg", "x.jpg"], ["a.jpg", "b.jpg", "c.jpg"]);
    expect(after.shown).toEqual(["b.jpg", "c.jpg"]);
    expect(selectedPhotos(after)).toEqual(["c.jpg"]);
    expect(afterMove(comparison, ["x.jpg"], [])).toBe(comparison);
  });

  it("shows the next Photo in the grid after moving a Photo shown on its own, or the previous one at the end", () => {
    const grid = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
    expect(afterMove(showPhoto("b.jpg"), ["b.jpg", "c.jpg"], grid).shown).toEqual(["d.jpg"]);
    expect(afterMove(showPhoto("d.jpg"), ["c.jpg", "d.jpg"], grid).shown).toEqual(["b.jpg"]);
    expect(afterMove(showPhoto("a.jpg"), ["a.jpg"], ["a.jpg"])).toEqual(EMPTY_COMPARISON);
    expect(afterMove(showPhoto("elsewhere/x.jpg"), ["elsewhere/x.jpg"], grid)).toEqual(EMPTY_COMPARISON);
    // Moving the other Photo of a pair leaves the remaining one shown, not the next in the grid.
    expect(afterMove(toggleComparison(showPhoto("a.jpg"), "b.jpg"), ["b.jpg"], grid).shown).toEqual(["a.jpg"]);
  });
});