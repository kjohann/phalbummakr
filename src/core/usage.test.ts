import { expect, it } from "vitest";
import { createAlbum, deletePage, duplicatePage } from "./album";
import { addPhotoSlot, deleteSlot, placePhoto } from "./slots";
import { photoUsage } from "./usage";

it("counts Placements by relative path across Pages and reflects Album changes", () => {
  const photo = { path: "holiday/photo.jpg", width: 4000, height: 3000, orientation: 1 };
  let album = createAlbum({ name: "Test", pageCount: 2 });
  album = addPhotoSlot(addPhotoSlot(album, "page-1"), "page-2");
  expect([...photoUsage(album)]).toEqual([]);
  album = placePhoto(placePhoto(album, "page-1", "slot-1", photo), "page-2", "slot-1", photo);
  expect(photoUsage(album).get(photo.path)).toBe(2);
  const replaced = placePhoto(album, "page-2", "slot-1", { ...photo, path: "other/photo.jpg" });
  expect([...photoUsage(replaced)]).toEqual([[photo.path, 1], ["other/photo.jpg", 1]]);
  const duplicated = duplicatePage(replaced, "page-1");
  expect(photoUsage(duplicated).get(photo.path)).toBe(2);
  expect(photoUsage(deletePage(duplicated, "page-1")).get(photo.path)).toBe(1);
  expect(photoUsage(deleteSlot(replaced, "page-1", "slot-1")).has(photo.path)).toBe(false);
  expect(photoUsage(album).get(photo.path)).toBe(2);
});