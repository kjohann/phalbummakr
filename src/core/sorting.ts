import { deserializeAlbum, serializeAlbum, type Album } from "./album";
import type { Photo, PhotoScan } from "./photos";
/** A Photo file moved from one Library-relative path to another. */
export interface PhotoMove {
  from: string;
  to: string;
}

export type PhotoCopy = PhotoMove;

/** A Folder renamed, with everything under it, from one Library-relative path to another. */
export interface FolderRename {
  from: string;
  to: string;
}

/** Where `path` is after `rename`, or undefined if it is neither the Folder nor under it. */
export function renamedPath(path: string, { from, to }: FolderRename): string | undefined {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : undefined;
}

/** Where placed Photos went: moved one by one, or with their Folder when it was renamed. */
export type PlacementRelink = readonly PhotoMove[] | FolderRename;

/** Points Placements of moved Photos at their new paths; returns `album` itself when none moved. */
export function relinkPlacements(album: Album, relink: PlacementRelink): Album {
  let destination: (path: string) => string | undefined;
  if ("from" in relink) destination = (path) => renamedPath(path, relink);
  else {
    const destinations = new Map(relink.map(({ from, to }) => [from, to]));
    destination = (path) => destinations.get(path);
  }
  let changed = false;
  const pages = album.pages.map((page) => {
    let pageChanged = false;
    const slots = page.slots.map((slot) => {
      const to = slot.type === "photo" && slot.placement ? destination(slot.placement.photoPath) : undefined;
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

/** Code-point order, which is the byte order the Rust scan sorts paths in. */
function comparePaths(a: string, b: string): number {
  for (let index = 0; ; index++) {
    if (index === a.length || index === b.length) return a.length - b.length;
    // At the first difference, a surrogate pair is read as one code point.
    if (a[index] !== b[index]) return a.codePointAt(index)! - b.codePointAt(index)!;
  }
}

/**
 * The scan after `moves`, without scanning the Library again: moved Photos are replaced by
 * `moved`, their records read at the new paths. Photos are kept in the scan's order, oldest
 * first and then by path.
 */
export function scanAfterMove(scan: PhotoScan, moves: readonly PhotoMove[], moved: readonly Photo[]): PhotoScan {
  const from = new Set(moves.map((move) => move.from));
  const photos = [...scan.photos.filter((photo) => !from.has(photo.path)), ...moved]
    .sort((a, b) => a.captureDate - b.captureDate || comparePaths(a.path, b.path));
  return { ...scan, photos };
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The Folder holding path ("" is the Library root). */
export function parentFolder(path: string): string {
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

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/**
 * Why `name` can't be used for a new Folder next to `siblings` (the names already in its parent),
 * or null if it can. Surrounding spaces are ignored, as the Folder is created with the trimmed name.
 */
export function folderNameProblem(name: string, siblings: readonly string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name for the Folder.";
  // eslint-disable-next-line no-control-regex
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)) return 'Folder names can\'t contain < > : " / \\ | ? * or control characters.';
  if (trimmed.startsWith(".")) return "Folder names can't start with a dot.";
  if (trimmed.endsWith(".")) return "Folder names can't end with a dot.";
  if (RESERVED_WINDOWS_NAMES.test(trimmed)) return `"${trimmed}" is reserved by Windows.`;
  if (isProtectedFolder(trimmed)) return `"${trimmed}" is kept for the app's own files.`;
  if (siblings.some((sibling) => sibling.toLowerCase() === trimmed.toLowerCase())) {
    return `Something named "${trimmed}" is already there.`;
  }
  return null;
}

/**
 * Why `folder` can't be renamed to `name` next to `siblings` (the names in its parent, its own
 * included), or null if it can. The Library root and protected Folders are never renamed.
 */
export function folderRenameProblem(folder: string, name: string, siblings: readonly string[]): string | null {
  if (folder === "") return "The Library itself can't be renamed.";
  if (isProtectedFolder(folder)) return `The Folder "${folder}" can't be renamed.`;
  const current = fileName(folder);
  if (name.trim() === current) return `The Folder is already called "${current}".`;
  // Changing only the case of the name is allowed, so the Folder's own name doesn't count as taken.
  return folderNameProblem(name, siblings.filter((sibling) => sibling.toLowerCase() !== current.toLowerCase()));
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
  /** Copies the Photo files as one batch without changing originals or Albums. */
  copyPhotos(root: string, copies: PhotoCopy[]): Promise<void>;
  /** Renames the Folder and rewrites the Albums together: if any step fails, nothing changes. */
  renameFolder(root: string, rename: FolderRename, albums: AlbumRewrite[]): Promise<void>;
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
  const { albums, relinkedOpen } = await albumRewrites(ports, root, openAlbum, moves);
  await ports.movePhotos(root, moves, albums);
  return { moves, openAlbum: relinkedOpen };
}

export async function copyPhotosToFolder(
  ports: Pick<SortingPorts, "folderNames" | "copyPhotos">,
  { root, photos, target }: Pick<SendPhotosRequest, "root" | "photos" | "target">,
): Promise<PhotoCopy[]> {
  const copies = planPhotoMove(photos, target, await ports.folderNames(root, target));
  if (copies.length > 0) await ports.copyPhotos(root, copies);
  return copies;
}

export interface RenameFolderRequest {
  root: string;
  /** The Library-relative path of the Folder to rename. */
  folder: string;
  /** The new name; surrounding spaces are ignored. */
  name: string;
  /** The Album being edited, which may have changes not yet saved to its file. */
  openAlbum: { name: string; album: Album } | null;
}

/**
 * Renames a Folder, with everything under it, and keeps every Album directly in the Library root
 * pointing at its Photos. Returns the rename and the open Album relinked, or null if it was unaffected.
 */
export async function renameFolder(ports: SortingPorts, request: RenameFolderRequest): Promise<{ rename: FolderRename; openAlbum: Album | null }> {
  const { root, folder, name, openAlbum } = request;
  const parent = parentFolder(folder);
  const problem = folderRenameProblem(folder, name, folder ? await ports.folderNames(root, parent) : []);
  if (problem) throw new Error(problem);
  const trimmed = name.trim();
  const rename = { from: folder, to: parent ? `${parent}/${trimmed}` : trimmed };
  const { albums, relinkedOpen } = await albumRewrites(ports, root, openAlbum, rename);
  await ports.renameFolder(root, rename, albums);
  return { rename, openAlbum: relinkedOpen };
}

/**
 * The Albums in the Library root that `relink` changes, taking the open Album from memory.
 * Throws before anything is changed if an Album can't be read.
 */
async function albumRewrites(ports: SortingPorts, root: string, openAlbum: SendPhotosRequest["openAlbum"], relink: PlacementRelink) {
  const files = await ports.rootAlbums(root);
  const openFile = openAlbum && (files.find((file) => file.name === openAlbum.name)
    ?? files.find((file) => file.name.toLowerCase() === openAlbum.name.toLowerCase()));
  const relinkedOpen = openAlbum && relinkPlacements(openAlbum.album, relink);
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
    const relinked = relinkPlacements(album, relink);
    if (relinked !== album) albums.push({ name: file.name, original: file.json, updated: serializeAlbum(relinked) });
  }
  return { albums, relinkedOpen: openChanged ? relinkedOpen : null };
}
