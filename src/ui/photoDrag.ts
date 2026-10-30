import type { PlaceablePhoto } from "../core";

const PHOTO_TYPE = "application/x-phalbummakr-photo";

export function writePhotoDrag(dataTransfer: DataTransfer, photo: PlaceablePhoto) {
  const { path, width, height, orientation } = photo;
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(PHOTO_TYPE, JSON.stringify({ path, width, height, orientation }));
}

/** Data is only readable on drop; during dragover only the types are visible. */
export function hasPhotoDrag(dataTransfer: DataTransfer): boolean {
  return [...dataTransfer.types].includes(PHOTO_TYPE);
}

export function readPhotoDrag(dataTransfer: DataTransfer): PlaceablePhoto | null {
  if (!hasPhotoDrag(dataTransfer)) return null;
  try {
    const value: unknown = JSON.parse(dataTransfer.getData(PHOTO_TYPE));
    if (typeof value !== "object" || value === null) return null;
    const { path, width, height, orientation } = value as Record<string, unknown>;
    if (typeof path !== "string" || typeof width !== "number" || typeof height !== "number"
      || typeof orientation !== "number") return null;
    return { path, width, height, orientation };
  } catch {
    return null;
  }
}
