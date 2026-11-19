import { pageDimensions, type Album, type Page, type PageFormat } from "./album";
import { placementDisplayCrop, type Crop } from "./slots";

const MM_PER_INCH = 25.4;

export interface ExportWarnings {
  /** Page numbers of Pages with nothing that prints: no placed Photo and no text. */
  emptyPages: number[];
  /** Empty Photo Slots on the Pages that do print, by Page number. */
  emptyPhotoSlots: { page: number; count: number }[];
}

/** What to warn about before exporting an Album's Pages. */
export function exportWarnings(album: Album): ExportWarnings {
  const warnings: ExportWarnings = { emptyPages: [], emptyPhotoSlots: [] };
  album.pages.forEach((page, index) => {
    const prints = page.slots.some((slot) => slot.type === "photo" ? slot.placement !== null : slot.text.trim() !== "");
    const empty = page.slots.filter((slot) => slot.type === "photo" && !slot.placement).length;
    if (!prints) warnings.emptyPages.push(index + 1);
    else if (empty > 0) warnings.emptyPhotoSlots.push({ page: index + 1, count: empty });
  });
  return warnings;
}

/** The upright original a Photo Slot needs: its displayed Crop, resampled to the pixel box it fills on the exported Page. */
export interface ExportPhoto {
  slotId: string;
  photoPath: string;
  crop: Crop;
  /** When set, the Photo is scaled to fit inside the box instead of filling it. */
  fit: boolean;
  width: number;
  height: number;
}

export interface ExportedPage {
  page: Page;
  fileName: string;
  photos: ExportPhoto[];
}

/** Every Page of the Album, never the Inside Covers, as `001.jpg`, `002.jpg` and so on in Page order. */
export function exportPlan(album: Album): ExportedPage[] {
  const { widthMm, heightMm } = pageDimensions(album.pageFormat);
  const { pixelsPerMm } = exportPageSize(album.pageFormat);
  return album.pages.map((page, index) => ({
    page,
    fileName: `${String(index + 1).padStart(3, "0")}.jpg`,
    photos: page.slots.flatMap((slot) => {
      if (slot.type !== "photo" || !slot.placement) return [];
      const width = slot.width * widthMm * pixelsPerMm;
      const height = slot.height * heightMm * pixelsPerMm;
      const sideways = slot.rotation === 90 || slot.rotation === 270;
      return [{
        slotId: slot.id,
        photoPath: slot.placement.photoPath,
        crop: placementDisplayCrop(slot.placement),
        fit: slot.placement.fit,
        width: Math.max(1, Math.round(sideways ? height : width)),
        height: Math.max(1, Math.round(sideways ? width : height)),
      }];
    }),
  }));
}

/** The pixel size of an exported Page, trim plus Bleed on every side, at the Page Format's resolution. */
export function exportPageSize(format: PageFormat): { width: number; height: number; pixelsPerMm: number } {
  const { widthMm, heightMm } = pageDimensions(format);
  const pixelsPerMm = format.dpi / MM_PER_INCH;
  return {
    width: Math.round((widthMm + 2 * format.bleedMm) * pixelsPerMm),
    height: Math.round((heightMm + 2 * format.bleedMm) * pixelsPerMm),
    pixelsPerMm,
  };
}
