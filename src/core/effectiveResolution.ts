import { MM_PER_INCH, type Album, type PageFormat } from "./album";
import type { PhotoSize } from "./photos";
import { fitPhotoRect, placementDisplayCrop, slotContentSizeMm, uprightPhotoSize, type PhotoSlot } from "./slots";

export interface LowResolutionPlacement {
  /** Page number, starting at 1. */
  page: number;
  pageId: string;
  slotId: string;
  /** In pixels per inch of the printed Page. */
  effectiveResolution: number;
}

/** The print resolution a Placement gets: the displayed Photo pixels per inch of the Page they cover. */
export function effectiveResolution(format: PageFormat, slot: PhotoSlot, photo: PhotoSize): number | null {
  if (!slot.placement || !(photo.width > 0) || !(photo.height > 0)) return null;
  const { width: photoWidth, height: photoHeight } = uprightPhotoSize(photo);
  const crop = placementDisplayCrop(slot.placement);
  const content = slotContentSizeMm(format, slot);
  const shown = slot.placement.fit
    ? fitPhotoRect(photoWidth / photoHeight, content.widthMm / content.heightMm)
    : { width: 1, height: 1 };
  const widthIn = shown.width * content.widthMm / MM_PER_INCH;
  const heightIn = shown.height * content.heightMm / MM_PER_INCH;
  return Math.min(crop.width * photoWidth / widthIn, crop.height * photoHeight / heightIn);
}

/** Placements below the Page Format's Effective Resolution threshold. Photos without a known size are skipped. */
export function lowResolutionPlacements(album: Album, photos: ReadonlyMap<string, PhotoSize>): LowResolutionPlacement[] {
  return album.pages.flatMap((page, index) => page.slots.flatMap((slot) => {
    if (slot.type !== "photo" || !slot.placement) return [];
    const photo = photos.get(slot.placement.photoPath);
    const resolution = photo ? effectiveResolution(album.pageFormat, slot, photo) : null;
    return resolution !== null && resolution < album.pageFormat.minEffectiveDpi
      ? [{ page: index + 1, pageId: page.id, slotId: slot.id, effectiveResolution: resolution }] : [];
  }));
}

