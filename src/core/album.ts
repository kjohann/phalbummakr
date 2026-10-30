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
  slots: [];
}

export interface Album {
  schemaVersion: 1;
  name: string;
  pageFormat: PageFormat;
  startingSide: "left" | "right";
  pages: Page[];
}

export interface AlbumOptions {
  name: string;
  pageCount?: number;
  startingSide?: Album["startingSide"];
  bleedMm?: number;
  safeZoneMm?: number;
  dpi?: number;
}

export function pageDimensions(format: PageFormat): { widthMm: number; heightMm: number } {
  const dimensions = { A4: { widthMm: 297, heightMm: 210 } };
  return { ...dimensions[format.size] };
}

export function createAlbum(options: AlbumOptions): Album {
  const pageCount = options.pageCount ?? 24;
  validatePageCount(pageCount);
  const album: Album = {
    schemaVersion: 1,
    name: options.name.trim(),
    pageFormat: {
      size: "A4",
      orientation: "landscape",
      bleedMm: options.bleedMm ?? 3,
      safeZoneMm: options.safeZoneMm ?? 5,
      dpi: options.dpi ?? 300,
    },
    startingSide: options.startingSide ?? "right",
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
  return album;
}

function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validatePageCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 10000) {
    throw new Error("Page count must be a whole number between 1 and 10000.");
  }
}

function validateAlbum(value: unknown): asserts value is Album {
  if (!record(value, ["schemaVersion", "name", "pageFormat", "startingSide", "pages"]) || value.schemaVersion !== 1) {
    throw new Error("Unsupported or invalid Album schema.");
  }
  if (typeof value.name !== "string" || value.name !== value.name.trim() || !value.name
    || value.name.length > 100 || /[<>:"/\\|?*]/.test(value.name)
    || [...value.name].some((character) => character.charCodeAt(0) < 32)
    || /[. ]$/.test(value.name) || /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\.|$)/i.test(value.name)) {
    throw new Error("Album name must be 1-100 characters and a valid filename (not a reserved name).");
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
  if (value.startingSide !== "left" && value.startingSide !== "right") {
    throw new Error("Starting side must be left or right.");
  }
  if (!Array.isArray(value.pages)) throw new Error("Album Pages must be an array.");
  validatePageCount(value.pages.length);
  const ids = new Set<string>();
  for (const page of value.pages) {
    if (!record(page, ["id", "background", "slots"]) || typeof page.id !== "string" || !page.id
      || ids.has(page.id) || page.background !== "#ffffff" || !Array.isArray(page.slots) || page.slots.length !== 0) {
      throw new Error("Invalid or unsupported Page content.");
    }
    ids.add(page.id);
  }
}

export interface AlbumPorts {
  list(root: string): Promise<string[]>;
  read(root: string, name: string): Promise<string>;
  write(root: string, name: string, json: string, create: boolean): Promise<void>;
}
