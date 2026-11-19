import { deserializeAlbum, serializeAlbum, type Album } from "./album";
/** A Photo file moved from one Library-relative path to another. */
export interface PhotoMove {
  from: string;
  to: string;
}

/** Points Placements of moved Photos at their new paths; returns `album` itself when none moved. */
export function relinkPlacements(album: Album, moves: readonly PhotoMove[]): Album {
  const destinations = new Map(moves.map(({ from, to }) => [from, to]));
  let changed = false;
  const pages = album.pages.map((page) => {
    let pageChanged = false;
    const slots = page.slots.map((slot) => {
      const to = slot.type === "photo" && slot.placement ? destinations.get(slot.placement.photoPath) : undefined;
      if (to === undefined || slot.type !== "photo" || !slot.placement) return slot;
      pageChanged = true;
      return { ...slot, placement: { ...slot.placement, photoPath: to } };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, slots };
  });
  return changed ? { ...album, pages } : album;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function parentFolder(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

/**
 * Whether Photos can never be sent to `folder`: app data, Exports and dot-folders anywhere, which
 * the Photo scan hides, or a path that isn't a plain Folder under the Library root.
 */
export function isProtectedFolder(folder: string): boolean {
  if (folder === "") return false;
  return folder.split("/").some((name) => name === "" || name.includes("\\") || name.startsWith(".")
    || name.toLowerCase() === "exports");
}

/**
 * Plans sending Photos to `target`, a Folder relative to the Library root ("" is the root).
 * `namesInTarget` lists every file and folder name already in the target. Photos already
 * in the target stay where they are; clashing names get a suffix, as in "IMG_0012 (2).jpg".
 */
export function planPhotoMove(photos: readonly string[], target: string, namesInTarget: readonly string[]): PhotoMove[] {
  if (isProtectedFolder(target)) throw new Error(`Photos can't be sent to the Folder "${target}".`);
  // Windows and macOS file systems ignore case, so "a.jpg" and "A.JPG" clash.
  const taken = new Set(namesInTarget.map((name) => name.toLowerCase()));
  return photos.filter((from) => parentFolder(from) !== target).map((from) => {
    const name = freeName(fileName(from), taken);
    taken.add(name.toLowerCase());
    return { from, to: target ? `${target}/${name}` : name };
  });
}

function freeName(name: string, taken: ReadonlySet<string>): string {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let number = 2; taken.has(candidate.toLowerCase()); number++) candidate = `${stem} (${number})${extension}`;
  return candidate;
}

/** An Album file directly in the Library root, rewritten with the moved Photos' new paths. */
export interface AlbumRewrite {
  /** The file name, such as "Christmas.phalbum". */
  name: string;
  /** The file's contents when it was read; the move is cancelled if the file changed since. */
  original: string;
  updated: string;
}

export interface SortingPorts {
  /** The names of every file and folder directly in `folder` ("" is the Library root). */
  folderNames(root: string, folder: string): Promise<string[]>;
  /** Every Album file directly in the Library root, by file name. */
  rootAlbums(root: string): Promise<{ name: string; json: string }[]>;
  /** Moves the Photo files and rewrites the Albums together: if any step fails, nothing changes. */
  movePhotos(root: string, moves: PhotoMove[], albums: AlbumRewrite[]): Promise<void>;
}

export interface SendPhotosRequest {
  root: string;
  photos: readonly string[];
  target: string;
  /** The Album being edited, which may have changes not yet saved to its file. */
  openAlbum: { name: string; album: Album } | null;
}

/**
 * Sends Photos to a Folder and keeps every Album directly in the Library root pointing at them.
 * Returns the moves made and the open Album with its Placements relinked, or null if it was unaffected.
 */
export async function sendPhotosToFolder(ports: SortingPorts, request: SendPhotosRequest): Promise<{ moves: PhotoMove[]; openAlbum: Album | null }> {
  const { root, photos, target, openAlbum } = request;
  const moves = planPhotoMove(photos, target, await ports.folderNames(root, target));
  if (moves.length === 0) return { moves, openAlbum: null };
  const files = await ports.rootAlbums(root);
  const openFile = openAlbum && (files.find((file) => file.name === openAlbum.name)
    ?? files.find((file) => file.name.toLowerCase() === openAlbum.name.toLowerCase()));
  const relinkedOpen = openAlbum && relinkPlacements(openAlbum.album, moves);
  const openChanged = relinkedOpen !== null && relinkedOpen !== openAlbum?.album;
  if (openChanged && !openFile) throw new Error(`Could not find the open Album "${openAlbum!.name}" in the Library.`);
  const albums: AlbumRewrite[] = [];
  for (const file of files) {
    if (file === openFile) {
      if (openChanged) albums.push({ name: file.name, original: file.json, updated: serializeAlbum(relinkedOpen) });
      continue;
    }
    let album: Album;
    try {
      album = deserializeAlbum(file.json);
    } catch (cause) {
      throw new Error(`Could not update the Album "${file.name}": ${String(cause)}`);
    }
    const relinked = relinkPlacements(album, moves);
    if (relinked !== album) albums.push({ name: file.name, original: file.json, updated: serializeAlbum(relinked) });
  }
  await ports.movePhotos(root, moves, albums);
  return { moves, openAlbum: openChanged ? relinkedOpen : null };
}
