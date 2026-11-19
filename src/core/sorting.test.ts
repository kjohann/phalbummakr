import { describe, expect, it } from "vitest";
import { addPhotoSlot, createAlbum, placePhoto, serializeAlbum, setPlacementFit, type Album } from ".";
import { planPhotoMove, relinkPlacements, sendPhotosToFolder, type AlbumRewrite, type PhotoMove, type SortingPorts } from "./sorting";

function photo(path: string) {
  return { path, width: 4000, height: 3000, orientation: 1 };
}

function albumWith(...paths: string[]): Album {
  let album = createAlbum({ name: "Christmas", pageCount: 2 });
  paths.forEach((path, index) => {
    album = addPhotoSlot(album, "page-1");
    album = placePhoto(album, "page-1", `slot-${index + 1}`, photo(path));
  });
  return album;
}

it("plans moving Photos into a Folder under their own names", () => {
  expect(planPhotoMove(["2024/a.jpg", "b.png"], "grandparents", [])).toEqual([
    { from: "2024/a.jpg", to: "grandparents/a.jpg" },
    { from: "b.png", to: "grandparents/b.png" },
  ]);
});

it("suffixes names already taken in the target Folder, ignoring case, and between moved Photos", () => {
  expect(planPhotoMove(
    ["IMG_0012.jpg", "trip/img_0012.JPG", "trip/x/IMG_0012.jpg", "notes.png"],
    "kids",
    ["IMG_0012.jpg", "img_0012 (2).jpg", "NOTES.PNG"],
  )).toEqual([
    { from: "IMG_0012.jpg", to: "kids/IMG_0012 (3).jpg" },
    { from: "trip/img_0012.JPG", to: "kids/img_0012 (4).JPG" },
    { from: "trip/x/IMG_0012.jpg", to: "kids/IMG_0012 (5).jpg" },
    { from: "notes.png", to: "kids/notes (2).png" },
  ]);
});

it.each([".phalbummakr", "exports", "trips/Exports", ".git", "trips/.cache", "../outside", "a//b", "a\\b", "/abs"])(
  "never sends Photos to the protected or invalid Folder %s",
  (target) => {
    expect(() => planPhotoMove(["a.jpg"], target, [])).toThrow(/Folder/);
  },
);

it("leaves Photos that are already in the target Folder where they are", () => {
  expect(planPhotoMove(["kids/a.jpg", "b.jpg"], "kids", ["a.jpg"])).toEqual([{ from: "b.jpg", to: "kids/b.jpg" }]);
  expect(planPhotoMove(["c.jpg", "x/c.jpg"], "", ["c.jpg"])).toEqual([{ from: "x/c.jpg", to: "c (2).jpg" }]);
});

it("points every Placement of a moved Photo at its new path and keeps how it is shown", () => {
  const album = setPlacementFit(albumWith("a.jpg", "b.jpg", "a.jpg"), "page-1", "slot-3", true);
  const relinked = relinkPlacements(album, [{ from: "a.jpg", to: "kids/a (2).jpg" }]);
  const placements = relinked.pages[0].slots.map((slot) => slot.type === "photo" ? slot.placement : null);
  expect(placements.map((placement) => placement?.photoPath)).toEqual(["kids/a (2).jpg", "b.jpg", "kids/a (2).jpg"]);
  expect(placements[2]).toEqual({ ...(album.pages[0].slots[2] as { placement: object }).placement, photoPath: "kids/a (2).jpg" });
  expect(album.pages[0].slots[0]).toMatchObject({ placement: { photoPath: "a.jpg" } });
});

it("returns an Album without moved Photos unchanged", () => {
  const album = albumWith("b.jpg");
  expect(relinkPlacements(album, [{ from: "a.jpg", to: "kids/a.jpg" }])).toBe(album);
});

describe("sendPhotosToFolder", () => {
  function fakeLibrary(albums: Record<string, string>, namesInTarget: string[] = []) {
    const moved: { moves: PhotoMove[]; albums: AlbumRewrite[] }[] = [];
    const ports: SortingPorts = {
      folderNames: async () => namesInTarget,
      rootAlbums: async () => Object.entries(albums).map(([name, json]) => ({ name, json })),
      movePhotos: async (_root, moves, rewrites) => { moved.push({ moves, albums: rewrites }); },
    };
    return { ports, moved };
  }

  it("moves the Photo and rewrites every root Album that places it, taking the open Album from memory", async () => {
    const onDisk = albumWith("a.jpg");
    const unsaved = addPhotoSlot(albumWith("a.jpg"), "page-2");
    const other = albumWith("a.jpg", "b.jpg");
    const unrelated = albumWith("b.jpg");
    const library = fakeLibrary({
      "Christmas.phalbum": serializeAlbum(onDisk),
      "Summer.phalbum": serializeAlbum(other),
      "Easter.phalbum": serializeAlbum(unrelated),
    }, ["a.jpg"]);

    const result = await sendPhotosToFolder(library.ports, {
      root: "D:\\Photos", photos: ["a.jpg"], target: "kids", openAlbum: { name: "Christmas.phalbum", album: unsaved },
    });

    const moves = [{ from: "a.jpg", to: "kids/a (2).jpg" }];
    expect(result.moves).toEqual(moves);
    expect(result.openAlbum).toEqual(relinkPlacements(unsaved, moves));
    expect(library.moved).toEqual([{
      moves,
      albums: [
        { name: "Christmas.phalbum", original: serializeAlbum(onDisk), updated: serializeAlbum(relinkPlacements(unsaved, moves)) },
        { name: "Summer.phalbum", original: serializeAlbum(other), updated: serializeAlbum(relinkPlacements(other, moves)) },
      ],
    }]);
  });

  it("cancels before moving anything when an Album in the Library root can't be read", async () => {
    const library = fakeLibrary({ "Broken.phalbum": "{ not json", "Summer.phalbum": serializeAlbum(albumWith("a.jpg")) });
    await expect(sendPhotosToFolder(library.ports, {
      root: "D:\\Photos", photos: ["a.jpg"], target: "kids", openAlbum: null,
    })).rejects.toThrow(/Broken\.phalbum/);
    expect(library.moved).toEqual([]);
  });

  it("leaves the open Album alone when it doesn't place a moved Photo", async () => {
    const open = albumWith("b.jpg");
    const library = fakeLibrary({ "Christmas.phalbum": serializeAlbum(albumWith()) });
    const result = await sendPhotosToFolder(library.ports, {
      root: "D:\\Photos", photos: ["a.jpg"], target: "kids", openAlbum: { name: "Christmas.phalbum", album: open },
    });
    expect(result.openAlbum).toBeNull();
    expect(library.moved).toEqual([{ moves: [{ from: "a.jpg", to: "kids/a.jpg" }], albums: [] }]);
  });
});
