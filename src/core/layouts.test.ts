import { describe, expect, it } from "vitest";
import { createAlbum } from "./album";
import { applyLayout, deleteLayout, duplicateLayout, newLayout, predefinedLayoutLibrary, readLayoutLibrary, saveLayoutFromPage, serializeLayoutLibrary, setLayoutSlots, type Layout, type LayoutSlot } from "./layouts";
import { addPhotoSlot, addTextSlot, placePhoto, rotateSlot, setSlotText } from "./slots";

const format = createAlbum({ name: "Summer" }).pageFormat;

function slotCounts(slots: { type: string }[]) {
  return `${slots.filter((slot) => slot.type === "photo").length}P${slots.filter((slot) => slot.type === "text").length}T`;
}

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
  it("starts a new Library with the predefined Layouts, made for an A4 landscape canvas", () => {
    const library = predefinedLayoutLibrary(format);
    expect(library.layouts.map((layout) => slotCounts(layout.slots))).toEqual([
      "1P0T", "2P0T", "3P0T", "3P0T", "3P0T", "4P0T", "4P0T", "6P0T", "9P0T", "1P1T", "1P1T",
    ]);
    for (const layout of library.layouts) expect(layout.aspectRatio).toBeCloseTo(297 / 210);
  });

  it("offers equal landscape and portrait Slots, centred on the Page", () => {
    const layouts = predefinedLayoutLibrary(format).layouts;
    const mm = (slot: { x: number; y: number; width: number; height: number }) =>
      ({ left: slot.x * 297, top: slot.y * 210, width: slot.width * 297, height: slot.height * 210 });
    for (const [index, aspect] of [[3, 3 / 2], [4, 2 / 3], [6, 2 / 3]] as const) {
      const slots = layouts[index].slots.map(mm);
      const left = Math.min(...slots.map((slot) => slot.left));
      const right = Math.max(...slots.map((slot) => slot.left + slot.width));
      const top = Math.min(...slots.map((slot) => slot.top));
      const bottom = Math.max(...slots.map((slot) => slot.top + slot.height));
      for (const slot of slots) {
        expect(slot.width / slot.height).toBeCloseTo(aspect);
        expect(slot.width).toBeCloseTo(slots[0].width);
      }
      expect(left).toBeCloseTo(297 - right);
      expect(top).toBeCloseTo(210 - bottom);
    }
    expect(new Set(layouts[3].slots.map((slot) => slot.y)).size).toBe(1);
    expect(new Set(layouts[6].slots.map((slot) => slot.x.toFixed(9))).size).toBe(2);
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
    const { library, id } = newLayout({ schemaVersion: 1, layouts: [] }, 1.5);
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
    const { library, id } = newLayout({ schemaVersion: 1, layouts: [] }, 1.5);
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
    const emptied = { schemaVersion: 1 as const, layouts: [] };
    expect(readLayoutLibrary(serializeLayoutLibrary(emptied), format)).toEqual(emptied);
    const library = duplicateLayout(predefinedLayoutLibrary(format), "predefined-10").library;
    expect(readLayoutLibrary(serializeLayoutLibrary(library), format)).toEqual(library);
  });

  it("reads Text Slots saved without a placeholder with the default one", () => {
    const caption = predefinedLayoutLibrary(format).layouts[9];
    const legacy = JSON.parse(serializeLayoutLibrary({ schemaVersion: 1, layouts: [caption] }));
    delete legacy.layouts[0].slots[1].placeholder;
    expect(readLayoutLibrary(JSON.stringify(legacy), format).layouts[0].slots[1]).toMatchObject({ placeholder: "Text" });
  });

  it("rejects Layout Libraries holding content or invalid Layouts", () => {
    const valid = predefinedLayoutLibrary(format);
    const variants: unknown[] = [
      { ...valid, schemaVersion: 2 },
      { schemaVersion: 1, layouts: [valid.layouts[0], valid.layouts[0]] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[0], aspectRatio: 0 }] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[0], name: "Named" }] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[0], slots: [{ ...valid.layouts[0].slots[0],
        placement: { photoPath: "a.jpg", crop: { x: 0, y: 0, width: 1, height: 1 }, fit: false } }] }] },
      { schemaVersion: 1, layouts: [{ ...valid.layouts[9], slots: [valid.layouts[9].slots[0], { ...valid.layouts[9].slots[1], text: "Hi" }] }] },
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
