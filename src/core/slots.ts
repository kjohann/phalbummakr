import { pageDimensions, type Album, type Page, type PageFormat } from "./album";
import type { PhotoSize } from "./photos";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fractions of the upright Photo. */
export type Crop = Rectangle;

export interface Placement {
  /** Relative to the Library root, with forward slashes. */
  photoPath: string;
  crop: Crop;
  fit: boolean;
}

export type SlotRotation = 0 | 90 | 180 | 270;

export interface PhotoSlot {
  id: string;
  type: "photo";
  /** Fractions of the trim Page; may extend into the Bleed. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: SlotRotation;
  placement: Placement | null;
}

export interface TextStyle {
  fontFamily: string;
  /** Font size in points. */
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
}

export const POINTS_PER_MM = 72 / 25.4;
export const DEFAULT_PLACEHOLDER = "Text";
export const TEXT_LINE_HEIGHT = 1.2;

export interface TextSlot {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: SlotRotation;
  text: string;
  /** Shown greyed out on the canvas while the Slot has no text; never printed. */
  placeholder: string;
  style: TextStyle;
  placement?: never;
}

export type Slot = PhotoSlot | TextSlot;

function editPage(album: Album, pageId: string, edit: (page: Page) => Page): Album {
  const index = album.pages.findIndex((page) => page.id === pageId);
  if (index === -1) throw new Error("Page not found in Album.");
  const pages = [...album.pages];
  pages[index] = edit(pages[index]);
  return { ...album, pages };
}

function unusedSlotId(page: Page): string {
  const ids = new Set(page.slots.map((slot) => slot.id));
  let number = 1;
  while (ids.has(`slot-${number}`)) number += 1;
  return `slot-${number}`;
}

function centreNewSlot(album: Album, pageId: string, centre?: { x: number; y: number }): Album {
  if (!centre) return album;
  const slot = album.pages.find((page) => page.id === pageId)!.slots.at(-1)!;
  return moveSlot(album, pageId, slot.id, centre.x - slot.width / 2, centre.y - slot.height / 2);
}

/** Adds an empty Photo Slot, centred on `centre` (fractions of the trim Page) when given. */
export function addPhotoSlot(album: Album, pageId: string, centre?: { x: number; y: number }): Album {
  return centreNewSlot(editPage(album, pageId, (page) => ({
    ...page,
    slots: [...page.slots, {
      id: unusedSlotId(page), type: "photo", x: 0.3, y: 0.3, width: 0.4, height: 0.4, placement: null,
    }],
  })), pageId, centre);
}

/** Adds an empty Text Slot, centred on `centre` (fractions of the trim Page) when given. */
export function addTextSlot(album: Album, pageId: string, centre?: { x: number; y: number }): Album {
  const height = 18 * TEXT_LINE_HEIGHT / POINTS_PER_MM / pageDimensions(album.pageFormat).heightMm;
  return centreNewSlot(editPage(album, pageId, (page) => ({
    ...page,
    slots: [...page.slots, {
      id: unusedSlotId(page), type: "text", x: 0.3, y: 0.3, width: 0.4, height,
      text: "", placeholder: DEFAULT_PLACEHOLDER, style: { fontFamily: "Arial", fontSize: 18, color: "#000000", bold: false, italic: false, underline: false, align: "left" },
    }],
  })), pageId, centre);
}

export function duplicateSlot(album: Album, pageId: string, slotId: string): Album {
  return editPage(album, pageId, (page) => {
    const original = page.slots.find((slot) => slot.id === slotId);
    if (!original) throw new Error("Slot not found on Page.");
    return { ...page, slots: [...page.slots, { ...structuredClone(original), id: unusedSlotId(page) }] };
  });
}

export function pasteSlot(album: Album, pageId: string, snapshot: Slot, position?: { x: number; y: number }): Album {
  let slotId = "";
  const added = editPage(album, pageId, (page) => {
    slotId = unusedSlotId(page);
    return { ...page, slots: [...page.slots, { ...structuredClone(snapshot), id: slotId }] };
  });
  return position ? moveSlot(added, pageId, slotId, position.x, position.y) : added;
}

function editSlot(album: Album, pageId: string, slotId: string, edit: (slot: Slot) => Slot): Album {
  return editPage(album, pageId, (page) => {
    const index = page.slots.findIndex((slot) => slot.id === slotId);
    if (index === -1) throw new Error("Slot not found on Page.");
    const slots = [...page.slots];
    slots[index] = edit(slots[index]);
    return { ...page, slots };
  });
}

export function setSlotText(album: Album, pageId: string, slotId: string, text: string): Album {
  return editSlot(album, pageId, slotId, (slot) => {
    if (slot.type !== "text") throw new Error("Slot is not a Text Slot.");
    return { ...slot, text };
  });
}

export function setSlotPlaceholder(album: Album, pageId: string, slotId: string, placeholder: string): Album {
  return editSlot(album, pageId, slotId, (slot) => {
    if (slot.type !== "text") throw new Error("Slot is not a Text Slot.");
    return { ...slot, placeholder };
  });
}

export function setTextStyle(album: Album, pageId: string, slotId: string, style: TextStyle): Album {
  return editSlot(album, pageId, slotId, (slot) => {
    if (slot.type !== "text") throw new Error("Slot is not a Text Slot.");
    return { ...slot, style: { ...style } };
  });
}

/** The area a Slot may occupy: the trim Page plus the Bleed, as fractions of the trim Page. */
function bleedBox(album: Album) {
  const { widthMm, heightMm } = pageDimensions(album.pageFormat);
  const x = album.pageFormat.bleedMm / widthMm;
  const y = album.pageFormat.bleedMm / heightMm;
  return { left: -x, top: -y, right: 1 + x, bottom: 1 + y };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function moveSlot(album: Album, pageId: string, slotId: string, x: number, y: number): Album {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Slot position must be a finite number.");
  const box = bleedBox(album);
  return editSlot(album, pageId, slotId, (slot) => {
    const textRotation = slot.type === "text" ? slot.rotation ?? 0 : null;
    const minX = textRotation === 90 ? box.left - slot.width : box.left;
    const maxX = textRotation === 270 ? box.right : box.right - slot.width;
    const minY = textRotation === 180 ? box.top - slot.height : box.top;
    const maxY = textRotation === 0 ? box.bottom : box.bottom - slot.height;
    return {
      ...slot,
      x: clamp(x, minX, Math.max(minX, maxX)),
      y: clamp(y, minY, Math.max(minY, maxY)),
    };
  });
}

export function rotateSlot(album: Album, pageId: string, slotId: string, turn: 90 | -90): Album {
  if (turn !== 90 && turn !== -90) throw new Error("Slot rotation must be a 90 degree turn.");
  const { widthMm, heightMm } = pageDimensions(album.pageFormat);
  return editSlot(album, pageId, slotId, (slot) => {
    const width = slot.height * heightMm / widthMm;
    const height = slot.width * widthMm / heightMm;
    const rotation = ((slot.rotation ?? 0) + turn + 360) % 360 as SlotRotation;
    return {
      ...slot, rotation,
      x: slot.x + (slot.width - width) / 2,
      y: slot.y + (slot.height - height) / 2,
      width, height,
    };
  });
}

const MIN_SLOT_SIZE = 0.02;

export function deleteSlot(album: Album, pageId: string, slotId: string): Album {
  return editPage(album, pageId, (page) => {
    if (!page.slots.some((slot) => slot.id === slotId)) throw new Error("Slot not found on Page.");
    return { ...page, slots: page.slots.filter((slot) => slot.id !== slotId) };
  });
}

export function resizeSlot(album: Album, pageId: string, slotId: string, width: number, height: number): Album {
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("Slot size must be a finite number.");
  const box = bleedBox(album);
  return editSlot(album, pageId, slotId, (slot) => {
    const sidewaysText = slot.type === "text" && (slot.rotation === 90 || slot.rotation === 270);
    const resized = {
      ...slot,
      width: sidewaysText ? slot.width : clamp(width, MIN_SLOT_SIZE, Math.max(MIN_SLOT_SIZE, box.right - slot.x)),
      height: slot.type === "text" && !sidewaysText ? slot.height
        : clamp(height, MIN_SLOT_SIZE, Math.max(MIN_SLOT_SIZE, box.bottom - slot.y)),
    };
    if (slot.type !== "photo" || resized.type !== "photo" || !slot.placement) return resized;
    return { ...resized, placement: refitPlacement(album, slot.placement, slot, resized) };
  });
}

/** The pixel size and EXIF orientation of a Photo, as scanned. */
export interface PlaceablePhoto {
  path: string;
  width: number;
  height: number;
  orientation: number;
}

function slotAspect(album: Album, slot: Slot): number {
  const { widthMm, heightMm } = slotContentSizeMm(album.pageFormat, slot);
  return widthMm / heightMm;
}

/** A Slot's printed size in its own upright orientation: width and height swap for 90° and 270° Slot rotation. */
export function slotContentSizeMm(format: PageFormat, slot: Slot): { widthMm: number; heightMm: number } {
  const page = pageDimensions(format);
  const width = slot.width * page.widthMm;
  const height = slot.height * page.heightMm;
  return slot.rotation === 90 || slot.rotation === 270
    ? { widthMm: height, heightMm: width } : { widthMm: width, heightMm: height };
}

function centredCrop(photoAspect: number, targetAspect: number, centreX = 0.5, centreY = 0.5): Crop {
  const width = photoAspect > targetAspect ? targetAspect / photoAspect : 1;
  const height = photoAspect > targetAspect ? 1 : photoAspect / targetAspect;
  return {
    x: clamp(centreX - width / 2, 0, 1 - width),
    y: clamp(centreY - height / 2, 0, 1 - height),
    width,
    height,
  };
}

/** Keeps a Placement's zoom and centre while adapting its Crop to another Photo Slot's content aspect ratio. */
export function refitPlacement(album: Album, placement: Placement, from: PhotoSlot, to: PhotoSlot): Placement {
  const { crop } = placement;
  const previousAspect = slotAspect(album, from);
  if (Math.abs(previousAspect - slotAspect(album, to)) < 1e-12) return placement;
  const photoAspect = previousAspect * crop.height / crop.width;
  const previousCover = centredCrop(photoAspect, previousAspect);
  const nextCover = centredCrop(photoAspect, slotAspect(album, to));
  const zoomScale = Math.min(1, crop.width / previousCover.width);
  const width = nextCover.width * zoomScale;
  const height = nextCover.height * zoomScale;
  return {
    ...placement,
    crop: {
      x: clamp(crop.x + crop.width / 2 - width / 2, 0, 1 - width),
      y: clamp(crop.y + crop.height / 2 - height / 2, 0, 1 - height),
      width,
      height,
    },
  };
}

export interface SlotAddress {
  pageId: string;
  slotId: string;
}

export function swapPlacements(album: Album, from: SlotAddress, to: SlotAddress): Album {
  const source = album.pages.find((page) => page.id === from.pageId)?.slots.find((slot) => slot.id === from.slotId);
  const target = album.pages.find((page) => page.id === to.pageId)?.slots.find((slot) => slot.id === to.slotId);
  if (source?.type !== "photo" || !source.placement) throw new Error("Source Photo Slot has no Placement.");
  if (target?.type !== "photo") throw new Error("Target is not a Photo Slot.");
  if (from.pageId === to.pageId && from.slotId === to.slotId) return album;
  const sourcePlacement = source.placement;
  const targetPlacement = target.placement;
  const moved = editSlot(album, from.pageId, from.slotId, (slot) => {
    if (slot.type !== "photo") throw new Error("Source is not a Photo Slot.");
    return { ...slot, placement: targetPlacement ? refitPlacement(album, targetPlacement, target, source) : null };
  });
  return editSlot(moved, to.pageId, to.slotId, (slot) => {
    if (slot.type !== "photo") throw new Error("Target is not a Photo Slot.");
    return { ...slot, placement: refitPlacement(album, sourcePlacement, source, target) };
  });
}

/** A Photo's pixel size as shown: EXIF orientations 5–8 swap width and height. */
export function uprightPhotoSize(photo: PhotoSize): { width: number; height: number } {
  return photo.orientation >= 5 && photo.orientation <= 8
    ? { width: photo.height, height: photo.width } : { width: photo.width, height: photo.height };
}

function uprightPhotoAspect(photo: PlaceablePhoto): number {
  if (!isRelativePhotoPath(photo.path)) throw new Error("Photo path must be relative to the Library root.");
  if (!(photo.width > 0) || !(photo.height > 0) || !Number.isFinite(photo.width) || !Number.isFinite(photo.height)) {
    throw new Error("Photo size must be a positive number of pixels.");
  }
  const { width, height } = uprightPhotoSize(photo);
  return width / height;
}

function isRelativePhotoPath(path: unknown): path is string {
  return typeof path === "string" && path !== "" && !path.includes("\\") && !/^[a-z]:/i.test(path)
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function placePhoto(album: Album, pageId: string, slotId: string, photo: PlaceablePhoto): Album {
  const upright = uprightPhotoAspect(photo);
  return editSlot(album, pageId, slotId, (slot) => {
    if (slot.type !== "photo") throw new Error("Slot is not a Photo Slot.");
    // Turns already changed the Page-space bounds; only the old content orientation is reset.
    const uprightSlot: PhotoSlot = { ...slot, rotation: 0 };
    return { ...uprightSlot, placement: { photoPath: photo.path, crop: centredCrop(upright, slotAspect(album, uprightSlot)), fit: false } };
  });
}

export function setPlacementFit(album: Album, pageId: string, slotId: string, fit: boolean): Album {
  return editSlot(album, pageId, slotId, (slot) => slot.placement
    ? { ...slot, placement: { ...slot.placement, fit } }
    : slot);
}

export function setPlacementCrop(album: Album, pageId: string, slotId: string, crop: Crop): Album {
  return editSlot(album, pageId, slotId, (slot) => slot.placement
    ? { ...slot, placement: { ...slot.placement, crop } }
    : slot);
}

/** Moves a Crop window by fractions of the upright Photo, keeping it inside the Photo. */
export function panCrop(crop: Crop, deltaX: number, deltaY: number): Crop {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) throw new Error("Crop movement must be finite.");
  return {
    ...crop,
    x: clamp(crop.x + deltaX, 0, 1 - crop.width),
    y: clamp(crop.y + deltaY, 0, 1 - crop.height),
  };
}

/** Zooms around the Crop centre. A factor above 1 zooms in; 1 is the furthest fit-cover may zoom out. */
export function zoomCrop(crop: Crop, factor: number): Crop {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new Error("Crop zoom factor must be positive and finite.");
  const aspect = crop.width / crop.height;
  const maxWidth = Math.min(1, aspect);
  const width = clamp(crop.width / factor, Math.min(1e-6, maxWidth), maxWidth);
  const height = width / aspect;
  const centreX = crop.x + crop.width / 2;
  const centreY = crop.y + crop.height / 2;
  return {
    x: clamp(centreX - width / 2, 0, 1 - width),
    y: clamp(centreY - height / 2, 0, 1 - height),
    width,
    height,
  };
}

/** Returns the image's centred bounds inside a Slot, as fractions of the Slot. */
export function fitPhotoRect(photoAspect: number, targetAspect: number): Rectangle {
  if (!(photoAspect > 0) || !(targetAspect > 0) || !Number.isFinite(photoAspect) || !Number.isFinite(targetAspect)) {
    throw new Error("Photo and Slot aspect ratios must be positive and finite.");
  }
  const width = photoAspect > targetAspect ? 1 : photoAspect / targetAspect;
  const height = photoAspect > targetAspect ? targetAspect / photoAspect : 1;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

export function placementDisplayCrop(placement: Placement): Crop {
  return placement.fit ? { x: 0, y: 0, width: 1, height: 1 } : placement.crop;
}

export function placePhotoOnPage(
  album: Album,
  pageId: string,
  photo: PlaceablePhoto,
  centreX: number,
  centreY: number,
): Album {
  const photoAspect = uprightPhotoAspect(photo);
  if (!Number.isFinite(centreX) || !Number.isFinite(centreY)) throw new Error("Drop point must be finite.");
  const page = album.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found in Album.");

  const { widthMm, heightMm } = pageDimensions(album.pageFormat);
  const size = photoAspect >= 1
    ? { width: 0.4, height: 0.4 * widthMm / (photoAspect * heightMm) }
    : { width: 0.4 * photoAspect * heightMm / widthMm, height: 0.4 };
  const box = bleedBox(album);
  const clampedCentreX = clamp(centreX, box.left, box.right);
  const clampedCentreY = clamp(centreY, box.top, box.bottom);
  const left = clamp(clampedCentreX - size.width / 2, box.left, box.right);
  const right = clamp(clampedCentreX + size.width / 2, box.left, box.right);
  const top = clamp(clampedCentreY - size.height / 2, box.top, box.bottom);
  const bottom = clamp(clampedCentreY + size.height / 2, box.top, box.bottom);
  const slot: PhotoSlot = {
    id: unusedSlotId(page),
    type: "photo",
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    placement: null,
  };
  slot.placement = { photoPath: photo.path, crop: centredCrop(photoAspect, slotAspect(album, slot)), fit: false };
  return editPage(album, pageId, (current) => ({ ...current, slots: [...current.slots, slot] }));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function recordWithKeys(value: unknown, required: string[], optional: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && required.every((key) => key in value)
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

export function validateSlots(slots: unknown): asserts slots is Slot[] {
  if (!Array.isArray(slots)) throw new Error("Page Slots must be an array.");
  const ids = new Set<string>();
  for (const slot of slots) {
    if ((!recordWithKeys(slot, ["id", "type", "x", "y", "width", "height", "placement"], ["rotation"])
      && !recordWithKeys(slot, ["id", "type", "x", "y", "width", "height", "text", "style"], ["rotation", "placeholder"]))
      || ("placeholder" in slot && typeof slot.placeholder !== "string")
      || typeof slot.id !== "string" || !slot.id || ids.has(slot.id)
      || !finite(slot.x) || !finite(slot.y) || !finite(slot.width) || !finite(slot.height)
      || ("rotation" in slot && slot.rotation !== 0 && slot.rotation !== 90 && slot.rotation !== 180 && slot.rotation !== 270)
      || slot.width <= 0 || slot.height <= 0) {
      throw new Error("Invalid or unsupported Slot.");
    }
    ids.add(slot.id);
    if (slot.type === "photo" && "placement" in slot) {
      if (slot.placement !== null) validatePlacement(slot.placement);
    } else if (slot.type === "text" && "text" in slot && typeof slot.text === "string") {
      validateTextStyle(slot.style);
    } else throw new Error("Invalid or unsupported Slot.");
  }
}

function validateTextStyle(style: unknown): asserts style is TextStyle {
  if ((!exactRecord(style, ["fontFamily", "fontSize", "color", "bold", "italic", "align"])
    && !exactRecord(style, ["fontFamily", "fontSize", "color", "bold", "italic", "underline", "align"]))
    || typeof style.fontFamily !== "string" || !style.fontFamily.trim()
    || !finite(style.fontSize) || style.fontSize <= 0
    || typeof style.color !== "string" || !/^#[0-9a-f]{6}$/i.test(style.color)
    || typeof style.bold !== "boolean" || typeof style.italic !== "boolean"
    || ("underline" in style && typeof style.underline !== "boolean")
    || (style.align !== "left" && style.align !== "center" && style.align !== "right")) {
    throw new Error("Invalid Text Slot style.");
  }
}

function validatePlacement(placement: unknown): asserts placement is Placement {
  const tolerance = 1e-9;
  const legacyPlacement = exactRecord(placement, ["photoPath", "crop"]);
  if ((!legacyPlacement && !exactRecord(placement, ["photoPath", "crop", "fit"]))
    || !isRelativePhotoPath((placement as Record<string, unknown>).photoPath)
    || (!legacyPlacement && typeof (placement as Record<string, unknown>).fit !== "boolean")
    || !exactRecord(placement.crop, ["x", "y", "width", "height"])
    || ![placement.crop.x, placement.crop.y, placement.crop.width, placement.crop.height].every(finite)) {
    throw new Error("Invalid Placement.");
  }
  const { x, y, width, height } = placement.crop as unknown as Crop;
  if (width <= 0 || height <= 0 || x < -tolerance || y < -tolerance
    || x + width > 1 + tolerance || y + height > 1 + tolerance) {
    throw new Error("Invalid Placement Crop.");
  }
}
