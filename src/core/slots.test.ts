import { expect, it } from "vitest";
import { createAlbum, deserializeAlbum, serializeAlbum } from "./album";
import {
  addPhotoSlot, addTextSlot, deleteSlot, duplicateSlot, pasteSlot, fitPhotoRect, moveSlot, panCrop, placePhoto, placePhotoOnPage,
  placementDisplayCrop, resizeSlot, rotateSlot, setPlacementCrop, setPlacementFit, swapPlacements, zoomCrop,
} from "./slots";

function slotOf(album: ReturnType<typeof createAlbum>, page = 0) {
  return album.pages[page].slots[0];
}

it("pastes an independent Slot on another Page using the movement Bleed limits", () => {
  let album = addPhotoSlot(createAlbum({ name: "Trip", bleedMm: 3 }), "page-1");
  album = placePhoto(album, "page-1", "slot-1", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  const snapshot = structuredClone(slotOf(album));
  album = deleteSlot(album, "page-1", "slot-1");
  const pasted = pasteSlot(album, "page-2", snapshot, { x: 2, y: 2 });
  const copy = slotOf(pasted, 1);
  expect(copy).toMatchObject({ type: "photo", placement: snapshot.placement });
  expect(copy.x).toBeCloseTo(1 + 3 / 297 - copy.width);
  expect(copy.y).toBeCloseTo(1 + 3 / 210 - copy.height);
  copy.placement!.crop.x = 0.123;
  expect(snapshot.placement!.crop.x).not.toBe(0.123);
});

it("preserves Text Slot content, placeholder, formatting and out-of-Bleed position on a first cross-Page paste", () => {
  const album = addTextSlot(createAlbum({ name: "Trip" }), "page-1");
  const original = album.pages[0].slots[0];
  if (original.type !== "text") throw new Error("Expected Text Slot.");
  const snapshot = { ...original, x: -0.1, rotation: 90 as const, text: "Trip", placeholder: "Caption",
    style: { ...original.style, bold: true, color: "#123456" } };
  const copy = slotOf(pasteSlot(album, "page-2", snapshot), 1);
  expect(copy).toEqual({ ...snapshot, id: "slot-1" });
  if (copy.type !== "text") throw new Error("Expected Text Slot.");
  copy.style.color = "#ffffff";
  expect(snapshot.style.color).toBe("#123456");
});

it("adds a Slot centred on a point, keeping it inside the Bleed", () => {
  const album = createAlbum({ name: "Trip", bleedMm: 3 });
  const photo = slotOf(addPhotoSlot(album, "page-1", { x: 0.5, y: 0.25 }));
  expect(photo).toMatchObject({ x: 0.3, width: 0.4, height: 0.4 });
  expect(photo.y).toBeCloseTo(0.05);
  const corner = slotOf(addPhotoSlot(album, "page-1", { x: 1, y: 1 }));
  expect(corner.x).toBeCloseTo(1 + 3 / 297 - 0.4);
  expect(corner.y).toBeCloseTo(1 + 3 / 210 - 0.4);
  const text = slotOf(addTextSlot(album, "page-1", { x: 0.2, y: 0.6 }));
  expect(text.x).toBeCloseTo(0);
  expect(text.y).toBeCloseTo(0.6 - text.height / 2);
});

it("duplicates empty, cropped, fitted and formatted text Slots as independent content above the originals", () => {
  let album = addTextSlot(addPhotoSlot(addPhotoSlot(addPhotoSlot(createAlbum({ name: "Trip" }),
    "page-1"), "page-1"), "page-1"), "page-1");
  album = placePhoto(album, "page-1", "slot-2", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  album = setPlacementCrop(album, "page-1", "slot-2", { x: 0.2, y: 0.1, width: 0.5, height: 0.6 });
  album = placePhoto(album, "page-1", "slot-3", { path: "b.jpg", width: 6000, height: 4000, orientation: 1 });
  album = setPlacementFit(album, "page-1", "slot-3", true);
  album.pages[0].slots[3] = {
    id: "slot-4", type: "text", x: 0.2, y: 0.2, width: 0.3, height: 0.1, rotation: 180,
    text: "Our trip", placeholder: "Caption",
    style: { fontFamily: "Arial", fontSize: 24, color: "#123456", bold: true, italic: true, underline: true, align: "right" },
  };
  const originals = structuredClone(album.pages[0].slots);
  for (let index = 0; index < 4; index += 1) album = duplicateSlot(album, "page-1", `slot-${index + 1}`);
  expect(album.pages[0].slots.slice(0, 4)).toEqual(originals);
  expect(album.pages[0].slots.slice(4)).toEqual(originals.map((slot, index) => ({ ...slot, id: `slot-${index + 5}` })));
  const textCopy = album.pages[0].slots[7];
  if (textCopy.type !== "text") throw new Error("Expected Text Slot.");
  textCopy.style.color = "#ffffff";
  album.pages[0].slots[5].placement!.crop.x = 0.4;
  expect(album.pages[0].slots.slice(0, 4)).toEqual(originals);
});

it("swaps Placements across Pages, keeping Slot geometry and refitting Crops without distortion", () => {
  let album = createAlbum({ name: "Test", pageCount: 2 });
  album = addPhotoSlot(addPhotoSlot(album, "page-1"), "page-2");
  album = resizeSlot(album, "page-2", "slot-1", 0.2, 0.6);
  album = placePhoto(album, "page-1", "slot-1", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  album = placePhoto(album, "page-2", "slot-1", { path: "b.jpg", width: 4000, height: 6000, orientation: 1 });
  album = setPlacementCrop(album, "page-1", "slot-1", zoomCrop(slotOf(album).placement!.crop, 2));
  album = setPlacementFit(album, "page-2", "slot-1", true);
  album = rotateSlot(album, "page-2", "slot-1", 90);
  const first = slotOf(album);
  const second = slotOf(album, 1);
  const swapped = swapPlacements(album, { pageId: "page-1", slotId: "slot-1" }, { pageId: "page-2", slotId: "slot-1" });
  expect(slotOf(swapped)).toEqual({ ...first, placement: expect.objectContaining({ photoPath: "b.jpg", fit: true }) });
  expect(slotOf(swapped, 1)).toEqual({ ...second, placement: expect.objectContaining({ photoPath: "a.jpg", fit: false }) });
  const fittedCrop = slotOf(swapped).placement!.crop;
  expect(fittedCrop.width).toBeCloseTo(1);
  expect(fittedCrop.height).toBeCloseTo(0.471380471);
  expect(fittedCrop.x + fittedCrop.width / 2).toBeCloseTo(0.5);
  expect(fittedCrop.y + fittedCrop.height / 2).toBeCloseTo(0.5);
  const crop = slotOf(swapped, 1).placement!.crop;
  expect(crop.width).toBeCloseTo(0.157142857);
  expect(crop.height).toBeCloseTo(0.5);
  expect(crop.x + crop.width / 2).toBeCloseTo(0.5);
  expect(crop.y + crop.height / 2).toBeCloseTo(0.5);
  expect(deserializeAlbum(serializeAlbum(swapped))).toEqual(swapped);
  expect(slotOf(album)).toEqual(first);
  expect(slotOf(album, 1)).toEqual(second);
});

it("rotates a placed Slot around its physical centre without clamping or changing its Crop", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
  const placed = placePhoto(album, "page-1", "slot-1", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  const atEdge = moveSlot(placed, "page-1", "slot-1", 0, 0);
  const rotated = rotateSlot(atEdge, "page-1", "slot-1", 90);
  const before = slotOf(atEdge);
  const after = slotOf(rotated);
  expect(after.rotation).toBe(90);
  expect(after.width * 297).toBeCloseTo(before.height * 210);
  expect(after.height * 210).toBeCloseTo(before.width * 297);
  expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2);
  expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2);
  expect(after.y).toBeLessThan(-3 / 210);
  expect(after.placement).toEqual(before.placement);
  expect(deserializeAlbum(serializeAlbum(rotated))).toEqual(rotated);
  const restored = slotOf(rotateSlot(rotated, "page-1", "slot-1", -90));
  expect(restored.rotation).toBe(0);
  expect(restored.x).toBeCloseTo(before.x);
  expect(restored.y).toBeCloseTo(before.y);
  expect(restored.width).toBeCloseTo(before.width);
  expect(restored.height).toBeCloseTo(before.height);
});

it("keeps a newly placed Photo upright in a rotated portrait Slot and when resizing it", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
  const photo = { path: "a.jpg", width: 4000, height: 6000, orientation: 1 };
  const rotatedEmpty = rotateSlot(album, "page-1", "slot-1", 90);
  const placed = placePhoto(rotatedEmpty, "page-1", "slot-1", photo);
  expect(slotOf(placed).rotation ?? 0).toBe(0);
  const { x, y, width, height } = slotOf(rotatedEmpty);
  expect(slotOf(placed)).toMatchObject({ x, y, width, height });
  expect(slotOf(placed).placement!.crop.width).toBeCloseTo(1);
  expect(slotOf(placed).placement!.crop.height).toBeCloseTo(0.942857);
  const resized = resizeSlot(placed, "page-1", "slot-1", 0.2, 0.3);
  const crop = slotOf(resized).placement!.crop;
  expect(crop.width).toBeCloseTo(1);
  expect(crop.height).toBeCloseTo(0.7070707);
  expect(crop.y).toBeCloseTo(0.1464646);
});

it.each([90, 180, 270] as const)("keeps replacement Photos upright after %i degrees of Slot rotation", (rotation) => {
  const photo = { path: "a.jpg", width: 6000, height: 4000, orientation: 1 };
  let album = placePhoto(addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1"), "page-1", "slot-1", photo);
  for (let turn = 0; turn < rotation; turn += 90) album = rotateSlot(album, "page-1", "slot-1", 90);
  const before = slotOf(album);
  const restored = deserializeAlbum(serializeAlbum(album));
  expect(slotOf(restored)).toEqual(before);
  const replaced = placePhoto(restored, "page-1", "slot-1", { ...photo, path: "b.jpg", orientation: 6 });
  const after = slotOf(replaced);
  expect(after).toMatchObject({ rotation: 0, x: before.x, y: before.y, width: before.width, height: before.height });
  expect(after.placement!.photoPath).toBe("b.jpg");
  const targetAspect = after.width * 297 / (after.height * 210);
  expect(after.placement!.crop.width / after.placement!.crop.height).toBeCloseTo(targetAspect / (2 / 3));
  const fit = setPlacementFit(replaced, "page-1", "slot-1", true);
  expect(deserializeAlbum(serializeAlbum(fit))).toEqual(fit);
  const rotated = slotOf(rotateSlot(fit, "page-1", "slot-1", -90));
  expect(rotated.rotation).toBe(270);
  expect(rotated.placement).toEqual(slotOf(fit).placement);
  expect(slotOf(album)).toEqual(before);
});

it("keeps an overflowing sideways Text Slot outside the Bleed when moved within it", () => {
  const album = addTextSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
  const rotated = rotateSlot(album, "page-1", "slot-1", 90);
  const slot = slotOf(rotated);
  const overflowing = { ...rotated, pages: [{ ...rotated.pages[0], slots: [{ ...slot, x: -0.2, width: 0.3 }] }] };
  const moved = slotOf(moveSlot(overflowing, "page-1", "slot-1", -0.19, slot.y));
  expect(moved.x).toBeCloseTo(-0.19);
});

it("supports all quarter turns and rejects invalid stored orientations while reading old Albums", () => {
  const album = addTextSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
  expect(deserializeAlbum(serializeAlbum(album))).toEqual(album);
  let current = album;
  for (const rotation of [270, 180, 90, 0]) {
    current = rotateSlot(current, "page-1", "slot-1", -90);
    expect(slotOf(current).rotation).toBe(rotation);
    expect(deserializeAlbum(serializeAlbum(current))).toEqual(current);
  }
  const json = JSON.parse(serializeAlbum(current));
  json.pages[0].slots[0].rotation = 45;
  expect(() => deserializeAlbum(JSON.stringify(json))).toThrow(/slot/i);
});

it("deletes a Slot and its Placement, leaving the other Slots", () => {
  const album = addPhotoSlot(addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1"), "page-1");
  const deleted = deleteSlot(album, "page-1", "slot-1");
  expect(deleted.pages[0].slots.map((slot) => slot.id)).toEqual(["slot-2"]);
  expect(album.pages[0].slots).toHaveLength(2);
  expect(() => deleteSlot(deleted, "page-1", "slot-1")).toThrow(/slot/i);
  expect(addPhotoSlot(deleted, "page-1").pages[0].slots.map((slot) => slot.id)).toEqual(["slot-2", "slot-1"]);
});

it("resizes a Slot from its bottom-right corner, keeping a minimum size and stopping at the Bleed edge", () => {
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2, bleedMm: 21 }), "page-1");
  expect(slotOf(resizeSlot(album, "page-1", "slot-1", 0.5, 0.25))).toMatchObject({ x: 0.3, y: 0.3, width: 0.5, height: 0.25 });
  const huge = slotOf(resizeSlot(album, "page-1", "slot-1", 10, 10));
  expect(huge.width).toBeCloseTo(0.7707, 4);
  expect(huge.height).toBeCloseTo(0.8, 6);
  expect(slotOf(resizeSlot(album, "page-1", "slot-1", 0, -1))).toMatchObject({ width: 0.02, height: 0.02 });
  expect(() => resizeSlot(album, "page-1", "slot-1", 0.5, Infinity)).toThrow(/size/i);
});

it("places a Photo with a centred Crop that fills the Slot, for landscape, portrait and rotated Photos", () => {
  // A 0.4 x 0.4 Slot on A4 landscape is 118.8 x 84 mm (aspect 1.4143).
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
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
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
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
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
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
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
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
  const album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2, bleedMm: 21 }), "page-1");
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
  const album = createAlbum({ name: "Test", pageCount: 2, bleedMm: 21 });
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
