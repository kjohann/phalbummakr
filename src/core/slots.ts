import { pageDimensions, type Album, type Page } from "./album";

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

export function addPhotoSlot(album: Album, pageId: string): Album {
  return editPage(album, pageId, (page) => ({
    ...page,
    slots: [...page.slots, {
      id: unusedSlotId(page), type: "photo", x: 0.3, y: 0.3, width: 0.4, height: 0.4, placement: null,
    }],
  }));
}

export function addTextSlot(album: Album, pageId: string): Album {
  const height = 18 * TEXT_LINE_HEIGHT / POINTS_PER_MM / pageDimensions(album.pageFormat).heightMm;
  return editPage(album, pageId, (page) => ({
    ...page,
    slots: [...page.slots, {
      id: unusedSlotId(page), type: "text", x: 0.3, y: 0.3, width: 0.4, height,
      text: "", style: { fontFamily: "Arial", fontSize: 18, color: "#000000", bold: false, italic: false, underline: false, align: "left" },
    }],
  }));
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
    if (slot.type !== "photo" || !slot.placement) return resized;
    const { crop } = slot.placement;
    // The Crop has the old Slot's printed aspect, so it also records the Photo's upright aspect.
    const previousAspect = slotAspect(album, slot);
    const photoAspect = previousAspect * crop.height / crop.width;
    const previousCover = centredCrop(photoAspect, previousAspect);
    const nextCover = centredCrop(photoAspect, slotAspect(album, resized));
    // Keep the zoom relative to cover and the Crop centre where the Photo edges allow it.
    const zoomScale = Math.min(1, crop.width / previousCover.width);
    const cropWidth = nextCover.width * zoomScale;
    const cropHeight = nextCover.height * zoomScale;
    return {
      ...slot,
      width: resized.width,
      height: resized.height,
      placement: {
        ...slot.placement,
        crop: {
          x: clamp(crop.x + crop.width / 2 - cropWidth / 2, 0, 1 - cropWidth),
          y: clamp(crop.y + crop.height / 2 - cropHeight / 2, 0, 1 - cropHeight),
          width: cropWidth,
          height: cropHeight,
        },
      },
    };
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
  const { widthMm, heightMm } = pageDimensions(album.pageFormat);
  const aspect = (slot.width * widthMm) / (slot.height * heightMm);
  return slot.rotation === 90 || slot.rotation === 270 ? 1 / aspect : aspect;
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

function uprightPhotoAspect(photo: PlaceablePhoto): number {
  if (!isRelativePhotoPath(photo.path)) throw new Error("Photo path must be relative to the Library root.");
  if (!(photo.width > 0) || !(photo.height > 0) || !Number.isFinite(photo.width) || !Number.isFinite(photo.height)) {
    throw new Error("Photo size must be a positive number of pixels.");
  }
  return photo.orientation >= 5 && photo.orientation <= 8
    ? photo.height / photo.width : photo.width / photo.height;
}

function isRelativePhotoPath(path: unknown): path is string {
  return typeof path === "string" && path !== "" && !path.includes("\\") && !/^[a-z]:/i.test(path)
    && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function placePhoto(album: Album, pageId: string, slotId: string, photo: PlaceablePhoto): Album {
  const upright = uprightPhotoAspect(photo);
  return editSlot(album, pageId, slotId, (slot) => {
    if (slot.type !== "photo") throw new Error("Slot is not a Photo Slot.");
    return { ...slot, placement: { photoPath: photo.path, crop: centredCrop(upright, slotAspect(album, slot)), fit: false } };
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

export function validateSlots(slots: unknown): asserts slots is Slot[] {
  if (!Array.isArray(slots)) throw new Error("Page Slots must be an array.");
  const ids = new Set<string>();
  for (const slot of slots) {
    if ((!exactRecord(slot, ["id", "type", "x", "y", "width", "height", "placement"])
      && !exactRecord(slot, ["id", "type", "x", "y", "width", "height", "placement", "rotation"])
      && !exactRecord(slot, ["id", "type", "x", "y", "width", "height", "text", "style"])
      && !exactRecord(slot, ["id", "type", "x", "y", "width", "height", "text", "style", "rotation"]))
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
