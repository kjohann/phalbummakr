import { Text } from "konva/lib/shapes/Text";
import { pageDimensions, POINTS_PER_MM, TEXT_LINE_HEIGHT, type Album, type PageFormat, type TextSlot, type TextStyle } from "../core";

export function textFontStyle(style: TextStyle): string {
  return `${style.italic ? "italic " : ""}${style.bold ? "bold" : "normal"}`;
}

export function measureTextSlot(slot: TextSlot, format: PageFormat) {
  const { widthMm, heightMm } = pageDimensions(format);
  const sideways = slot.rotation === 90 || slot.rotation === 270;
  const width = (sideways ? slot.height * heightMm : slot.width * widthMm) * POINTS_PER_MM;
  // Measure in points so line wrapping does not change with editor zoom.
  const text = new Text({
    text: slot.text, width, fontSize: slot.style.fontSize, fontFamily: slot.style.fontFamily,
    fontStyle: textFontStyle(slot.style),
    lineHeight: TEXT_LINE_HEIGHT,
  });
  try {
    const graphemes = new Set([...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(slot.text)]
      .map(({ segment }) => segment).filter((segment) => segment !== "\n" && segment !== "\r\n"));
    return {
      width,
      height: Math.max(slot.style.fontSize * TEXT_LINE_HEIGHT, text.height())
        / ((sideways ? widthMm : heightMm) * POINTS_PER_MM),
      tooWide: [...graphemes].some((segment) => text.measureSize(segment).width > width + 0.01),
    };
  } finally {
    text.destroy();
  }
}

export function fitTextSlots(album: Album, previous?: Album): Album {
  const previousPages = new Map(previous?.pages.map((page) => [page.id, page]));
  let changed = false;
  const pages = album.pages.map((page) => {
    const oldPage = previousPages.get(page.id);
    if (oldPage === page) return page;
    const oldSlots = new Map(oldPage?.slots.map((slot) => [slot.id, slot]));
    let pageChanged = false;
    const slots = page.slots.map((slot) => {
      if (slot.type !== "text") return slot;
      const old = oldSlots.get(slot.id);
      const sideways = slot.rotation === 90 || slot.rotation === 270;
      const { widthMm, heightMm } = pageDimensions(album.pageFormat);
      const width = sideways ? slot.height * heightMm : slot.width * widthMm;
      const oldWidth = old?.type === "text"
        ? (old.rotation === 90 || old.rotation === 270 ? old.height * heightMm : old.width * widthMm) : null;
      if (old?.type === "text" && old.text === slot.text && oldWidth !== null
        && Math.abs(oldWidth - width) < 1e-9 && old.style === slot.style) return slot;
      const { height } = measureTextSlot(slot, album.pageFormat);
      const currentHeight = sideways ? slot.width : slot.height;
      if (Math.abs(height - currentHeight) < 1e-9) return slot;
      pageChanged = true;
      if (sideways) return { ...slot, width: height, x: slot.rotation === 90 ? slot.x + slot.width - height : slot.x };
      return { ...slot, height, y: slot.rotation === 180 ? slot.y + slot.height - height : slot.y };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, slots };
  });
  return changed ? { ...album, pages } : album;
}
