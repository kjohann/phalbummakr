import { validateSlots, type Slot } from "./slots";

export interface PageFormat {
  size: "A4";
  orientation: "landscape";
  bleedMm: number;
  safeZoneMm: number;
  dpi: number;
}

export interface Page {
  id: string;
  background: "#ffffff";
  slots: Slot[];
}

export interface Album {
  schemaVersion: 2;
  title: string;
  pageFormat: PageFormat;
  pages: Page[];
}

export interface AlbumOptions {
  name: string;
  pageCount?: number;
  bleedMm?: number;
  safeZoneMm?: number;
  dpi?: number;
}

export interface Spread {
  left: Page | null;
  right: Page | null;
}

export function albumSpreads(album: Album): Spread[] {
  const spreads: Spread[] = [{ left: null, right: album.pages[0] }];
  for (let index = 1; index < album.pages.length; index += 2) {
    spreads.push({ left: album.pages[index], right: album.pages[index + 1] ?? null });
  }
  return spreads;
}

function pageIndex(album: Album, id: string): number {
  const index = album.pages.findIndex((page) => page.id === id);
  if (index === -1) throw new Error("Page not found in Album.");
  return index;
}

function unusedPageId(album: Album): string {
  const ids = new Set(album.pages.map((page) => page.id));
  let number = 1;
  while (ids.has(`page-${number}`)) number += 1;
  return `page-${number}`;
}

function spreadInsertionIndex(index: number, pageCount: number): number {
  return Math.min(index + (index % 2 === 1 ? 2 : 1), pageCount - 1);
}

export function addPage(album: Album, afterId: string): Album {
  const index = pageIndex(album, afterId);
  validatePageCount(album.pages.length + 2);
  const pages = [...album.pages];
  const first: Page = { id: unusedPageId(album), background: "#ffffff", slots: [] };
  const second: Page = { id: unusedPageId({ ...album, pages: [...pages, first] }), background: "#ffffff", slots: [] };
  const insertion = spreadInsertionIndex(index, pages.length);
  pages.splice(insertion, 0, first, second);
  return { ...album, pages };
}

export function duplicatePage(album: Album, id: string): Album {
  const index = pageIndex(album, id);
  const added = addPage(album, id);
  const insertion = spreadInsertionIndex(index, album.pages.length);
  const copyIndex = insertion + (index % 2 === 0 && index !== album.pages.length - 1 ? 1 : 0);
  const pages = [...added.pages];
  pages[copyIndex] = { ...structuredClone(album.pages[index]), id: pages[copyIndex].id };
  return { ...added, pages };
}

export function deletePage(album: Album, id: string): Album {
  const index = pageIndex(album, id);
  const pages = [...album.pages];
  if (index === 0 || index === pages.length - 1) {
    pages[index] = { ...pages[index], slots: [] };
  } else {
    pages.splice(index % 2 === 1 ? index : index - 1, 2);
  }
  return { ...album, pages };
}

export function movePage(album: Album, id: string, toIndex: number): Album {
  const index = pageIndex(album, id);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= album.pages.length) {
    throw new Error("Page position must be within the Album.");
  }
  const pages = [...album.pages];
  const [page] = pages.splice(index, 1);
  pages.splice(toIndex, 0, page);
  return { ...album, pages };
}

export function pageDimensions(format: PageFormat): { widthMm: number; heightMm: number } {
  const dimensions = { A4: { widthMm: 297, heightMm: 210 } };
  return { ...dimensions[format.size] };
}

export function createAlbum(options: AlbumOptions): Album {
  const pageCount = options.pageCount ?? 2;
  validatePageCount(pageCount);
  const album: Album = {
    schemaVersion: 2,
    title: options.name,
    pageFormat: {
      size: "A4",
      orientation: "landscape",
      bleedMm: options.bleedMm ?? 3,
      safeZoneMm: options.safeZoneMm ?? 5,
      dpi: options.dpi ?? 300,
    },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index + 1}`,
      background: "#ffffff",
      slots: [],
    })),
  };
  validateAlbum(album);
  return album;
}

export function serializeAlbum(album: Album): string {
  validateAlbum(album);
  return JSON.stringify(album, null, 2);
}

export function deserializeAlbum(json: string): Album {
  const album: unknown = JSON.parse(json);
  validateAlbum(album);
  for (const page of album.pages) {
    for (const slot of page.slots) {
      if (slot.placement) slot.placement.fit ??= false;
      if (slot.type === "text") slot.style.underline ??= false;
    }
  }
  return album;
}

function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validatePageCount(count: number): void {
  if (!Number.isInteger(count) || count < 2 || count > 10000 || count % 2 !== 0) {
    throw new Error("Page count must be an even number between 2 and 10000.");
  }
}

function validateAlbum(value: unknown): asserts value is Album {
  if (record(value, ["schemaVersion", "title", "pageFormat", "startingSide", "pages"])
    && value.schemaVersion === 2 && Array.isArray(value.pages)) {
    validatePageCount(value.pages.length);
  }
  if (!record(value, ["schemaVersion", "title", "pageFormat", "pages"]) || value.schemaVersion !== 2) {
    throw new Error("Unsupported or invalid Album schema.");
  }
  if (typeof value.title !== "string") {
    throw new Error("Album title must be text.");
  }
  const format = value.pageFormat;
  if (!record(format, ["size", "orientation", "bleedMm", "safeZoneMm", "dpi"])
    || format.size !== "A4" || format.orientation !== "landscape") {
    throw new Error("Only A4 landscape Page Format is supported.");
  }
  for (const [label, number, limit] of [
    ["Bleed", format.bleedMm, Infinity],
    ["Safe Zone", format.safeZoneMm, 105],
    ["Export resolution", format.dpi, Infinity],
  ] as const) {
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number >= limit
      || (label === "Export resolution" && number === 0)) {
      throw new Error(`${label} is invalid${label === "Safe Zone" ? " (must be less than 105 mm)" : ""}.`);
    }
  }
  if (!Array.isArray(value.pages)) throw new Error("Album Pages must be an array.");
  validatePageCount(value.pages.length);
  const ids = new Set<string>();
  for (const page of value.pages) {
    if (!record(page, ["id", "background", "slots"]) || typeof page.id !== "string" || !page.id
      || ids.has(page.id) || page.background !== "#ffffff") {
      throw new Error("Invalid or unsupported Page content.");
    }
    validateSlots(page.slots);
    ids.add(page.id);
  }
}

export interface AlbumPorts {
  list(root: string): Promise<string[]>;
  read(root: string, name: string): Promise<string>;
  write(root: string, name: string, json: string, create: boolean): Promise<void>;
}
