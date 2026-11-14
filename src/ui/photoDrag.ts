import type { PlaceablePhoto } from "../core";

const PHOTO_TYPE = "application/x-phalbummakr-photo";

function isCachedThumbnail(value: string): boolean {
  return /^data:image\/(?:png|jpeg);base64,/i.test(value);
}

export function writePhotoDrag(dataTransfer: DataTransfer, photo: PlaceablePhoto, thumbnail?: string) {
  const { path, width, height, orientation } = photo;
  dataTransfer.effectAllowed = "copy";
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
