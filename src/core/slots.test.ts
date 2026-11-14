import { expect, it } from "vitest";
import { createAlbum, deserializeAlbum, serializeAlbum } from "./album";
import {
  addPhotoSlot, deleteSlot, fitPhotoRect, moveSlot, panCrop, placePhoto, placePhotoOnPage,
  placementDisplayCrop, resizeSlot, setPlacementCrop, setPlacementFit, zoomCrop,
} from "./slots";

function slotOf(album: ReturnType<typeof createAlbum>, page = 0) {
  return album.pages[page].slots[0];
}

it("deletes a Slot and its Placement, leaving the other Slots", () => {
  const album = addPhotoSlot(addPhotoSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1"), "page-1");
  const deleted = deleteSlot(album, "page-1", "slot-1");
  expect(deleted.pages[0].slots.map((slot) => slot.id)).toEqual(["slot-2"]);
  expect(album.pages[0].slots).toHaveLength(2);
  expect(() => deleteSlot(deleted, "page-1", "slot-1")).toThrow(/slot/i);
  expect(addPhotoSlot(deleted, "page-1").pages[0].slots.map((slot) => slot.id)).toEqual(["slot-2", "slot-1"]);
});

it("resizes a Slot from its bottom-right corner, keeping a minimum size and stopping at the Bleed edge", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1, bleedMm: 21 }), "page-1");
  expect(slotOf(resizeSlot(album, "page-1", "slot-1", 0.5, 0.25))).toMatchObject({ x: 0.3, y: 0.3, width: 0.5, height: 0.25 });
  const huge = slotOf(resizeSlot(album, "page-1", "slot-1", 10, 10));
  expect(huge.width).toBeCloseTo(0.7707, 4);
  expect(huge.height).toBeCloseTo(0.8, 6);
  expect(slotOf(resizeSlot(album, "page-1", "slot-1", 0, -1))).toMatchObject({ width: 0.02, height: 0.02 });
  expect(() => resizeSlot(album, "page-1", "slot-1", 0.5, Infinity)).toThrow(/size/i);
});

it("places a Photo with a centred Crop that fills the Slot, for landscape, portrait and rotated Photos", () => {
  // A 0.4 x 0.4 Slot on A4 landscape is 118.8 x 84 mm (aspect 1.4143).
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  const landscape = { path: "2024/Christmas/tree.jpg", width: 6000, height: 4000, orientation: 1 };
  const placed = slotOf(placePhoto(album, "page-1", "slot-1", landscape)).placement!;
  expect(placed.photoPath).toBe("2024/Christmas/tree.jpg");
  expect(placed.crop.x).toBeCloseTo(0.028571, 5);
  expect(placed.crop.y).toBe(0);
  expect(placed.crop.width).toBeCloseTo(0.942857, 5);
  expect(placed.crop.height).toBe(1);

  const portrait = slotOf(placePhoto(album, "page-1", "slot-1", { ...landscape, width: 4000, height: 6000 })).placement!.crop;
  expect(portrait.x).toBe(0);
  expect(portrait.y).toBeCloseTo(0.264310, 5);
  expect(portrait.width).toBe(1);
  expect(portrait.height).toBeCloseTo(0.471380, 5);
  // EXIF orientation 6 stores a portrait Photo as landscape pixels.
  expect(slotOf(placePhoto(album, "page-1", "slot-1", { ...landscape, orientation: 6 })).placement!.crop).toEqual(portrait);

  // A 0.2 x 0.6 Slot is 59.4 x 126 mm (aspect 0.4714).
  const tall = resizeSlot(album, "page-1", "slot-1", 0.2, 0.6);
  const tallCrop = slotOf(placePhoto(tall, "page-1", "slot-1", landscape)).placement!.crop;
  expect(tallCrop.x).toBeCloseTo(0.342857, 5);
  expect(tallCrop.width).toBeCloseTo(0.314286, 5);
  expect(tallCrop.height).toBe(1);
});

it("keeps Crop panning and zooming within the Photo, and fits all four Photo and Slot aspect combinations", () => {
  const crop = { x: 0.2, y: 0, width: 0.6, height: 1 };
  expect(panCrop(crop, 0.5, -0.5)).toEqual({ ...crop, x: 0.4, y: 0 });
  expect(zoomCrop(crop, 0.5)).toEqual(crop);
  const zoomed = zoomCrop(crop, 2);
  expect(zoomed.width).toBeCloseTo(0.3, 9);
  expect(zoomed.height).toBeCloseTo(0.5, 9);
  expect(zoomed.x + zoomed.width / 2).toBeCloseTo(0.5, 9);
  expect(zoomed.y + zoomed.height / 2).toBeCloseTo(0.5, 9);
  expect(() => zoomCrop(crop, 0)).toThrow(/zoom/i);

  const slotAspects = [297 * 0.4 / (210 * 0.4), 297 * 0.2 / (210 * 0.6)];
  const photoAspects = [1.5, 2 / 3];
  for (const photoAspect of photoAspects) {
    for (const targetAspect of slotAspects) {
      const rect = fitPhotoRect(photoAspect, targetAspect);
      expect(rect.x).toBeCloseTo((1 - rect.width) / 2, 9);
      expect(rect.y).toBeCloseTo((1 - rect.height) / 2, 9);
      expect(rect.width / rect.height).toBeCloseTo(photoAspect / targetAspect, 9);
      expect(rect.width).toBeLessThanOrEqual(1);
      expect(rect.height).toBeLessThanOrEqual(1);
      expect(placementDisplayCrop({ photoPath: "a.jpg", crop, fit: true })).toEqual({
        x: 0, y: 0, width: 1, height: 1,
      });
    }
  }
});

it("replaces the Photo in an occupied Slot and round trips Placements through JSON", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  const photo = { path: "a.jpg", width: 3000, height: 2000, orientation: 1 };
  const replaced = placePhoto(placePhoto(album, "page-1", "slot-1", photo), "page-1", "slot-1", { ...photo, path: "b/c.png" });
  expect(replaced.pages[0].slots).toHaveLength(1);
  expect(slotOf(replaced).placement!.photoPath).toBe("b/c.png");
  expect(slotOf(album).placement).toBeNull();
  expect(deserializeAlbum(serializeAlbum(replaced))).toEqual(replaced);
  for (const path of ["", "/abs.jpg", "C:/abs.jpg", "a\\b.jpg", "../out.jpg", "a/../../b.jpg"]) {
    expect(() => placePhoto(album, "page-1", "slot-1", { ...photo, path })).toThrow(/path/i);
  }
  expect(() => placePhoto(album, "page-1", "slot-1", { ...photo, width: 0 })).toThrow(/size/i);
  const json = JSON.parse(serializeAlbum(replaced));
  for (const crop of [{ x: -0.1, y: 0, width: 1, height: 1 }, { x: 0.5, y: 0, width: 0.6, height: 1 }, { x: 0, y: 0, width: 0, height: 1 }]) {
    json.pages[0].slots[0].placement.crop = crop;
    expect(() => deserializeAlbum(JSON.stringify(json))).toThrow(/placement/i);
  }
  json.pages[0].slots[0].placement = { photoPath: "../x.jpg", crop: { x: 0, y: 0, width: 1, height: 1 } };
  expect(() => deserializeAlbum(JSON.stringify(json))).toThrow(/placement/i);
});

it("keeps a placed Photo filling its Slot, around the same centre, when the Slot is resized", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  const placed = placePhoto(album, "page-1", "slot-1", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  const moved = moveSlot(placed, "page-1", "slot-1", 0.1, 0.1);
  expect(slotOf(moved).placement).toEqual(slotOf(placed).placement);
  const crop = slotOf(resizeSlot(placed, "page-1", "slot-1", 0.2, 0.6)).placement!.crop;
  expect(crop.x).toBeCloseTo(0.342857, 5);
  expect(crop.width).toBeCloseTo(0.314286, 5);
  expect(crop.y).toBeCloseTo(0, 9);
  expect(crop.height).toBeCloseTo(1, 9);
});

it("preserves Crop zoom and centre when a Photo Slot is resized in Fit", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  const placed = placePhoto(album, "page-1", "slot-1", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  const zoomed = panCrop(zoomCrop(slotOf(placed).placement!.crop, 2), 0.15, 0.2);
  const fit = setPlacementFit(setPlacementCrop(placed, "page-1", "slot-1", zoomed), "page-1", "slot-1", true);
  const proportional = resizeSlot(fit, "page-1", "slot-1", 0.2, 0.2);
  const restored = slotOf(setPlacementFit(proportional, "page-1", "slot-1", false)).placement!.crop;
  expect(restored.x).toBeCloseTo(zoomed.x, 9);
  expect(restored.y).toBeCloseTo(zoomed.y, 9);
  expect(restored.width).toBeCloseTo(zoomed.width, 9);
  expect(restored.height).toBeCloseTo(zoomed.height, 9);

  const tall = slotOf(resizeSlot(fit, "page-1", "slot-1", 0.2, 0.6)).placement!.crop;
  expect(tall.width).toBeCloseTo(0.157143, 5);
  expect(tall.height).toBeCloseTo(0.5, 9);
  expect(tall.x + tall.width / 2).toBeCloseTo(0.65, 9);
  expect(tall.y + tall.height / 2).toBeCloseTo(0.7, 9);
});

it("moves a Slot freely within the Page and into the Bleed, but never past the Bleed edge", () => {
  // 21 mm Bleed on 297 x 210 mm is 0.0707 of the width and 0.1 of the height.
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1, bleedMm: 21 }), "page-1");
  expect(slotOf(moveSlot(album, "page-1", "slot-1", 0.1, 0.55))).toMatchObject({ x: 0.1, y: 0.55, width: 0.4, height: 0.4 });
  const pastTopLeft = slotOf(moveSlot(album, "page-1", "slot-1", -1, -1));
  expect(pastTopLeft.x).toBeCloseTo(-0.0707, 4);
  expect(pastTopLeft.y).toBeCloseTo(-0.1, 6);
  const pastBottomRight = slotOf(moveSlot(album, "page-1", "slot-1", 5, 5));
  expect(pastBottomRight.x).toBeCloseTo(0.6707, 4);
  expect(pastBottomRight.y).toBeCloseTo(0.7, 6);
  expect(pastBottomRight.width).toBe(0.4);
  expect(slotOf(album).x).toBe(0.3);
  expect(() => moveSlot(album, "page-1", "missing", 0, 0)).toThrow(/slot/i);
  expect(() => moveSlot(album, "page-1", "slot-1", NaN, 0)).toThrow(/position/i);
});

it("adds an empty Photo Slot to a Page, stored as fractions of the Page, without changing other Pages", () => {
  const album = createAlbum({ name: "Test", pageCount: 2 });
  const added = addPhotoSlot(addPhotoSlot(album, "page-2"), "page-2");
  expect(added.pages[1].slots).toEqual([
    { id: "slot-1", type: "photo", x: 0.3, y: 0.3, width: 0.4, height: 0.4, placement: null },
    { id: "slot-2", type: "photo", x: 0.3, y: 0.3, width: 0.4, height: 0.4, placement: null },
  ]);
  expect(added.pages[0].slots).toEqual([]);
  expect(album.pages[1].slots).toEqual([]);
  expect(deserializeAlbum(serializeAlbum(added))).toEqual(added);
  expect(() => addPhotoSlot(album, "missing")).toThrow(/page/i);
});

it("creates a Photo Slot under a dropped Photo, clips it to the Bleed, and refits the centred Crop", () => {
  const album = createAlbum({ name: "Test", pageCount: 1, bleedMm: 21 });
  const photo = { path: "tree.jpg", width: 6000, height: 4000, orientation: 1 };
  const centred = placePhotoOnPage(album, "page-1", photo, 0.5, 0.5).pages[0].slots[0];
  expect(centred.x).toBeCloseTo(0.3, 9);
  expect(centred.y).toBeCloseTo(0.31142857142857144, 9);
  expect(centred.width).toBeCloseTo(0.4, 9);
  expect(centred.height).toBeCloseTo(0.37714285714285717, 9);
  expect(centred.placement!.crop.x).toBeCloseTo(0, 9);
  expect(centred.placement!.crop.y).toBeCloseTo(0, 9);
  expect(centred.placement!.crop.width).toBeCloseTo(1, 9);
  expect(centred.placement!.crop.height).toBeCloseTo(1, 9);

  const clipped = placePhotoOnPage(album, "page-1", photo, 0, 0).pages[0].slots[0];
  expect(clipped.x).toBeCloseTo(-21 / 297, 9);
  expect(clipped.y).toBeCloseTo(-0.1, 9);
  expect(clipped.width).toBeCloseTo(0.2 + 21 / 297, 9);
  expect(clipped.height).toBeCloseTo(0.18857142857142858 + 0.1, 9);
  expect(clipped.placement!.crop.x).toBeGreaterThan(0);
  expect(clipped.placement!.crop.width).toBeLessThan(1);
  expect(album.pages[0].slots).toEqual([]);
});
