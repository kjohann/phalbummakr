import { expect, it } from "vitest";
import { createAlbum, deserializeAlbum, duplicatePage, serializeAlbum } from "./album";
import { addPhotoSlot, addTextSlot, deleteSlot, moveSlot, placePhoto, resizeSlot, setSlotText, setTextStyle } from "./slots";

it("adds, edits, moves, resizes, saves and deletes a Text Slot", () => {
  const original = createAlbum({ name: "Test", pageCount: 1 });
  let album = addTextSlot(original, "page-1");
  album = setSlotText(album, "page-1", "slot-1", "A caption\non two lines");
  album = setTextStyle(album, "page-1", "slot-1", {
    fontFamily: "Arial", fontSize: 24, color: "#123456", bold: true, italic: true, align: "center",
  });

  album = moveSlot(album, "page-1", "slot-1", 0.1, 0.2);
  album = resizeSlot(album, "page-1", "slot-1", 0.5, 0.25);
  const saved = deserializeAlbum(serializeAlbum(album));
  expect(saved.pages[0].slots[0]).toMatchObject({
    type: "text", x: 0.1, y: 0.2, width: 0.5, height: 0.25,
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
    { align: "justify" }, { bold: "true" }, { italic: null },
  ]) {
    const invalid = structuredClone(json);
    Object.assign(invalid.pages[0].slots[0].style, style);
    expect(() => deserializeAlbum(JSON.stringify(invalid))).toThrow(/Text Slot style/);
  }
  expect(deserializeAlbum(serializeAlbum(album))).toEqual(album);
});
