import { expect, it } from "vitest";
import { addPage, albumSpreads, createAlbum, deletePage, deserializeAlbum, duplicatePage, movePage, pageDimensions, serializeAlbum } from "./album";
import { addPhotoSlot, placePhoto } from "./slots";

it("creates a two-Page Album with front and back Inside Covers", () => {
  const album = createAlbum({ name: "Test" });
  expect(album.pages).toHaveLength(2);
  expect(albumSpreads(album)).toEqual([
    { left: null, right: album.pages[0] },
    { left: album.pages[1], right: null },
  ]);
  expect(JSON.parse(serializeAlbum(album))).not.toHaveProperty("startingSide");
});

it("rejects odd or insufficient Page counts when creating or opening Albums", () => {
  for (const pageCount of [0, 1, 3]) {
    expect(() => createAlbum({ name: "Test", pageCount })).toThrow(/even.*2/i);
  }
  const album = createAlbum({ name: "Test", pageCount: 4 });
  expect(() => deserializeAlbum(JSON.stringify({ ...album, pages: album.pages.slice(0, 3) })))
    .toThrow(/even.*2/i);
  expect(() => deserializeAlbum(JSON.stringify({ ...album, startingSide: "right", pages: album.pages.slice(0, 3) })))
    .toThrow(/even.*2/i);
});

it("adds an empty Spread after a selected Spread and before the back Inside Cover", () => {
  const album = createAlbum({ name: "Test", pageCount: 4 });
  const afterMiddle = addPage(album, "page-2");
  expect(afterMiddle.pages.map((page) => page.id))
    .toEqual(["page-1", "page-2", "page-3", "page-5", "page-6", "page-4"]);
  expect(afterMiddle.pages.slice(3, 5).every((page) => page.slots.length === 0)).toBe(true);
  expect(addPage(album, "page-4").pages.map((page) => page.id))
    .toEqual(["page-1", "page-2", "page-3", "page-5", "page-6", "page-4"]);
  expect(deserializeAlbum(serializeAlbum(afterMiddle))).toEqual(afterMiddle);
  expect(album.pages).toHaveLength(4);
  expect(() => addPage(album, "missing")).toThrow(/page/i);
  expect(() => addPage(createAlbum({ name: "Full", pageCount: 10000 }), "page-1")).toThrow(/page count/i);
});

it("duplicates a Page onto the same side of a new Spread with an empty sibling", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 4 }), "page-1");
  const rightCopy = duplicatePage(album, "page-1");
  expect(rightCopy.pages.map((page) => page.id))
    .toEqual(["page-1", "page-5", "page-6", "page-2", "page-3", "page-4"]);
  expect(rightCopy.pages[1].slots).toEqual([]);
  expect(rightCopy.pages[2].slots).toEqual(album.pages[0].slots);
  expect(rightCopy.pages[2].slots).not.toBe(album.pages[0].slots);
  const leftCopy = duplicatePage(album, "page-4");
  expect(leftCopy.pages[3].id).toBe("page-5");
  expect(leftCopy.pages[4].slots).toEqual([]);
  expect(() => duplicatePage(album, "missing")).toThrow(/page/i);
  expect(() => duplicatePage(createAlbum({ name: "Full", pageCount: 10000 }), "page-1")).toThrow(/page count/i);
});

it("deletes both sibling Pages in a middle Spread but only clears end Pages", () => {
  let album = createAlbum({ name: "Test", pageCount: 6 });
  album = addPhotoSlot(addPhotoSlot(album, "page-1"), "page-6");
  expect(deletePage(album, "page-3").pages.map((page) => page.id))
    .toEqual(["page-1", "page-4", "page-5", "page-6"]);
  const firstCleared = deletePage(album, "page-1");
  expect(firstCleared.pages).toHaveLength(6);
  expect(firstCleared.pages[0].slots).toEqual([]);
  expect(firstCleared.pages[5].slots).toHaveLength(1);
  const lastCleared = deletePage(album, "page-6");
  expect(lastCleared.pages[5].slots).toEqual([]);
  expect(lastCleared.pages[0].slots).toHaveLength(1);
  expect(() => deletePage(album, "missing")).toThrow(/page/i);
  const replaced = addPage(deletePage(album, "page-2"), "page-1");
  expect(new Set(replaced.pages.map((page) => page.id)).size).toBe(6);
});

it("round trips a free-text Album title independently of its filename", () => {
  const album = createAlbum({ name: "Family: summer / 2026" });
  const saved = JSON.parse(serializeAlbum(album));
  expect(saved.title).toBe("Family: summer / 2026");
  expect(saved).not.toHaveProperty("name");
  expect(deserializeAlbum(JSON.stringify(saved)).title).toBe("Family: summer / 2026");
});

it("moves a Page to its final position in either direction and re-pairs without changing identities", () => {
  const album = createAlbum({ name: "Test", pageCount: 4 });
  const moved = movePage(album, "page-1", 3);
  expect(moved.pages.map((page) => page.id)).toEqual(["page-2", "page-3", "page-4", "page-1"]);
  expect(albumSpreads(moved)).toEqual([
    { left: null, right: album.pages[1] }, { left: album.pages[2], right: album.pages[3] },
    { left: album.pages[0], right: null },
  ]);
  expect(movePage(moved, "page-1", 0)).toEqual(album);
  expect(movePage(album, "page-2", 1)).toEqual(album);
  expect(album.pages.map((page) => page.id)).toEqual(["page-1", "page-2", "page-3", "page-4"]);
  expect(() => movePage(album, "missing", 0)).toThrow(/page/i);
  for (const index of [-1, 4, 0.5, NaN]) {
    expect(() => movePage(album, "page-1", index)).toThrow(/position/i);
  }
});

it("pairs middle Pages in order between the Inside Covers", () => {
  const album = createAlbum({ name: "Test", pageCount: 4 });
  const [one, two, three, four] = album.pages;
  expect(albumSpreads(album)).toEqual([
    { left: null, right: one }, { left: two, right: three }, { left: four, right: null },
  ]);
});

it("creates empty white A4 landscape Pages and round trips JSON", () => {
  const album = createAlbum({ name: "Christmas" });
  expect(album.schemaVersion).toBe(2);
  expect(album.title).toBe("Christmas");
  expect(album.pageFormat).toEqual({
    size: "A4", orientation: "landscape", bleedMm: 3, safeZoneMm: 5, dpi: 300,
  });
  expect(pageDimensions(album.pageFormat)).toEqual({ widthMm: 297, heightMm: 210 });
  expect(album.pages).toHaveLength(2);
  expect(album.pages.every((page) => page.background === "#ffffff" && page.slots.length === 0)).toBe(true);
  expect(new Set(album.pages.map((page) => page.id)).size).toBe(2);
  expect(deserializeAlbum(serializeAlbum(album))).toEqual(album);
});

it("loads an Album saved before Placements had the Fit field", () => {
  const album = placePhoto(
    addPhotoSlot(createAlbum({ name: "Old Album", pageCount: 2 }), "page-1"),
    "page-1",
    "slot-1",
    { path: "tree.jpg", width: 3000, height: 2000, orientation: 1 },
  );
  const oldSave = JSON.parse(serializeAlbum(album)) as {
    schemaVersion: number;
    pages: { slots: { placement: { fit?: boolean } | null }[] }[];
  };
  delete oldSave.pages[0].slots[0].placement!.fit;

  const loaded = deserializeAlbum(JSON.stringify(oldSave));
  expect(loaded.schemaVersion).toBe(2);
  expect(loaded.pages[0].slots[0].placement!.fit).toBe(false);
  expect(JSON.parse(serializeAlbum(loaded)).pages[0].slots[0].placement.fit).toBe(false);
});

it("accepts a custom Page count and print settings", () => {
  const album = createAlbum({ name: " Summer ", pageCount: 4, bleedMm: 0, safeZoneMm: 8, dpi: 600 });
  expect(album.title).toBe(" Summer ");
  expect(album.pages).toHaveLength(4);
  expect(album.pageFormat).toMatchObject({ bleedMm: 0, safeZoneMm: 8, dpi: 600 });
});

it("rejects invalid print settings and malformed or unsupported Albums instead of losing data", () => {
  for (const pageCount of [0, -1, 1.5, Infinity, 10001]) {
    expect(() => createAlbum({ name: "Test", pageCount })).toThrow(/page count/i);
  }
  for (const settings of [{ bleedMm: -1 }, { safeZoneMm: 105 }, { dpi: 0 }, { dpi: NaN }]) {
    expect(() => createAlbum({ name: "Test", ...settings })).toThrow();
  }
  const valid = createAlbum({ name: "Test" });
  const invalid = [
    { ...valid, schemaVersion: 1 },
    { ...valid, pageFormat: { ...valid.pageFormat, size: "A3" } },
    { ...valid, pageFormat: { ...valid.pageFormat, orientation: "portrait" } },
    { ...valid, startingSide: "middle" },
    { ...valid, pages: [] },
    { ...valid, pages: [valid.pages[0], valid.pages[0]] },
    { ...valid, pages: [{ ...valid.pages[0], slots: [{ type: "future-slot" }] }, valid.pages[1]] },
    { ...valid, futureField: true },
    null, [], {}, "text",
  ];
  for (const value of invalid) {
    expect(() => deserializeAlbum(JSON.stringify(value))).toThrow();
  }
  expect(() => deserializeAlbum("{")).toThrow();
  expect(() => serializeAlbum({ ...valid, startingSide: "middle" } as never)).toThrow();
});
