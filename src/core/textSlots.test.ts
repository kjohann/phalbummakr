import { expect, it } from "vitest";
import { createAlbum, deserializeAlbum, duplicatePage, serializeAlbum } from "./album";
import { addPhotoSlot, addTextSlot, deleteSlot, moveSlot, placePhoto, resizeSlot, setSlotText, setTextStyle } from "./slots";

it("adds, edits, moves, resizes, saves and deletes a Text Slot", () => {
  const original = createAlbum({ name: "Test", pageCount: 1 });
  let album = addTextSlot(original, "page-1");
  album = setSlotText(album, "page-1", "slot-1", "A caption\non two lines");
  album = setTextStyle(album, "page-1", "slot-1", {
    fontFamily: "Arial", fontSize: 24, color: "#123456", bold: true, italic: true, underline: false, align: "center",
  });

  album = moveSlot(album, "page-1", "slot-1", 0.1, 0.2);
  album = resizeSlot(album, "page-1", "slot-1", 0.5, 0.25);
  const saved = deserializeAlbum(serializeAlbum(album));
  expect(saved.pages[0].slots[0]).toMatchObject({
    type: "text", x: 0.1, y: 0.2, width: 0.5,
    text: "A caption\non two lines",
    style: { fontFamily: "Arial", fontSize: 24, color: "#123456", bold: true, italic: true, align: "center" },
  });

  expect(deleteSlot(saved, "page-1", "slot-1").pages[0].slots).toEqual([]);
  expect(original.pages[0].slots).toEqual([]);
});

it("duplicates Page text independently and rejects invalid text styles and Photo placement in a Text Slot", () => {
  let album = addTextSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  album = setSlotText(album, "page-1", "slot-1", "Caption");
  album = addPhotoSlot(album, "page-1");
  const copy = setSlotText(duplicatePage(album, "page-1"), "page-2", "slot-1", "Changed");
  expect(copy.pages[0].slots[0]).toMatchObject({ text: "Caption" });
  expect(copy.pages[1].slots[0]).toMatchObject({ text: "Changed" });
  expect(() => placePhoto(album, "page-1", "slot-1", { path: "a.jpg", width: 100, height: 100, orientation: 1 }))
    .toThrow(/Photo Slot/);
  const json = JSON.parse(serializeAlbum(album));
  for (const style of [
    { fontSize: 0 }, { fontSize: -2 }, { color: "red" }, { fontFamily: "" },
    { align: "justify" }, { bold: "true" }, { italic: null }, { underline: "true" },
  ]) {
    const invalid = structuredClone(json);
    Object.assign(invalid.pages[0].slots[0].style, style);
    expect(() => deserializeAlbum(JSON.stringify(invalid))).toThrow(/Text Slot style/);
  }
  expect(deserializeAlbum(serializeAlbum(album))).toEqual(album);
});

it("defaults legacy Text Slot underline to off and persists explicit underline", () => {
  const album = addTextSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  const legacy = JSON.parse(serializeAlbum(album));
  delete legacy.pages[0].slots[0].style.underline;
  const loaded = deserializeAlbum(JSON.stringify(legacy));
  expect(loaded.pages[0].slots[0]).toMatchObject({ style: { underline: false } });
  const slot = loaded.pages[0].slots[0];
  if (slot.type !== "text") throw new Error("Expected a Text Slot");
  const underlined = setTextStyle(loaded, "page-1", "slot-1", { ...slot.style, underline: true });
  expect(deserializeAlbum(serializeAlbum(underlined)).pages[0].slots[0]).toMatchObject({ style: { underline: true } });
});

it("persists fitted Text Slot height beyond the Page and resizes only its width", () => {
  const json = JSON.parse(serializeAlbum(addTextSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1")));
  json.pages[0].slots[0].height = 0.8;
  let album = deserializeAlbum(JSON.stringify(json));
  album = moveSlot(album, "page-1", "slot-1", 0.1, 0.6);
  album = resizeSlot(album, "page-1", "slot-1", 0.5, 0.02);
  expect(deserializeAlbum(serializeAlbum(album)).pages[0].slots[0]).toMatchObject({
    x: 0.1, y: 0.6, width: 0.5, height: 0.8,
  });
  json.pages[0].slots[0].height = 0;
  expect(() => deserializeAlbum(JSON.stringify(json))).toThrow(/slot/i);
});
