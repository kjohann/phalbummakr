import { expect, it } from "vitest";
import { createAlbum, deletePage, duplicatePage } from "./album";
import { addPhotoSlot, deleteSlot, placePhoto } from "./slots";
import { contentPhotoUsage, photoUsage, type PhotoIdentity } from "./usage";

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

it("shares Usage across byte-identical Photos without changing Placement paths", () => {
  const photo = { path: "a.jpg", width: 4000, height: 3000, orientation: 1 };
  let album = addPhotoSlot(createAlbum({ name: "Test" }), "page-1");
  album = placePhoto(album, "page-1", "slot-1", photo);
  const identities = new Map<string, PhotoIdentity>([
    ["a.jpg", { path: "a.jpg", status: "ready", hash: "same" }],
    ["copy.jpg", { path: "copy.jpg", status: "ready", hash: "same" }],
    ["other.jpg", { path: "other.jpg", status: "ready", hash: "different" }],
  ]);
  expect([...contentPhotoUsage(album, identities)]).toEqual([
    ["a.jpg", { status: "ready", count: 1 }],
    ["copy.jpg", { status: "ready", count: 1 }],
    ["other.jpg", { status: "ready", count: 0 }],
  ]);
  expect(album.pages[0].slots[0].placement?.photoPath).toBe("a.jpg");
  expect(contentPhotoUsage(duplicatePage(album, "page-1"), identities).get("copy.jpg")).toEqual({ status: "ready", count: 2 });
  const three = duplicatePage(duplicatePage(album, "page-1"), "page-1");
  expect(contentPhotoUsage(three, identities).get("copy.jpg")).toEqual({ status: "ready", count: 3 });
  const four = placePhoto(addPhotoSlot(three, "page-1"), "page-1", "slot-2", { ...photo, path: "copy.jpg" });
  expect(contentPhotoUsage(four, identities).get("a.jpg")).toEqual({ status: "ready", count: 4 });
  expect(contentPhotoUsage(four, identities).get("copy.jpg")).toEqual({ status: "ready", count: 4 });
  expect(contentPhotoUsage(deleteSlot(album, "page-1", "slot-1"), identities).get("copy.jpg")).toEqual({ status: "ready", count: 0 });
});

it("retains known Missing Photo Usage and never treats unresolved or failed checks as unused", () => {
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test" }), "page-1"), "page-1", "slot-1",
    { path: "gone.jpg", width: 4000, height: 3000, orientation: 1 });
  const identities = new Map<string, PhotoIdentity>([
    ["gone.jpg", { path: "gone.jpg", status: "missing", hash: "same" }],
    ["copy.jpg", { path: "copy.jpg", status: "ready", hash: "same" }],
    ["checking.jpg", { path: "checking.jpg", status: "pending" }],
    ["failed.jpg", { path: "failed.jpg", status: "error", message: "Access denied" }],
  ]);
  expect(contentPhotoUsage(album, identities).get("copy.jpg")).toEqual({ status: "ready", count: 1 });
  expect(contentPhotoUsage(album, identities).get("checking.jpg")).toMatchObject({ status: "pending", count: null });
  expect(contentPhotoUsage(album, identities).get("failed.jpg")).toEqual({ status: "error", count: null, message: "Access denied" });
  identities.set("gone.jpg", { path: "gone.jpg", status: "missing", hash: null });
  expect(contentPhotoUsage(album, identities).get("copy.jpg")).toMatchObject({ status: "pending", count: 0 });
  expect(contentPhotoUsage(album, identities).get("copy.jpg")?.status).not.toBe("ready");
  identities.delete("gone.jpg");
  expect(contentPhotoUsage(album, identities).get("copy.jpg")?.status).toBe("pending");
});

it("counts filesystem aliases but keeps different-content case-sensitive paths distinct", () => {
  const photo = { path: "Photo.jpg", width: 4000, height: 3000, orientation: 1 };
  const album = duplicatePage(placePhoto(addPhotoSlot(createAlbum({ name: "Test" }), "page-1"),
    "page-1", "slot-1", photo), "page-1");
  const identities = new Map<string, PhotoIdentity>([
    ["Photo.jpg", { path: "Photo.jpg", status: "ready", hash: "upper" }],
    ["photo.jpg", { path: "photo.jpg", status: "ready", hash: "upper" }],
  ]);
  expect(contentPhotoUsage(album, identities).get("photo.jpg")).toEqual({ status: "ready", count: 2 });
  identities.set("photo.jpg", { path: "photo.jpg", status: "ready", hash: "lower" });
  expect(contentPhotoUsage(album, identities).get("Photo.jpg")).toEqual({ status: "ready", count: 2 });
  expect(contentPhotoUsage(album, identities).get("photo.jpg")).toEqual({ status: "ready", count: 0 });
  identities.set("Photo.jpg", { path: "Photo.jpg", status: "error", message: "Filesystem identity unavailable" });
  expect(contentPhotoUsage(album, identities).get("photo.jpg")).toMatchObject({
    status: "error", count: 0, message: "Duplicate check incomplete for Photo.jpg: Filesystem identity unavailable",
  });
  expect(album.pages[0].slots[0].placement?.photoPath).toBe("Photo.jpg");
});