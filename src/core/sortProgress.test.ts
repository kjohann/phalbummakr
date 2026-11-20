import { describe, expect, it } from "vitest";
import {
  EMPTY_SORT_PROGRESS, photosUpTo, progressAfterMove, progressAfterRename, progressAfterRescan, readSortProgress,
  rememberScroll, serializeSortProgress, setReviewed, showInProgress,
} from "./sortProgress";

describe("Reviewed Photos", () => {
  it("marks and unmarks Photos, keeping the same progress when nothing changes", () => {
    const marked = setReviewed(EMPTY_SORT_PROGRESS, ["a.jpg", "b.jpg"], true);
    expect([...marked.reviewed]).toEqual(["a.jpg", "b.jpg"]);
    expect(setReviewed(marked, ["a.jpg"], true)).toBe(marked);
    expect([...setReviewed(marked, ["a.jpg", "c.jpg"], false).reviewed]).toEqual(["b.jpg"]);
  });

  it("finds a grid tile and every Photo before it", () => {
    expect(photosUpTo(["a", "b", "c", "d"], "c")).toEqual(["a", "b", "c"]);
    expect(photosUpTo(["a", "b"], "gone")).toEqual([]);
  });

  it("marks shown Photos reviewed and remembers the last one shown in each Folder", () => {
    const progress = showInProgress(EMPTY_SORT_PROGRESS, ["kids/a.jpg", "b.jpg", "kids/c.jpg"]);
    expect([...progress.reviewed].sort()).toEqual(["b.jpg", "kids/a.jpg", "kids/c.jpg"]);
    expect(progress.positions.get("kids")?.shown).toBe("kids/c.jpg");
    expect(progress.positions.get("")?.shown).toBe("b.jpg");
    expect(showInProgress(progress, ["kids/c.jpg"])).toBe(progress);
  });

  it("remembers each Folder's scroll position next to its shown Photo", () => {
    const progress = rememberScroll(showInProgress(EMPTY_SORT_PROGRESS, ["kids/a.jpg"]), "kids", 480);
    expect(progress.positions.get("kids")).toEqual({ scrollTop: 480, shown: "kids/a.jpg" });
    expect(rememberScroll(progress, "kids", 480)).toBe(progress);
  });
});

describe("following the Library", () => {
  const progress = rememberScroll(showInProgress(EMPTY_SORT_PROGRESS, ["kids/a.jpg", "kids/old/b.jpg", "c.jpg"]), "kids/old", 90);

  it("keeps marks on Photos moved in the app and forgets them as a Folder's shown Photo", () => {
    const moved = progressAfterMove(progress, [{ from: "c.jpg", to: "kids/c (2).jpg" }]);
    expect(moved.reviewed.has("kids/c (2).jpg")).toBe(true);
    expect(moved.reviewed.has("c.jpg")).toBe(false);
    expect(moved.positions.get("")?.shown).toBeNull();
    expect(progressAfterMove(progress, [{ from: "unmarked.jpg", to: "kids/unmarked.jpg" }])).toBe(progress);
  });

  it("keeps marks and positions inside a renamed Folder", () => {
    const renamed = progressAfterRename(progress, { from: "kids", to: "children" });
    expect([...renamed.reviewed].sort()).toEqual(["c.jpg", "children/a.jpg", "children/old/b.jpg"]);
    expect(renamed.positions.get("children/old")).toEqual({ scrollTop: 90, shown: "children/old/b.jpg" });
    expect(renamed.positions.has("kids")).toBe(false);
    // "kids-extra" only shares a prefix with "kids".
    expect(progressAfterRename(showInProgress(EMPTY_SORT_PROGRESS, ["kids-extra/x.jpg"]), { from: "kids", to: "y" }).reviewed.has("kids-extra/x.jpg")).toBe(true);
  });

  it("forgets Photos and Folders gone from a rescan", () => {
    const rescanned = progressAfterRescan(progress, ["kids/a.jpg", "c.jpg"], ["kids"]);
    expect([...rescanned.reviewed].sort()).toEqual(["c.jpg", "kids/a.jpg"]);
    expect([...rescanned.positions.keys()].sort()).toEqual(["", "kids"]);
    expect(progressAfterRescan(rescanned, ["kids/a.jpg", "c.jpg", "new.jpg"], ["kids", "kids/new"])).toBe(rescanned);
  });
});

describe("saving", () => {
  it("round-trips through JSON", () => {
    const progress = rememberScroll(showInProgress(EMPTY_SORT_PROGRESS, ["kids/a.jpg", "b.jpg"]), "", 32);
    const read = readSortProgress(serializeSortProgress(progress));
    expect([...read.reviewed].sort()).toEqual(["b.jpg", "kids/a.jpg"]);
    expect(read.positions.get("")).toEqual({ scrollTop: 32, shown: "b.jpg" });
    expect(read.positions.get("kids")).toEqual({ scrollTop: 0, shown: "kids/a.jpg" });
  });

  it("starts empty without a file and skips what it can't read", () => {
    expect(readSortProgress(null)).toEqual(EMPTY_SORT_PROGRESS);
    expect(readSortProgress("not json")).toEqual(EMPTY_SORT_PROGRESS);
    const read = readSortProgress(JSON.stringify({
      reviewed: ["a.jpg", 4, null], folders: { kids: { scrollTop: "far", shown: 3 }, "": { scrollTop: 12, shown: "a.jpg" } },
    }));
    expect([...read.reviewed]).toEqual(["a.jpg"]);
    expect(read.positions.get("kids")).toEqual({ scrollTop: 0, shown: null });
    expect(read.positions.get("")).toEqual({ scrollTop: 12, shown: "a.jpg" });
  });
});
