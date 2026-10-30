import { expect, it } from "vitest";
import { createAlbum, deserializeAlbum, pageDimensions, serializeAlbum } from "./album";

it("creates 24 empty white A4 landscape Pages, starting on the right, and round trips JSON", () => {
  const album = createAlbum({ name: "Christmas" });
  expect(album.schemaVersion).toBe(1);
  expect(album.name).toBe("Christmas");
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

it("accepts a custom Page count, starting side and print settings", () => {
  const album = createAlbum({ name: " Summer ", pageCount: 3, startingSide: "left", bleedMm: 0, safeZoneMm: 8, dpi: 600 });
  expect(album.name).toBe("Summer");
  expect(album.pages).toHaveLength(3);
  expect(album.startingSide).toBe("left");
  expect(album.pageFormat).toMatchObject({ bleedMm: 0, safeZoneMm: 8, dpi: 600 });
});

it("rejects unsafe names, invalid print settings and malformed or unsupported Albums instead of losing data", () => {
  for (const name of ["", " ", "../outside", "a\\b", "CON", "nul.txt", "a.", "a:b"]) {
    expect(() => createAlbum({ name })).toThrow(/name/i);
  }
  for (const pageCount of [0, -1, 1.5, Infinity, 10001]) {
    expect(() => createAlbum({ name: "Test", pageCount })).toThrow(/page count/i);
  }
  for (const settings of [{ bleedMm: -1 }, { safeZoneMm: 105 }, { dpi: 0 }, { dpi: NaN }]) {
    expect(() => createAlbum({ name: "Test", ...settings })).toThrow();
  }
  const valid = createAlbum({ name: "Test" });
  const invalid = [
    { ...valid, schemaVersion: 2 },
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
