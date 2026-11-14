import { Text } from "konva/lib/shapes/Text";
import { pageDimensions, POINTS_PER_MM, TEXT_LINE_HEIGHT, type Album, type PageFormat, type TextSlot, type TextStyle } from "../core";

export function textFontStyle(style: TextStyle): string {
  return `${style.italic ? "italic " : ""}${style.bold ? "bold" : "normal"}`;
}

export function measureTextSlot(slot: TextSlot, format: PageFormat) {
  const { widthMm, heightMm } = pageDimensions(format);
  const width = slot.width * widthMm * POINTS_PER_MM;
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
      height: Math.max(slot.style.fontSize * TEXT_LINE_HEIGHT, text.height()) / (heightMm * POINTS_PER_MM),
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
      if (old?.type === "text" && old.text === slot.text && old.width === slot.width && old.style === slot.style) return slot;
      const { height } = measureTextSlot(slot, album.pageFormat);
      if (Math.abs(height - slot.height) < 1e-9) return slot;
      pageChanged = true;
      return { ...slot, height };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, slots };
  });
  return changed ? { ...album, pages } : album;
}
