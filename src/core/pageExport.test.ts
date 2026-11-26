import { expect, it } from "vitest";
import { createAlbum } from "./album";
import { exportPageSize, exportPlan, exportWarnings } from "./pageExport";
import { addPhotoSlot, addTextSlot, placePhoto, setSlotText } from "./slots";

const photo = { path: "a.jpg", width: 3000, height: 2000, orientation: 1 };

it("plans one numbered file per Page, in Page order, with the pixel box each Placement fills", () => {
  // 254 DPI is exactly 10 pixels per mm, so the trim Page is 2970 x 2100 pixels.
  const album = createAlbum({ name: "Christmas", pageCount: 2, dpi: 254 });
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
  album.pages[0].slots = [
    { id: "turned", type: "photo", x: 0, y: 0, width: 0.5, height: 0.25, rotation: 90, placement: { photoPath: "a.jpg", crop, fit: false } },
    { id: "empty", type: "photo", x: 0.5, y: 0, width: 0.5, height: 0.5, placement: null },
  ];
  album.pages[1].slots = [
    { id: "fitted", type: "photo", x: 0.1, y: 0.1, width: 0.2, height: 0.3, placement: { photoPath: "b.jpg", crop, fit: true } },
  ];

  expect(exportPlan(album)).toEqual([
    { page: album.pages[0], fileName: "001.jpg", photos: [
      { slotId: "turned", photoPath: "a.jpg", crop, fit: false, width: 525, height: 1485 },
    ] },
    { page: album.pages[1], fileName: "002.jpg", photos: [
      { slotId: "fitted", photoPath: "b.jpg", crop: { x: 0, y: 0, width: 1, height: 1 }, fit: true, width: 594, height: 630 },
    ] },
  ]);
});

it("warns about Pages that would print blank and about empty Photo Slots on the other Pages", () => {
  let album = createAlbum({ name: "Christmas", pageCount: 6 });
  const [first, second, third, , fifth] = album.pages.map((page) => page.id);
  // Page 1: one placed and two empty Photo Slots.
  album = addPhotoSlot(addPhotoSlot(addPhotoSlot(album, first), first), first);
  album = placePhoto(album, first, album.pages[0].slots[0].id, photo);
  // Page 2: only text.
  album = addTextSlot(album, second);
  album = setSlotText(album, second, album.pages[1].slots[0].id, "Merry Christmas");
  // Page 3: an empty Photo Slot and a Text Slot with only its placeholder, so nothing prints.
  album = addTextSlot(addPhotoSlot(album, third), third);
  // Page 5: a placed Photo.
  album = addPhotoSlot(album, fifth);
  album = placePhoto(album, fifth, album.pages[4].slots[0].id, photo);

  expect(exportWarnings(album)).toEqual({
    emptyPages: [3, 4, 6],
    emptyPhotoSlots: [{ page: 1, count: 2 }],
  });
});

it("sizes an exported Page at the Page Format's resolution including the Bleed on every side", () => {
  const album = createAlbum({ name: "Christmas", bleedMm: { x: 3, y: 3 }, dpi: 300 });
  // (297 + 6) mm x (210 + 6) mm at 300 DPI.
  expect(exportPageSize(album.pageFormat)).toEqual({ width: 3579, height: 2551, pixelsPerMm: 300 / 25.4 });
});

it("adds each axis' Bleed to the matching side of an exported Page", () => {
  const album = createAlbum({ name: "Christmas", bleedMm: { x: 5, y: 0 }, dpi: 254 });
  // (297 + 10) mm x 210 mm at 10 pixels per mm.
  expect(exportPageSize(album.pageFormat)).toMatchObject({ width: 3070, height: 2100 });
});
