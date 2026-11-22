import { DEFAULT_BLEED_MM, DEFAULT_SAFE_ZONE_MM, pageDimensions, type Album, type PageFormat } from "./album";
import {
  DEFAULT_PLACEHOLDER, POINTS_PER_MM, refitPlacement, TEXT_LINE_HEIGHT, validateSlots,
  type PhotoSlot, type Placement, type Slot, type TextSlot, type TextStyle,
} from "./slots";

/** A Slot in a Layout. It never holds content: Photo Slots are empty and Text Slots carry only a style. */
export type LayoutSlot = (PhotoSlot & { placement: null }) | (TextSlot & { text: "" });

/** A reusable arrangement of Slots on a single Page. Layouts have no names: their preview identifies them. */
export interface Layout {
  id: string;
  /** Width divided by height of the trim Page of the canvas the Layout was made on. */
  aspectRatio: number;
  slots: LayoutSlot[];
}

export interface LayoutLibrary {
  schemaVersion: 2;
  layouts: Layout[];
}

type StoredLayoutLibrary = LayoutLibrary | { schemaVersion: 1; layouts: Layout[] };

export function pageAspectRatio(format: PageFormat): number {
  const { widthMm, heightMm } = pageDimensions(format);
  return widthMm / heightMm;
}

export function madeForOtherAspectRatio(layout: Layout, format: PageFormat): boolean {
  return Math.abs(layout.aspectRatio - pageAspectRatio(format)) > 1e-3;
}

function layoutIndex(library: LayoutLibrary, id: string): number {
  const index = library.layouts.findIndex((layout) => layout.id === id);
  if (index === -1) throw new Error("Layout not found in the Layout Library.");
  return index;
}

function newLayoutId(): string {
  return `layout-${crypto.randomUUID()}`;
}

const LAYOUT_MIN_INSET_MM = 15;
const LAYOUT_GAP_MM = 6;

function photoGrid(columns: number, rows: number, bounds: { x: number; y: number; width: number; height: number }, gap: number,
  photo: (x: number, y: number, width: number, height: number) => LayoutSlot): LayoutSlot[] {
  const columnWidth = (bounds.width - (columns - 1) * gap) / columns;
  const rowHeight = (bounds.height - (rows - 1) * gap) / rows;
  return Array.from({ length: rows * columns }, (_, index) => photo(
    bounds.x + (index % columns) * (columnWidth + gap), bounds.y + Math.floor(index / columns) * (rowHeight + gap), columnWidth, rowHeight,
  ));
}

export function gridLayoutProblem(format: PageFormat, columns: number, rows: number): string | null {
  if (![columns, rows].every((value) => Number.isInteger(value) && value >= 1 && value <= 12)) {
    return "Columns and rows must be whole numbers from 1 to 12.";
  }
  const { widthMm, heightMm } = pageDimensions(format);
  const inset = Math.max(LAYOUT_MIN_INSET_MM, format.safeZoneMm);
  if (widthMm - 2 * inset - (columns - 1) * LAYOUT_GAP_MM <= 0
    || heightMm - 2 * inset - (rows - 1) * LAYOUT_GAP_MM <= 0) {
    return "These dimensions leave no positive Slot width or height on this Page Format.";
  }
  return null;
}

/** Makes an editable Layout of equal Photo Slots for the open Album's Page Format. */
export function createGridLayout(format: PageFormat, columns: number, rows: number): Layout {
  const problem = gridLayoutProblem(format, columns, rows);
  if (problem) throw new Error(problem);
  const { widthMm, heightMm } = pageDimensions(format);
  const inset = Math.max(LAYOUT_MIN_INSET_MM, format.safeZoneMm);
  let slotNumber = 0;
  const slots = photoGrid(columns, rows, {
    x: inset, y: inset, width: widthMm - 2 * inset, height: heightMm - 2 * inset,
  }, LAYOUT_GAP_MM, (x, y, width, height) => ({
    id: `slot-${++slotNumber}`, type: "photo", x: x / widthMm, y: y / heightMm,
    width: width / widthMm, height: height / heightMm, placement: null,
  }));
  return { id: newLayoutId(), aspectRatio: pageAspectRatio(format), slots };
}

export function newLayout(library: LayoutLibrary, aspectRatio: number): { library: LayoutLibrary; id: string } {
  const id = newLayoutId();
  return { library: { ...library, layouts: [...library.layouts, { id, aspectRatio, slots: [] }] }, id };
}

export function duplicateLayout(library: LayoutLibrary, id: string): { library: LayoutLibrary; id: string } {
  const index = layoutIndex(library, id);
  const copy = { ...structuredClone(library.layouts[index]), id: newLayoutId() };
  const layouts = [...library.layouts];
  layouts.splice(index + 1, 0, copy);
  return { library: { ...library, layouts }, id: copy.id };
}

export function deleteLayout(library: LayoutLibrary, id: string): LayoutLibrary {
  const index = layoutIndex(library, id);
  return { ...library, layouts: library.layouts.filter((_, other) => other !== index) };
}

/** Strips content, so editing a Layout as if it were a Page never stores Photos or text in it. */
function layoutSlots(slots: Slot[]): LayoutSlot[] {
  return slots.map((slot) => slot.type === "photo"
    ? { ...slot, placement: null }
    : { ...slot, text: "", style: { ...slot.style } });
}

/** Stores edited Slots; the Layout is then made for the aspect ratio of the canvas they were edited on. */
export function setLayoutSlots(library: LayoutLibrary, id: string, slots: Slot[], aspectRatio: number): LayoutLibrary {
  const index = layoutIndex(library, id);
  const layouts = [...library.layouts];
  layouts[index] = { ...layouts[index], aspectRatio, slots: layoutSlots(slots) };
  return { ...library, layouts };
}

/** Adds a new Layout at the end with a copy of a Page's Slots, keeping their geometry and styles but not their content. */
export function saveLayoutFromPage(library: LayoutLibrary, album: Album, pageId: string): { library: LayoutLibrary; id: string } {
  const page = album.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found in Album.");
  const id = newLayoutId();
  const layout: Layout = { id, aspectRatio: pageAspectRatio(album.pageFormat), slots: layoutSlots(structuredClone(page.slots)) };
  return { library: { ...library, layouts: [...library.layouts, layout] }, id };
}

export interface AppliedLayout {
  album: Album;
  /** Content that did not fit into the Layout's Slots, in Page order. */
  dropped: { placements: Placement[]; texts: string[] };
  /** True when the Layout was made on a canvas with another aspect ratio than the Album's Pages. */
  aspectMismatch: boolean;
}

/**
 * Replaces a Page's Slots with a copy of a Layout's. Placements and text move into the new Slots in Page order,
 * each Photo refitted to its new Slot's orientation; whatever does not fit is reported as dropped.
 */
export function applyLayout(album: Album, pageId: string, layout: Layout): AppliedLayout {
  const index = album.pages.findIndex((page) => page.id === pageId);
  if (index === -1) throw new Error("Page not found in Album.");
  const page = album.pages[index];
  const photos = page.slots.filter((slot): slot is PhotoSlot & { placement: Placement } => slot.type === "photo" && slot.placement !== null);
  const texts = page.slots.flatMap((slot) => slot.type === "text" && slot.text.trim() !== "" ? [slot.text] : []);
  let photoIndex = 0;
  let textIndex = 0;
  const slots: Slot[] = structuredClone(layout.slots).map((slot) => {
    if (slot.type === "text") return { ...slot, text: texts[textIndex++] ?? "" };
    const source = photos[photoIndex++];
    return source ? { ...slot, placement: refitPlacement(album, source.placement, source, slot) } : slot;
  });
  const pages = [...album.pages];
  pages[index] = { ...page, slots };
  return {
    album: { ...album, pages },
    dropped: { placements: photos.slice(photoIndex).map((slot) => slot.placement), texts: texts.slice(textIndex) },
    aspectMismatch: madeForOtherAspectRatio(layout, album.pageFormat),
  };
}

export function serializeLayoutLibrary(library: LayoutLibrary): string {
  validateLayoutLibrary(library);
  if (library.schemaVersion !== 2) throw new Error("Unsupported or invalid Layout Library schema.");
  return JSON.stringify(library, null, 2);
}

/** Reads the Library's Layout Library; `null` means none was saved yet, so the predefined Layouts are seeded. */
export function readLayoutLibrary(json: string | null, format: PageFormat): LayoutLibrary {
  return loadLayoutLibrary(json, format).library;
}

/** Reports whether a saved Library was upgraded and needs to be written back. */
export function loadLayoutLibrary(json: string | null, format: PageFormat): { library: LayoutLibrary; migrated: boolean } {
  if (json === null) return { library: predefinedLayoutLibrary(format), migrated: false };
  const library: unknown = JSON.parse(json);
  validateLayoutLibrary(library);
  for (const layout of library.layouts) {
    for (const slot of layout.slots) if (slot.type === "text") slot.placeholder ??= DEFAULT_PLACEHOLDER;
  }
  if (library.schemaVersion === 2) return { library, migrated: false };
  const ids = new Set(library.layouts.map((layout) => layout.id));
  const mosaics = starterLayouts(format).mosaics.map((layout) => {
    let id = layout.id;
    while (ids.has(id)) id = newLayoutId();
    ids.add(id);
    return { ...layout, id };
  });
  return { library: { schemaVersion: 2, layouts: [...library.layouts, ...mosaics] }, migrated: true };
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validateLayoutLibrary(value: unknown): asserts value is StoredLayoutLibrary {
  if (!exactRecord(value, ["schemaVersion", "layouts"]) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    || !Array.isArray(value.layouts)) {
    throw new Error("Unsupported or invalid Layout Library schema.");
  }
  const ids = new Set<string>();
  for (const layout of value.layouts) {
    if (!exactRecord(layout, ["id", "aspectRatio", "slots"]) || typeof layout.id !== "string" || !layout.id
      || ids.has(layout.id) || typeof layout.aspectRatio !== "number" || !Number.isFinite(layout.aspectRatio)
      || layout.aspectRatio <= 0) {
      throw new Error("Invalid Layout.");
    }
    validateSlots(layout.slots);
    if (layout.slots.some((slot) => slot.type === "photo" ? slot.placement !== null : slot.text !== "")) {
      throw new Error("A Layout cannot hold Photos or text.");
    }
    ids.add(layout.id);
  }
}

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Arial", fontSize: 18, color: "#000000", bold: false, italic: false, underline: false, align: "center",
};

function starterLayouts(format: PageFormat): { retained: Layout[]; mosaics: Layout[] } {
  const { widthMm, heightMm } = pageDimensions(format);
  const inset = Math.max(LAYOUT_MIN_INSET_MM, DEFAULT_SAFE_ZONE_MM);
  const gap = LAYOUT_GAP_MM;
  const left = inset;
  const top = inset;
  const contentWidth = widthMm - 2 * inset;
  const contentHeight = heightMm - 2 * inset;
  let slotNumber = 0;
  const photo = (x: number, y: number, width: number, height: number): LayoutSlot => ({
    id: `slot-${++slotNumber}`, type: "photo",
    x: x / widthMm, y: y / heightMm, width: width / widthMm, height: height / heightMm, placement: null,
  });
  const text = (x: number, y: number, width: number, fontSize: number): LayoutSlot => ({
    id: `slot-${++slotNumber}`, type: "text",
    x: x / widthMm, y: y / heightMm, width: width / widthMm,
    height: fontSize * TEXT_LINE_HEIGHT / POINTS_PER_MM / heightMm,
    text: "", placeholder: DEFAULT_PLACEHOLDER, style: { ...DEFAULT_TEXT_STYLE, fontSize },
  });
  const grid = (rows: number, columns: number, x = left, y = top, width = contentWidth, height = contentHeight) =>
    photoGrid(columns, rows, { x, y, width, height }, gap, photo);
  const largeWidth = (contentWidth - gap) * 0.6;
  const captionHeight = 18 * TEXT_LINE_HEIGHT / POINTS_PER_MM;
  const titleHeight = 36 * TEXT_LINE_HEIGHT / POINTS_PER_MM;
  const bleed = DEFAULT_BLEED_MM;
  const aspectRatio = pageAspectRatio(format);
  const layout = (id: string, slotsOf: () => LayoutSlot[]): Layout => {
    slotNumber = 0;
    return { id, aspectRatio, slots: slotsOf() };
  };
  return {
    retained: [
      layout("predefined-1", () => [photo(-bleed, -bleed, widthMm + 2 * bleed, heightMm + 2 * bleed)]),
      layout("predefined-3", () => [
        photo(left, top, largeWidth, contentHeight),
        ...grid(2, 1, left + largeWidth + gap, top, contentWidth - largeWidth - gap, contentHeight),
      ]),
      layout("predefined-10", () => [
        photo(left, top, contentWidth, contentHeight - gap - captionHeight),
        text(left, top + contentHeight - captionHeight, contentWidth, 18),
      ]),
      layout("predefined-11", () => [
        text(left, top, contentWidth, 36),
        photo(left, top + titleHeight + gap, contentWidth, contentHeight - titleHeight - gap),
      ]),
    ],
    mosaics: [
      layout("predefined-mosaic-1", () => [
        photo(left, top, largeWidth, contentHeight),
        ...grid(3, 1, left + largeWidth + gap, top, contentWidth - largeWidth - gap, contentHeight),
      ]),
      layout("predefined-mosaic-2", () => {
        const heroHeight = (contentHeight - gap) * 0.6;
        return [
          photo(left, top, contentWidth, heroHeight),
          ...grid(1, 4, left, top + heroHeight + gap, contentWidth, contentHeight - heroHeight - gap),
        ];
      }),
      layout("predefined-mosaic-3", () => {
        const heroHeight = (contentHeight - gap) * 0.6;
        return [
          ...grid(1, 2, left, top, contentWidth, heroHeight),
          ...grid(1, 3, left, top + heroHeight + gap, contentWidth, contentHeight - heroHeight - gap),
        ];
      }),
      layout("predefined-mosaic-4", () => {
        const columnWidth = (contentWidth - gap) / 2;
        const tallHeight = (contentHeight - gap) * 0.8;
        const shortHeight = contentHeight - gap - tallHeight;
        const right = left + columnWidth + gap;
        return [
          photo(left, top, columnWidth, tallHeight),
          photo(right, top, columnWidth, shortHeight),
          photo(left, top + tallHeight + gap, columnWidth, shortHeight),
          photo(right, top + shortHeight + gap, columnWidth, tallHeight),
        ];
      }),
      layout("predefined-mosaic-5", () => {
        const sideWidth = (contentWidth - 2 * gap) * 0.25;
        const centreWidth = contentWidth - 2 * gap - 2 * sideWidth;
        const sideHeight = (contentHeight - gap) / 2;
        const centre = left + sideWidth + gap;
        const right = centre + centreWidth + gap;
        return [
          photo(left, top, sideWidth, sideHeight),
          photo(centre, top, centreWidth, contentHeight),
          photo(right, top, sideWidth, sideHeight),
          photo(left, top + sideHeight + gap, sideWidth, sideHeight),
          photo(right, top + sideHeight + gap, sideWidth, sideHeight),
        ];
      }),
      layout("predefined-mosaic-6", () => {
        const columnWidth = (contentWidth - 2 * gap) / 3;
        const shortHeight = (contentHeight - gap) * 0.35;
        const tallHeight = contentHeight - gap - shortHeight;
        const centre = left + columnWidth + gap;
        const right = centre + columnWidth + gap;
        return [
          photo(left, top, columnWidth, shortHeight),
          photo(centre, top, columnWidth, tallHeight),
          photo(right, top, columnWidth, shortHeight),
          photo(left, top + shortHeight + gap, columnWidth, tallHeight),
          photo(centre, top + tallHeight + gap, columnWidth, shortHeight),
          photo(right, top + shortHeight + gap, columnWidth, tallHeight),
        ];
      }),
    ],
  };
}

/** The Layouts a Library starts with. Geometry uses the default margins and the given Page dimensions. */
export function predefinedLayoutLibrary(format: PageFormat): LayoutLibrary {
  const { retained, mosaics } = starterLayouts(format);
  return { schemaVersion: 2, layouts: [...retained, ...mosaics] };
}

/** Stores a Library's Layout Library in its `.phalbummakr/` folder. */
export interface LayoutPorts {
  /** The saved Layout Library, or `null` when the Library has none yet. */
  read(root: string): Promise<string | null>;
  /** Creates `.phalbummakr/` when it is missing. */
  write(root: string, json: string): Promise<void>;
}
