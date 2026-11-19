import { expect, it } from "vitest";
import { createAlbum } from "./album";
import { effectiveResolution, lowResolutionPlacements } from "./effectiveResolution";
import type { Crop, PhotoSlot } from "./slots";

const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };

/** A Photo Slot printed `widthIn` x `heightIn` inches on an A4 landscape Page (297 x 210 mm). */
function slot(id: string, widthIn: number, heightIn: number, photoPath: string | null, extra: Partial<PhotoSlot> = {}): PhotoSlot {
  return {
    id, type: "photo", x: 0, y: 0, width: widthIn * 25.4 / 297, height: heightIn * 25.4 / 210,
    placement: photoPath ? { photoPath, crop: FULL, fit: false } : null, ...extra,
  };
}

it("flags Placements whose Effective Resolution is below the Page Format's threshold, by Page", () => {
  const album = createAlbum({ name: "Christmas", pageCount: 2 });
  album.pages[0].slots = [
    slot("sharp", 2, 2, "sharp.jpg"),
    slot("soft", 2, 2, "soft.jpg"),
    slot("empty", 2, 2, null),
  ];
  album.pages[1].slots = [slot("at-threshold", 2, 2, "edge.jpg"), slot("not-scanned", 2, 2, "unknown.jpg")];
  const photos = new Map([
    ["sharp.jpg", { width: 400, height: 400, orientation: 1 }],
    ["soft.jpg", { width: 200, height: 200, orientation: 1 }],
    ["edge.jpg", { width: 300, height: 300, orientation: 1 }],
  ]);

  expect(album.pageFormat.minEffectiveDpi).toBe(150);
  const flagged = lowResolutionPlacements(album, photos);
  expect(flagged).toEqual([{ page: 1, pageId: album.pages[0].id, slotId: "soft", effectiveResolution: expect.closeTo(100, 6) }]);

  const lenient = { ...album, pageFormat: { ...album.pageFormat, minEffectiveDpi: 90 } };
  expect(lowResolutionPlacements(lenient, photos)).toEqual([]);
});

it("counts only the Photo pixels a Crop shows, and with Fit the whole Photo over the part of the Slot it covers", () => {
  const album = createAlbum({ name: "Christmas" });
  const format = album.pageFormat;
  // 400 x 200 pixels in a 2 x 2 inch Slot.
  const photo = { width: 400, height: 200, orientation: 1 };
  const cover = slot("cover", 2, 2, "wide.jpg");
  cover.placement!.crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  const zoomed = slot("zoomed", 2, 2, "wide.jpg");
  zoomed.placement!.crop = { x: 0.25, y: 0.25, width: 0.25, height: 0.5 };
  // Fit ignores the stored Crop and shows the whole Photo 2 inches wide.
  const fitted = slot("fitted", 2, 2, "wide.jpg");
  fitted.placement = { ...fitted.placement!, crop: zoomed.placement!.crop, fit: true };

  expect(effectiveResolution(format, cover, photo)).toBeCloseTo(100, 6);
  expect(effectiveResolution(format, zoomed, photo)).toBeCloseTo(50, 6);
  expect(effectiveResolution(format, fitted, photo)).toBeCloseTo(200, 6);
});

it("measures turned Slots and EXIF-rotated Photos in their upright orientation", () => {
  const format = createAlbum({ name: "Christmas" }).pageFormat;
  // 1 inch wide and 2 tall on the Page, turned 90°: its content is 2 inches wide and 1 tall.
  const turned = slot("turned", 1, 2, "rotated.jpg", { rotation: 90 });
  // Stored 200 x 400 with EXIF orientation 6, so upright it is 400 x 200 like the content.
  expect(effectiveResolution(format, turned, { width: 200, height: 400, orientation: 6 })).toBeCloseTo(200, 6);
});
