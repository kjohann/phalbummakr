import { describe, expect, it } from "vitest";
import { addPhotoSlot, createAlbum, placePhoto, serializeAlbum, setPlacementFit, type Album } from ".";
import { copyPhotosToFolder, folderNameProblem, planPhotoMove, relinkPlacements, renameFolder, scanAfterMove, sendPhotosToFolder, type AlbumRewrite, type FolderRename, type PhotoMove, type SortingPorts } from "./sorting";

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

it("copies a mixed-source batch with collision suffixes and no Album reads or rewrites", async () => {
  const copied: PhotoMove[][] = [];
  const ports = {
    folderNames: async () => ["A.JPG"],
    copyPhotos: async (_root: string, copies: PhotoMove[]) => { copied.push(copies); },
  };
  expect(await copyPhotosToFolder(ports, {
    root: "D:\\Photos", photos: ["a.jpg", "trip/a.jpg", "kids/a.jpg"], target: "kids",
  })).toEqual([{ from: "a.jpg", to: "kids/a (2).jpg" }, { from: "trip/a.jpg", to: "kids/a (3).jpg" }]);
  expect(copied).toHaveLength(1);
  await expect(copyPhotosToFolder(ports, {
    root: "D:\\Photos", photos: ["a.jpg"], target: "Exports",
  })).rejects.toThrow(/Folder/);
  expect(copied).toHaveLength(1);
  ports.copyPhotos = async () => { throw new Error("Copy failed; rollback failed"); };
  await expect(copyPhotosToFolder(ports, {
    root: "D:\\Photos", photos: ["a.jpg"], target: "kids",
  })).rejects.toThrow("Copy failed; rollback failed");
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
      copyPhotos: async () => { throw new Error("not a copy"); },
      renameFolder: async () => { throw new Error("not a rename"); },
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

describe("naming a new Folder", () => {
  it("accepts a plain name that no sibling uses, ignoring surrounding spaces", () => {
    expect(folderNameProblem("grandparents", ["kids", "a.jpg"])).toBeNull();
    expect(folderNameProblem("  summer 2024 ", [])).toBeNull();
  });

  it("rejects empty, protected, Windows-invalid and taken names with a reason", () => {
    for (const name of ["", "   ", ".", "..", ".hidden", "Exports", "a/b", "a\\b", "what?", "a:b", "x<y", "pipe|", "star*", "quote\"", "CON", "lpt1", "com¹", "nul.txt", "trailing.", "tab\tname"]) {
      expect(folderNameProblem(name, []), name).toMatch(/\S/);
    }
    expect(folderNameProblem("Kids", ["kids"])).toMatch(/already/);
  });
});

describe("renaming a Folder", () => {
  function fakeLibrary(albums: Record<string, string>, namesInParent: string[]) {
    const renamed: { rename: FolderRename; albums: AlbumRewrite[] }[] = [];
    const ports: SortingPorts = {
      folderNames: async () => namesInParent,
      rootAlbums: async () => Object.entries(albums).map(([name, json]) => ({ name, json })),
      movePhotos: async () => { throw new Error("not a move"); },
      copyPhotos: async () => { throw new Error("not a copy"); },
      renameFolder: async (_root, rename, rewrites) => { renamed.push({ rename, albums: rewrites }); },
    };
    return { ports, renamed };
  }

  it("points Placements of every Photo under the Folder at its new name", () => {
    const album = albumWith("2024/trips/a.jpg", "2024/trips/kids/b.jpg", "2024/trips-old/c.jpg", "2024/d.jpg");
    const relinked = relinkPlacements(album, { from: "2024/trips", to: "2024/travels" });
    expect(relinked.pages[0].slots.map((slot) => slot.type === "photo" ? slot.placement?.photoPath : null))
      .toEqual(["2024/travels/a.jpg", "2024/travels/kids/b.jpg", "2024/trips-old/c.jpg", "2024/d.jpg"]);
    expect(relinkPlacements(album, { from: "pets", to: "animals" })).toBe(album);
  });

  it("renames the Folder and rewrites every root Album that places a Photo under it, taking the open Album from memory", async () => {
    const onDisk = albumWith("2024/trips/a.jpg");
    const unsaved = addPhotoSlot(onDisk, "page-2");
    const other = albumWith("2024/trips/kids/b.jpg");
    const library = fakeLibrary({
      "Christmas.phalbum": serializeAlbum(onDisk),
      "Summer.phalbum": serializeAlbum(other),
      "Easter.phalbum": serializeAlbum(albumWith("b.jpg")),
    }, ["trips", "pets"]);

    const result = await renameFolder(library.ports, {
      root: "D:\\Photos", folder: "2024/trips", name: " travels ", openAlbum: { name: "Christmas.phalbum", album: unsaved },
    });

    const rename = { from: "2024/trips", to: "2024/travels" };
    expect(result).toEqual({ rename, openAlbum: relinkPlacements(unsaved, rename) });
    expect(library.renamed).toEqual([{
      rename,
      albums: [
        { name: "Christmas.phalbum", original: serializeAlbum(onDisk), updated: serializeAlbum(relinkPlacements(unsaved, rename)) },
        { name: "Summer.phalbum", original: serializeAlbum(other), updated: serializeAlbum(relinkPlacements(other, rename)) },
      ],
    }]);
  });

  it("allows changing only the case of the name", async () => {
    const library = fakeLibrary({}, ["trips"]);
    await renameFolder(library.ports, { root: "D:\\Photos", folder: "trips", name: "Trips", openAlbum: null });
    expect(library.renamed[0].rename).toEqual({ from: "trips", to: "Trips" });
  });

  it.each([
    ["", "new", /Library/],
    [".git", "git", /can't be renamed/],
    ["Exports", "Out", /can't be renamed/],
    ["trips/.cache", "cache", /can't be renamed/],
    ["trips", "Pets", /already/],
    ["trips", "trips", /already called/],
    ["trips", "a:b", /can't contain/],
    ["trips", "CON", /reserved/],
  ])("refuses to rename %j to %j", async (folder, name, problem) => {
    const library = fakeLibrary({}, ["trips", "pets"]);
    await expect(renameFolder(library.ports, { root: "D:\\Photos", folder, name, openAlbum: null })).rejects.toThrow(problem);
    expect(library.renamed).toEqual([]);
  });
});

describe("scanAfterMove", () => {
  const scanned = (path: string, captureDate: number) => ({ ...photo(path), captureDate, revision: `old:${path}` });

  it("swaps moved Photos for their new records, in capture-date then path order, keeping the rest as they were", () => {
    const early = scanned("trips/early.jpg", 1000);
    const later = scanned("later.jpg", 3000);
    const scan = {
      photos: [early, scanned("trips/a.jpg", 2000), scanned("trips/b.jpg", 2000), later],
      folders: ["kids", "trips"],
      warnings: ["bad.jpg: invalid JPEG"],
    };
    const moves = [{ from: "trips/a.jpg", to: "kids/a.jpg" }, { from: "trips/b.jpg", to: "kids/b (2).jpg" }];
    const moved = [{ ...scanned("kids/b (2).jpg", 2000), revision: "new:b" }, { ...scanned("kids/a.jpg", 2000), revision: "new:a" }];

    const next = scanAfterMove(scan, moves, moved);

    expect(next.photos.map(({ path, revision }) => `${path} ${revision}`)).toEqual([
      "trips/early.jpg old:trips/early.jpg",
      "kids/a.jpg new:a",
      "kids/b (2).jpg new:b",
      "later.jpg old:later.jpg",
    ]);
    expect(next.photos[0]).toBe(early);
    expect(next.photos[3]).toBe(later);
    expect(next.folders).toEqual(["kids", "trips"]);
    expect(next.warnings).toEqual(["bad.jpg: invalid JPEG"]);
    expect(scan.photos.map(({ path }) => path)).toEqual(["trips/early.jpg", "trips/a.jpg", "trips/b.jpg", "later.jpg"]);
  });

  it("orders paths with the same capture date by code point, as the Rust scan does", () => {
    const scan = { photos: [scanned("\u{1F600}.jpg", 1000)], folders: [], warnings: [] };
    const next = scanAfterMove(scan, [{ from: "a/\uFF5E.jpg", to: "\uFF5E.jpg" }], [scanned("\uFF5E.jpg", 1000)]);
    expect(next.photos.map(({ path }) => path)).toEqual(["\uFF5E.jpg", "\u{1F600}.jpg"]);
  });
});
