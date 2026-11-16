import { expect, it } from "vitest";
import { addPage, albumSpreads, createAlbum, deletePage, deserializeAlbum, duplicatePage, movePage, pageDimensions, serializeAlbum } from "./album";
import { addPhotoSlot, placePhoto } from "./slots";

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

it("deletes a Page, re-pairs Spreads, and never deletes the last Page", () => {
  const album = createAlbum({ name: "Test", pageCount: 4 });
  const deleted = deletePage(album, "page-1");
  expect(deleted.pages.map((page) => page.id)).toEqual(["page-2", "page-3", "page-4"]);
  expect(albumSpreads(deleted)).toEqual([
    { left: null, right: album.pages[1] }, { left: album.pages[2], right: album.pages[3] },
  ]);
  expect(album.pages).toHaveLength(4);
  expect(() => deletePage(album, "missing")).toThrow(/page/i);
  expect(() => deletePage(createAlbum({ name: "Single", pageCount: 1 }), "page-1")).toThrow(/page count/i);
  const replaced = addPage(deletePage(album, "page-2"), "page-1");
  expect(new Set(replaced.pages.map((page) => page.id)).size).toBe(4);
});

it("duplicates a Page immediately after its source with an independent identity and content", () => {
  const album = createAlbum({ name: "Test", pageCount: 2 });
  const duplicated = duplicatePage(album, "page-1");
  expect(duplicated.pages.map((page) => page.id)).toEqual(["page-1", "page-3", "page-2"]);
  expect(duplicated.pages[1]).toEqual({ ...album.pages[0], id: "page-3" });
  expect(duplicated.pages[1]).not.toBe(album.pages[0]);
  expect(duplicated.pages[1].slots).not.toBe(album.pages[0].slots);
  expect(album.pages).toHaveLength(2);
  expect(() => duplicatePage(album, "missing")).toThrow(/page/i);
  expect(() => duplicatePage(createAlbum({ name: "Full", pageCount: 10000 }), "page-1")).toThrow(/page count/i);
});

it("adds an empty Page after the selected Page without changing the original Album", () => {
  const album = createAlbum({ name: "Test", pageCount: 2 });
  const added = addPage(album, "page-1");
  expect(added.pages.map((page) => page.id)).toEqual(["page-1", "page-3", "page-2"]);
  expect(added.pages[1]).toEqual({ id: "page-3", background: "#ffffff", slots: [] });
  expect(album.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
  expect(deserializeAlbum(serializeAlbum(added))).toEqual(added);
  expect(() => addPage(album, "missing")).toThrow(/page/i);
  expect(() => addPage(createAlbum({ name: "Full", pageCount: 10000 }), "page-1")).toThrow(/page count/i);
});

it("keeps Page 1 alone on its chosen side and pairs the remaining Pages in order", () => {
  const album = createAlbum({ name: "Test", pageCount: 4 });
  const [one, two, three, four] = album.pages;
  expect(albumSpreads(album)).toEqual([
    { left: null, right: one }, { left: two, right: three }, { left: four, right: null },
  ]);
  expect(albumSpreads({ ...album, startingSide: "left" })).toEqual([
    { left: one, right: null }, { left: two, right: three }, { left: four, right: null },
  ]);
  expect(albumSpreads(createAlbum({ name: "Single", pageCount: 1 }))).toEqual([
    { left: null, right: { id: "page-1", background: "#ffffff", slots: [] } },
  ]);
});

it("creates 24 empty white A4 landscape Pages, starting on the right, and round trips JSON", () => {
  const album = createAlbum({ name: "Christmas" });
  expect(album.schemaVersion).toBe(2);
  expect(album.title).toBe("Christmas");
  expect(album.startingSide).toBe("right");
  expect(album.pageFormat).toEqual({
    size: "A4", orientation: "landscape", bleedMm: 3, safeZoneMm: 5, dpi: 300,
  });
  expect(pageDimensions(album.pageFormat)).toEqual({ widthMm: 297, heightMm: 210 });
  expect(album.pages).toHaveLength(24);
  expect(album.pages.every((page) => page.background === "#ffffff" && page.slots.length === 0)).toBe(true);
  expect(new Set(album.pages.map((page) => page.id)).size).toBe(24);
  expect(deserializeAlbum(serializeAlbum(album))).toEqual(album);
});

it("loads an Album saved before Placements had the Fit field", () => {
  const album = placePhoto(
    addPhotoSlot(createAlbum({ name: "Old Album", pageCount: 1 }), "page-1"),
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

it("accepts a custom Page count, starting side and print settings", () => {
  const album = createAlbum({ name: " Summer ", pageCount: 3, startingSide: "left", bleedMm: 0, safeZoneMm: 8, dpi: 600 });
  expect(album.title).toBe(" Summer ");
  expect(album.pages).toHaveLength(3);
  expect(album.startingSide).toBe("left");
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
    { ...valid, pages: [{ ...valid.pages[0], slots: [{ type: "future-slot" }] }] },
    { ...valid, futureField: true },
    null, [], {}, "text",
  ];
  for (const value of invalid) {
    expect(() => deserializeAlbum(JSON.stringify(value))).toThrow();
  }
  expect(() => deserializeAlbum("{")).toThrow();
  expect(() => serializeAlbum({ ...valid, startingSide: "middle" } as never)).toThrow();
});
