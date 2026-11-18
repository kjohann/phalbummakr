import { pageDimensions, type Album, type PageFormat } from "./album";
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
  schemaVersion: 1;
  layouts: Layout[];
}

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
  return JSON.stringify(library, null, 2);
}

/** Reads the Library's Layout Library; `null` means none was saved yet, so the predefined Layouts are seeded. */
export function readLayoutLibrary(json: string | null, format: PageFormat): LayoutLibrary {
  if (json === null) return predefinedLayoutLibrary(format);
  const library: unknown = JSON.parse(json);
  validateLayoutLibrary(library);
  for (const layout of library.layouts) {
    for (const slot of layout.slots) if (slot.type === "text") slot.placeholder ??= DEFAULT_PLACEHOLDER;
  }
  return library;
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validateLayoutLibrary(value: unknown): asserts value is LayoutLibrary {
  if (!exactRecord(value, ["schemaVersion", "layouts"]) || value.schemaVersion !== 1 || !Array.isArray(value.layouts)) {
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

/** The Layouts a Library starts with. Geometry is designed in millimetres on the given Page Format. */
export function predefinedLayoutLibrary(format: PageFormat): LayoutLibrary {
  const { widthMm, heightMm } = pageDimensions(format);
  const inset = Math.max(15, format.safeZoneMm);
  const gap = 6;
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
  const grid = (rows: number, columns: number, x = left, y = top, width = contentWidth, height = contentHeight) => {
    const columnWidth = (width - (columns - 1) * gap) / columns;
    const rowHeight = (height - (rows - 1) * gap) / rows;
    return Array.from({ length: rows * columns }, (_, index) => photo(
      x + (index % columns) * (columnWidth + gap), y + Math.floor(index / columns) * (rowHeight + gap), columnWidth, rowHeight,
    ));
  };
  /** Equal Slots of the given width-to-height ratio, as large as fits, centred on the Page. */
  const centredGrid = (rows: number, columns: number, aspect: number) => {
    const width = Math.min((contentWidth - (columns - 1) * gap) / columns, (contentHeight - (rows - 1) * gap) / rows * aspect);
    const height = width / aspect;
    const totalWidth = columns * width + (columns - 1) * gap;
    const totalHeight = rows * height + (rows - 1) * gap;
    return grid(rows, columns, (widthMm - totalWidth) / 2, (heightMm - totalHeight) / 2, totalWidth, totalHeight);
  };
  const largeWidth = (contentWidth - gap) * 0.6;
  const captionHeight = 18 * TEXT_LINE_HEIGHT / POINTS_PER_MM;
  const titleHeight = 36 * TEXT_LINE_HEIGHT / POINTS_PER_MM;
  const bleed = format.bleedMm;
  const slotSets: (() => LayoutSlot[])[] = [
    () => [photo(-bleed, -bleed, widthMm + 2 * bleed, heightMm + 2 * bleed)],
    () => grid(1, 2),
    () => [
      photo(left, top, largeWidth, contentHeight),
      ...grid(2, 1, left + largeWidth + gap, top, contentWidth - largeWidth - gap, contentHeight),
    ],
    () => centredGrid(1, 3, 3 / 2),
    () => centredGrid(1, 3, 2 / 3),
    () => grid(2, 2),
    () => centredGrid(2, 2, 2 / 3),
    () => grid(2, 3),
    () => grid(3, 3),
    () => [
      photo(left, top, contentWidth, contentHeight - gap - captionHeight),
      text(left, top + contentHeight - captionHeight, contentWidth, 18),
    ],
    () => [
      text(left, top, contentWidth, 36),
      photo(left, top + titleHeight + gap, contentWidth, contentHeight - titleHeight - gap),
    ],
  ];
  const aspectRatio = pageAspectRatio(format);
  return {
    schemaVersion: 1,
    layouts: slotSets.map((slotsOf, index) => {
      slotNumber = 0;
      return { id: `predefined-${index + 1}`, aspectRatio, slots: slotsOf() };
    }),
  };
}

/** Stores a Library's Layout Library in its `.phalbummakr/` folder. */
export interface LayoutPorts {
  /** The saved Layout Library, or `null` when the Library has none yet. */
  read(root: string): Promise<string | null>;
  /** Creates `.phalbummakr/` when it is missing. */
  write(root: string, json: string): Promise<void>;
}
