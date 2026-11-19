import { describe, expect, it } from "vitest";
import { afterMove, canAddToComparison, chosenPhotos, EMPTY_COMPARISON, showPhoto, stepPhoto, toggleChosen, toggleComparison } from "./comparison";

describe("Comparison", () => {
  it("shows a single Photo, which counts as chosen", () => {
    const shown = showPhoto("a.jpg");
    expect(shown.shown).toEqual(["a.jpg"]);
    expect(chosenPhotos(shown)).toEqual(["a.jpg"]);
    expect(chosenPhotos(EMPTY_COMPARISON)).toEqual([]);
  });

  it("adds Photos to the shown one until four are compared, and removes them again", () => {
    let comparison = toggleComparison(showPhoto("a.jpg"), "b.jpg");
    expect(comparison.shown).toEqual(["a.jpg", "b.jpg"]);
    expect(chosenPhotos(comparison)).toEqual([]);
    comparison = toggleComparison(toggleComparison(comparison, "c.jpg"), "d.jpg");
    expect(canAddToComparison(comparison)).toBe(false);
    expect(toggleComparison(comparison, "e.jpg")).toBe(comparison);
    comparison = toggleChosen(toggleChosen(comparison, "b.jpg"), "c.jpg");
    comparison = toggleComparison(comparison, "b.jpg");
    expect(comparison.shown).toEqual(["a.jpg", "c.jpg", "d.jpg"]);
    expect(chosenPhotos(comparison)).toEqual(["c.jpg"]);
    expect(toggleComparison(EMPTY_COMPARISON, "a.jpg").shown).toEqual(["a.jpg"]);
  });

  it("chooses and unchooses compared Photos, but never a Photo shown on its own", () => {
    let comparison = toggleComparison(showPhoto("a.jpg"), "b.jpg");
    comparison = toggleChosen(comparison, "b.jpg");
    expect(chosenPhotos(comparison)).toEqual(["b.jpg"]);
    expect(chosenPhotos(toggleChosen(comparison, "b.jpg"))).toEqual([]);
    expect(toggleChosen(comparison, "z.jpg")).toBe(comparison);
    const single = showPhoto("a.jpg");
    expect(toggleChosen(single, "a.jpg")).toBe(single);
    // Down to one Photo, it counts as chosen again.
    expect(chosenPhotos(toggleComparison(comparison, "b.jpg"))).toEqual(["a.jpg"]);
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
    comparison = toggleChosen(toggleChosen(comparison, "a.jpg"), "c.jpg");
    const after = afterMove(comparison, ["a.jpg", "x.jpg"], ["a.jpg", "b.jpg", "c.jpg"]);
    expect(after.shown).toEqual(["b.jpg", "c.jpg"]);
    expect(chosenPhotos(after)).toEqual(["c.jpg"]);
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
