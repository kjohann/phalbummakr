import { describe, expect, it } from "vitest";
import { createAlbum } from "./album";
import { applyLayout, createGridLayout, deleteLayout, duplicateLayout, newLayout, predefinedLayoutLibrary, readLayoutLibrary, saveLayoutFromPage, serializeLayoutLibrary, setLayoutSlots, type Layout, type LayoutSlot } from "./layouts";
import { addPhotoSlot, addTextSlot, placePhoto, rotateSlot, setSlotText } from "./slots";

const format = createAlbum({ name: "Summer" }).pageFormat;

function slotCounts(slots: { type: string }[]) {
  return `${slots.filter((slot) => slot.type === "photo").length}P${slots.filter((slot) => slot.type === "text").length}T`;
}

function captionLayout(): Layout {
  const layout = predefinedLayoutLibrary(format).layouts.find((item) =>
    item.slots.length === 2 && item.slots[0].type === "photo" && item.slots[1].type === "text");
  if (!layout) throw new Error("Missing Photo and caption starter Layout.");
  return layout;
}

it("generates an equal 2-column by 3-row grid inside the Page inset", () => {
  const layout = createGridLayout(format, 2, 3);
  expect(layout.aspectRatio).toBeCloseTo(297 / 210);
  expect(layout.slots).toHaveLength(6);
  expect(layout.slots.map((slot) => slot.id)).toEqual(["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"]);
  const rectangles = layout.slots.map((slot) => [slot.x * 297, slot.y * 210, slot.width * 297, slot.height * 210]);
  const expected = [
    [15, 15, 130.5, 56], [151.5, 15, 130.5, 56],
    [15, 77, 130.5, 56], [151.5, 77, 130.5, 56],
    [15, 139, 130.5, 56], [151.5, 139, 130.5, 56],
  ];
  rectangles.forEach((rect, index) => rect.forEach((value, dimension) => expect(value).toBeCloseTo(expected[index][dimension])));
  expect(layout.slots.every((slot) => slot.type === "photo" && slot.placement === null && !slot.rotation)).toBe(true);
});

it("accepts 1 through 12 whole columns and rows, rejecting invalid dimensions", () => {
  expect(createGridLayout(format, 1, 1).slots).toHaveLength(1);
  expect(createGridLayout(format, 12, 1).slots).toHaveLength(12);
  expect(createGridLayout(format, 1, 12).slots).toHaveLength(12);
  expect(createGridLayout(format, 12, 12).slots).toHaveLength(144);
  for (const [columns, rows] of [[0, 1], [1, 0], [13, 1], [1, 13], [1.5, 2], [2, NaN], [Infinity, 1]]) {
    expect(() => createGridLayout(format, columns, rows)).toThrow("Columns and rows must be whole numbers from 1 to 12.");
  }
});

it("uses the larger Safe Zone and rejects grids with no positive Slot area", () => {
  const [slot] = createGridLayout({ ...format, safeZoneMm: 20 }, 1, 1).slots;
  expect([slot.x * 297, slot.y * 210, slot.width * 297, slot.height * 210])
    .toEqual([20, 20, 257, 170]);
  expect(() => createGridLayout({ ...format, safeZoneMm: 102 }, 1, 2))
    .toThrow("These dimensions leave no positive Slot width or height on this Page Format.");
  expect(() => createGridLayout({ ...format, safeZoneMm: 104 }, 1, 2))
    .toThrow("These dimensions leave no positive Slot width or height on this Page Format.");
});

describe("applying a Layout to a Page", () => {
  const photo = (path: string) => ({ path, width: 300, height: 200, orientation: 1 });
  const layoutOf = (slots: LayoutSlot[], aspectRatio = 297 / 210): Layout => ({ id: "layout-x", aspectRatio, slots });
  const photoSlot = (id: string, x: number, rotation?: 90): LayoutSlot =>
    ({ id, type: "photo", x, y: 0.1, width: 0.2, height: 0.3, ...(rotation ? { rotation } : {}), placement: null });
  const textSlot = (id: string, y: number): LayoutSlot => ({
    id, type: "text", x: 0.1, y, width: 0.8, height: 0.05, text: "", placeholder: `Placeholder ${id}`,
    style: { fontFamily: "Georgia", fontSize: 24, color: "#333333", bold: true, italic: false, underline: false, align: "center" },
  });

  function pageWith(placements: string[], texts: string[]) {
    let album = createAlbum({ name: "A" });
    for (const path of placements) {
      album = addPhotoSlot(album, "page-1");
      album = placePhoto(album, "page-1", album.pages[0].slots.at(-1)!.id, photo(path));
    }
    for (const text of texts) {
      album = addTextSlot(album, "page-1");
      album = setSlotText(album, "page-1", album.pages[0].slots.at(-1)!.id, text);
    }
    return album;
  }

  it("replaces the Page's Slots with the Layout's, moving Photos and text into them in order", () => {
    const album = pageWith(["a.jpg", "b.jpg"], ["First", "Second"]);
    const layout = layoutOf([textSlot("slot-1", 0.8), photoSlot("slot-2", 0.1), photoSlot("slot-3", 0.4), textSlot("slot-4", 0.9)]);
    const result = applyLayout(album, "page-1", layout);
    const slots = result.album.pages[0].slots;
    expect(slots.map((slot) => [slot.type, slot.x, slot.y])).toEqual([["text", 0.1, 0.8], ["photo", 0.1, 0.1], ["photo", 0.4, 0.1], ["text", 0.1, 0.9]]);
    expect(slots.map((slot) => slot.type === "photo" ? slot.placement?.photoPath : slot.text)).toEqual(["First", "a.jpg", "b.jpg", "Second"]);
    expect(slots[0]).toMatchObject({ placeholder: "Placeholder slot-1", style: { fontFamily: "Georgia", fontSize: 24, bold: true } });
    expect(result.dropped).toEqual({ placements: [], texts: [] });
    expect(result.aspectMismatch).toBe(false);
    expect(result.album.pages[1]).toBe(album.pages[1]);
  });

  it("fits each Photo to the orientation of its new Slot", () => {
    const album = pageWith(["a.jpg"], []);
    // Turned 90°, a 100 x 150 mm Slot shows 150 x 100 mm of content: exactly the 3:2 Photo.
    const turned: LayoutSlot = { id: "slot-1", type: "photo", x: 0.1, y: 0.1, width: 100 / 297, height: 150 / 210, rotation: 90, placement: null };
    const [slot] = applyLayout(album, "page-1", layoutOf([turned])).album.pages[0].slots;
    expect(slot).toMatchObject({ rotation: 90, placement: { photoPath: "a.jpg", fit: false } });
    const crop = slot.placement!.crop;
    expect([crop.x, crop.y, crop.width, crop.height].map((value) => Number(value.toFixed(9)))).toEqual([0, 0, 1, 1]);
  });

  it("drops Photos and text that do not fit, and reports them", () => {
    const album = pageWith(["a.jpg", "b.jpg", "c.jpg"], ["Kept", "Dropped", ""]);
    const result = applyLayout(album, "page-1", layoutOf([photoSlot("slot-1", 0.1), textSlot("slot-2", 0.8)]));
    expect(result.album.pages[0].slots.map((slot) => slot.type === "photo" ? slot.placement?.photoPath : slot.text)).toEqual(["a.jpg", "Kept"]);
    expect(result.dropped.placements.map((placement) => placement.photoPath)).toEqual(["b.jpg", "c.jpg"]);
    expect(result.dropped.texts).toEqual(["Dropped"]);
  });

  it("reports a Layout made for a different aspect ratio", () => {
    const album = createAlbum({ name: "A" });
    expect(applyLayout(album, "page-1", layoutOf([], 1)).aspectMismatch).toBe(true);
    expect(applyLayout(album, "page-1", layoutOf([], 297 / 210 + 1e-6)).aspectMismatch).toBe(false);
  });

  it("copies the Layout, so later edits to the Layout never change the Page", () => {
    const layout = layoutOf([photoSlot("slot-1", 0.1), textSlot("slot-2", 0.8)]);
    const applied = applyLayout(createAlbum({ name: "A" }), "page-1", layout).album;
    const before = structuredClone(applied);
    layout.slots[0].x = 0.5;
    if (layout.slots[1].type === "text") layout.slots[1].style.fontSize = 72;
    expect(applied).toEqual(before);
  });
});

describe("Layout Library", () => {
  it("designs starter Layouts for the default margins even when the Album has a very large Safe Zone and Bleed", () => {
    const album = createAlbum({ name: "Large margins", safeZoneMm: 104, bleedMm: 20 });
    const library = predefinedLayoutLibrary(album.pageFormat);
    expect(library).toEqual(predefinedLayoutLibrary(format));
    expect(() => serializeLayoutLibrary(library)).not.toThrow();
    const applied = applyLayout(album, "page-1", library.layouts[2]).album;
    expect(applied.pages[0].slots).toEqual(library.layouts[2].slots);
    expect(applied.pages[0].slots[0].x * 297).toBeCloseTo(15);
    expect(applied.pageFormat.safeZoneMm).toBe(104);
  });

  it("offers a large left-hand Photo beside three stacked Photos", () => {
    const [hero, ...stack] = predefinedLayoutLibrary(format).layouts[4].slots;
    expect(stack).toHaveLength(3);
    expect(hero.x).toBeLessThan(stack[0].x);
    expect(hero.height).toBeGreaterThan(stack[0].height);
    expect(hero.width).toBeGreaterThan(stack[0].width);
    expect(stack.map((slot) => slot.y)).toEqual([...stack.map((slot) => slot.y)].sort((a, b) => a - b));
    expect(new Set(stack.map((slot) => slot.x)).size).toBe(1);
  });

  it("offers a wide hero above four smaller Photos", () => {
    const mosaic = predefinedLayoutLibrary(format).layouts[5];
    expect(mosaic).toBeDefined();
    const [hero, ...row] = mosaic.slots;
    expect(row).toHaveLength(4);
    expect(hero.y).toBeLessThan(row[0].y);
    expect(hero.width).toBeGreaterThan(row[0].width);
    expect(hero.height).toBeGreaterThan(row[0].height);
    expect(new Set(row.map((slot) => slot.y)).size).toBe(1);
    expect(row.map((slot) => slot.x)).toEqual([...row.map((slot) => slot.x)].sort((a, b) => a - b));
  });

  it("offers two larger Photos above three smaller Photos", () => {
    const mosaic = predefinedLayoutLibrary(format).layouts[6];
    expect(mosaic).toBeDefined();
    const [leftHero, rightHero, ...row] = mosaic.slots;
    expect(row).toHaveLength(3);
    expect(leftHero.y).toBe(rightHero.y);
    expect(leftHero.x).toBeLessThan(rightHero.x);
    expect(leftHero.y).toBeLessThan(row[0].y);
    expect(leftHero.width).toBeGreaterThan(row[0].width);
    expect(leftHero.height).toBeGreaterThan(row[0].height);
    expect(new Set(row.map((slot) => slot.y)).size).toBe(1);
  });

  it("offsets the four joins with tall upper-left and lower-right Photos", () => {
    const mosaic = predefinedLayoutLibrary(format).layouts[7];
    expect(mosaic).toBeDefined();
    const [upperLeft, upperRight, lowerLeft, lowerRight] = mosaic.slots;
    expect(mosaic.slots).toHaveLength(4);
    expect(upperLeft.height * 210).toBeGreaterThan(upperLeft.width * 297);
    expect(lowerRight.height * 210).toBeGreaterThan(lowerRight.width * 297);
    expect(upperRight.width * 297).toBeGreaterThan(upperRight.height * 210);
    expect(lowerLeft.width * 297).toBeGreaterThan(lowerLeft.height * 210);
    expect(upperLeft.x).toBe(lowerLeft.x);
    expect(upperRight.x).toBe(lowerRight.x);
    expect(lowerLeft.y).toBeGreaterThan(lowerRight.y);
  });

  it("places two stacked Photos on either side of a larger central Photo", () => {
    const mosaic = predefinedLayoutLibrary(format).layouts[8];
    expect(mosaic).toBeDefined();
    const [leftTop, centre, rightTop, leftBottom, rightBottom] = mosaic.slots;
    expect(mosaic.slots).toHaveLength(5);
    expect(leftTop.x).toBe(leftBottom.x);
    expect(rightTop.x).toBe(rightBottom.x);
    expect(leftTop.x).toBeLessThan(centre.x);
    expect(centre.x).toBeLessThan(rightTop.x);
    expect(leftTop.y).toBeLessThan(leftBottom.y);
    expect(rightTop.y).toBeLessThan(rightBottom.y);
    expect(centre.width).toBeGreaterThan(leftTop.width);
    expect(centre.height).toBeGreaterThan(leftTop.height);
  });

  it("alternates the split heights across three columns of two Photos", () => {
    const mosaic = predefinedLayoutLibrary(format).layouts[9];
    expect(mosaic).toBeDefined();
    const [leftTop, centreTop, rightTop, leftBottom, centreBottom, rightBottom] = mosaic.slots;
    expect(mosaic.slots).toHaveLength(6);
    expect(leftTop.x).toBe(leftBottom.x);
    expect(centreTop.x).toBe(centreBottom.x);
    expect(rightTop.x).toBe(rightBottom.x);
    expect(leftTop.x).toBeLessThan(centreTop.x);
    expect(centreTop.x).toBeLessThan(rightTop.x);
    expect(leftBottom.y).toBe(rightBottom.y);
    expect(centreBottom.y).toBeGreaterThan(leftBottom.y);
    expect(centreTop.height).toBeGreaterThan(leftTop.height);
    expect(leftBottom.height).toBeGreaterThan(centreBottom.height);
  });

  it("starts a new Library with the predefined Layouts, made for an A4 landscape canvas", () => {
    const library = predefinedLayoutLibrary(format);
    expect(library.layouts.map((layout) => slotCounts(layout.slots))).toEqual([
      "1P0T", "3P0T", "1P1T", "1P1T", "4P0T", "5P0T", "5P0T", "4P0T", "5P0T", "6P0T",
    ]);
    for (const layout of library.layouts) expect(layout.aspectRatio).toBeCloseTo(297 / 210);
  });

  it("keeps every mosaic inside a 15 mm inset with 6 mm gaps and no overlapping or rotated Slots", () => {
    const mosaics = predefinedLayoutLibrary(format).layouts.slice(4);
    for (const layout of mosaics) {
      const slots = layout.slots.map((slot) => {
        expect(slot.type).toBe("photo");
        if (slot.type !== "photo") throw new Error("Expected a Photo Slot.");
        expect(slot.placement).toBeNull();
        expect(slot.rotation).toBeUndefined();
        const rect = { x: slot.x * 297, y: slot.y * 210, width: slot.width * 297, height: slot.height * 210 };
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(15 - 1e-9);
        expect(rect.y).toBeGreaterThanOrEqual(15 - 1e-9);
        expect(rect.x + rect.width).toBeLessThanOrEqual(282 + 1e-9);
        expect(rect.y + rect.height).toBeLessThanOrEqual(195 + 1e-9);
        return rect;
      });
      expect(Math.min(...slots.map((slot) => slot.x))).toBeCloseTo(15);
      expect(Math.min(...slots.map((slot) => slot.y))).toBeCloseTo(15);
      expect(Math.max(...slots.map((slot) => slot.x + slot.width))).toBeCloseTo(282);
      expect(Math.max(...slots.map((slot) => slot.y + slot.height))).toBeCloseTo(195);
      for (let first = 0; first < slots.length; first += 1) {
        for (let second = first + 1; second < slots.length; second += 1) {
          const a = slots[first];
          const b = slots[second];
          const horizontalGap = Math.max(a.x - b.x - b.width, b.x - a.x - a.width);
          const verticalGap = Math.max(a.y - b.y - b.height, b.y - a.y - a.height);
          expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(6 - 1e-9);
        }
      }
    }
  });

  it("gives every predefined Text Slot the default placeholder", () => {
    const texts = predefinedLayoutLibrary(format).layouts.flatMap((layout) => layout.slots).filter((slot) => slot.type === "text");
    expect(texts.map((slot) => slot.type === "text" && slot.placeholder)).toEqual(["Text", "Text"]);
  });

  it("covers the whole Page out to the Bleed with the full-bleed Layout", () => {
    const [fullBleed] = predefinedLayoutLibrary({ ...format, bleedMm: 3 }).layouts;
    expect(fullBleed.slots[0]).toMatchObject({ type: "photo", placement: null });
    expect(fullBleed.slots[0].x * 297).toBeCloseTo(-3);
    expect(fullBleed.slots[0].y * 210).toBeCloseTo(-3);
    expect(fullBleed.slots[0].width * 297).toBeCloseTo(303);
    expect(fullBleed.slots[0].height * 210).toBeCloseTo(216);
  });

  it("adds an empty Layout at the end, recording the canvas aspect ratio", () => {
    const { library, id } = newLayout({ schemaVersion: 2, layouts: [] }, 1.5);
    expect(library.layouts).toEqual([{ id, aspectRatio: 1.5, slots: [] }]);
    const second = newLayout(library, 1.5);
    expect(second.id).not.toBe(id);
    expect(second.library.layouts.map((layout) => layout.id)).toEqual([id, second.id]);
  });

  it("duplicates a Layout right after the original, as an independent copy", () => {
    const library = predefinedLayoutLibrary(format);
    const original = library.layouts[1];
    const { library: duplicated, id } = duplicateLayout(library, original.id);
    expect(duplicated.layouts[2]).toEqual({ ...original, id });
    expect(id).not.toBe(original.id);
    const edited = setLayoutSlots(duplicated, id, [], 297 / 210);
    expect(edited.layouts[1]).toEqual(original);
  });

  it("deletes a Layout", () => {
    const library = predefinedLayoutLibrary(format);
    const remaining = deleteLayout(library, library.layouts[0].id);
    expect(remaining.layouts.map((layout) => layout.id)).toEqual(library.layouts.slice(1).map((layout) => layout.id));
    expect(() => deleteLayout(remaining, library.layouts[0].id)).toThrow("Layout not found");
  });

  it("stores edited Slots without any Photos or text, as made on the canvas they were edited on", () => {
    const { library, id } = newLayout({ schemaVersion: 2, layouts: [] }, 1.5);
    const album = setSlotText(placePhoto(addTextSlot(addPhotoSlot(createAlbum({ name: "A" }), "page-1"), "page-1"),
      "page-1", "slot-1", { path: "a.jpg", width: 300, height: 200, orientation: 1 }), "page-1", "slot-2", "Hello");
    const edited = setLayoutSlots(library, id, album.pages[0].slots, 297 / 210);
    expect(edited.layouts[0].slots[0]).toMatchObject({ type: "photo", placement: null });
    expect(edited.layouts[0].slots[1]).toMatchObject({ type: "text", text: "", style: { fontFamily: "Arial", fontSize: 18 } });
    expect(edited.layouts[0].aspectRatio).toBe(297 / 210);
  });

  it("saves a Page as a new Layout at the end, keeping geometry, orientation and Text Slot styles but no content", () => {
    let album = addTextSlot(addPhotoSlot(createAlbum({ name: "A" }), "page-2"), "page-2");
    album = placePhoto(album, "page-2", "slot-1", { path: "a.jpg", width: 300, height: 200, orientation: 1 });
    album = setSlotText(rotateSlot(album, "page-2", "slot-1", 90), "page-2", "slot-2", "Hello");
    const page = album.pages[1];
    const library = predefinedLayoutLibrary(format);
    const { library: saved, id } = saveLayoutFromPage(library, album, "page-2");
    expect(saved.layouts.slice(0, -1)).toEqual(library.layouts);
    const layout = saved.layouts.at(-1)!;
    expect(layout.id).toBe(id);
    expect(id).toMatch(/^layout-/);
    expect(layout.aspectRatio).toBeCloseTo(297 / 210);
    const [photoSlot, textSlot] = layout.slots;
    const [pagePhoto, pageText] = page.slots;
    expect(photoSlot).toEqual({ ...pagePhoto, placement: null });
    expect(photoSlot.rotation).toBe(90);
    expect(textSlot).toEqual({ ...pageText, text: "" });
    expect(album.pages[1]).toBe(page);
    expect(() => serializeLayoutLibrary(saved)).not.toThrow();
  });

  it("reads a missing Layout Library as the predefined Layouts, and saved Libraries as they were", () => {
    expect(readLayoutLibrary(null, format)).toEqual(predefinedLayoutLibrary(format));
    const emptied = { schemaVersion: 2 as const, layouts: [] };
    expect(readLayoutLibrary(serializeLayoutLibrary(emptied), format)).toEqual(emptied);
    const library = duplicateLayout(predefinedLayoutLibrary(format), captionLayout().id).library;
    expect(readLayoutLibrary(serializeLayoutLibrary(library), format)).toEqual(library);
  });

  it("adds mosaics once to a saved Library, preserving edited Layouts and deleted additions", () => {
    const editedCaption = structuredClone(captionLayout());
    const caption = editedCaption.slots[1];
    if (caption.type !== "text") throw new Error("Expected a Text Slot.");
    caption.placeholder = "My caption";
    caption.style.bold = true;
    const original = [
      { ...createGridLayout(format, 2, 2), id: "predefined-mosaic-1" },
      editedCaption,
    ];
    const migrated = readLayoutLibrary(JSON.stringify({ schemaVersion: 1, layouts: original }), format);
    expect(migrated.layouts.slice(0, original.length)).toEqual(original);
    expect(migrated.layouts.slice(original.length).map((layout) => slotCounts(layout.slots)))
      .toEqual(["4P0T", "5P0T", "5P0T", "4P0T", "5P0T", "6P0T"]);
    expect(new Set(migrated.layouts.map((layout) => layout.id)).size).toBe(migrated.layouts.length);
    expect(readLayoutLibrary(serializeLayoutLibrary(migrated), format)).toEqual(migrated);
    const deleted = deleteLayout(migrated, migrated.layouts[original.length].id);
    expect(readLayoutLibrary(serializeLayoutLibrary(deleted), format)).toEqual(deleted);
  });

  it("reads Text Slots saved without a placeholder with the default one", () => {
    const caption = captionLayout();
    const legacy = JSON.parse(serializeLayoutLibrary({ schemaVersion: 2, layouts: [caption] }));
    legacy.schemaVersion = 1;
    delete legacy.layouts[0].slots[1].placeholder;
    expect(readLayoutLibrary(JSON.stringify(legacy), format).layouts[0].slots[1]).toMatchObject({ placeholder: "Text" });
  });

  it("rejects Layout Libraries holding content or invalid Layouts", () => {
    const valid = predefinedLayoutLibrary(format);
    const caption = captionLayout();
    const variants: unknown[] = [
      { ...valid, schemaVersion: 3 },
      { schemaVersion: 1, layouts: [valid.layouts[0], valid.layouts[0]] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[0], aspectRatio: 0 }] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[0], name: "Named" }] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[0], slots: [{ ...valid.layouts[0].slots[0],
        placement: { photoPath: "a.jpg", crop: { x: 0, y: 0, width: 1, height: 1 }, fit: false } }] }] },
      { schemaVersion: 1, layouts: [{ ...caption, slots: [caption.slots[0], { ...caption.slots[1], text: "Hi" }] }] },
    ];
    for (const variant of variants) {
      expect(() => readLayoutLibrary(JSON.stringify(variant), format)).toThrow();
    }
  });

  it("keeps the other predefined Layouts inside the Safe Zone", () => {
    const library = predefinedLayoutLibrary({ ...format, safeZoneMm: 5 });
    for (const layout of library.layouts.slice(1)) {
      for (const slot of layout.slots) {
        expect(slot.x * 297).toBeGreaterThanOrEqual(5);
        expect(slot.y * 210).toBeGreaterThanOrEqual(5);
        expect((slot.x + slot.width) * 297).toBeLessThanOrEqual(292);
        expect((slot.y + slot.height) * 210).toBeLessThanOrEqual(205);
      }
    }
  });
});
