import type { DragEvent } from "react";
import type { PlaceablePhoto } from "../core";

const PHOTO_TYPE = "application/x-phalbummakr-photo";

function isCachedThumbnail(value: string): boolean {
  return /^data:image\/(?:png|jpeg);base64,/i.test(value);
}

export function writePhotoDrag(dataTransfer: DataTransfer, photo: PlaceablePhoto, thumbnail?: string) {
  const { path, width, height, orientation } = photo;
  // Copy places the Photo on a Page; move sends it to a Folder.
  dataTransfer.effectAllowed = "copyMove";
  dataTransfer.setData(PHOTO_TYPE, JSON.stringify({
    path, width, height, orientation,
    ...(thumbnail && isCachedThumbnail(thumbnail) ? { thumbnail } : {}),
  }));
}

/** Data is only readable on drop; during dragover only the types are visible. */
export function hasPhotoDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(PHOTO_TYPE);
}

export function readPhotoDrag(dataTransfer: DataTransfer): (PlaceablePhoto & { thumbnail?: string }) | null {
  if (!hasPhotoDrag(dataTransfer)) return null;
  try {
    const value: unknown = JSON.parse(dataTransfer.getData(PHOTO_TYPE));
    if (typeof value !== "object" || value === null) return null;
    const { path, width, height, orientation, thumbnail } = value as Record<string, unknown>;
    if (typeof path !== "string" || typeof width !== "number" || typeof height !== "number"
      || typeof orientation !== "number" || (thumbnail !== undefined && typeof thumbnail !== "string")) return null;
    return {
      path, width, height, orientation,
      ...(typeof thumbnail === "string" && isCachedThumbnail(thumbnail) ? { thumbnail } : {}),
    };
  } catch {
    return null;
  }
}

/** A Photo starts being dragged from the element it is shown in. */
export type PhotoDragStart = (photo: string, event: DragEvent) => void;

/** Shows the dragged Photo's `picture`, if loaded, labelled with how many Photos the drag moves. */
export function writeCountDragImage(dataTransfer: DataTransfer, count: number, picture: HTMLImageElement | null) {
  if (typeof dataTransfer.setDragImage !== "function") return;
  const image = document.createElement("div");
  image.className = "photo-drag-image";
  if (picture?.complete && picture.naturalWidth > 0) {
    const copy = picture.cloneNode() as HTMLImageElement;
    copy.alt = "";
    copy.removeAttribute("loading");
    image.append(copy);
  }
  const label = document.createElement("span");
  label.className = "photo-drag-count";
  label.textContent = `${count} Photos`;
  image.append(label);
  document.body.append(image);
  dataTransfer.setDragImage(image, 20, 20);
  // The browser takes its snapshot of the drag image right away.
  setTimeout(() => image.remove());
}

/** Whether a dragleave left the element itself, not just moved onto one of its children. */
export function leftElement(event: { currentTarget: Element; relatedTarget: EventTarget | null }): boolean {
  return !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget));
}

const LAYOUT_TYPE = "application/x-phalbummakr-layout";

/** A Layout dragged from the Layout Library onto a Page. Only its id travels: the Layout is read from the shared Library on drop. */
export function writeLayoutDrag(dataTransfer: DataTransfer, layoutId: string) {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(LAYOUT_TYPE, layoutId);
}

export function hasLayoutDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(LAYOUT_TYPE);
}

export function readLayoutDrag(dataTransfer: DataTransfer): string | null {
  return hasLayoutDrag(dataTransfer) ? dataTransfer.getData(LAYOUT_TYPE) || null : null;
}
