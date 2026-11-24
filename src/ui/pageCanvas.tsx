import { useEffect, useMemo, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import {
  duplicateSlot, fitPhotoRect, moveSlot, moveSlots, pageDimensions, resizeSlot, slotResizeEdges, POINTS_PER_MM, TEXT_LINE_HEIGHT,
  type Album, type Crop, type PageFormat, type Rectangle, type ResizeHandle, type Slot, type TextSlot,
} from "../core";
import { snapSlot, type SnapGuide } from "./slotSnapping";
import { fitTextSlots, measureTextSlot, textFontStyle } from "./textLayout";

/** An in-progress mouse drag of a Slot, in screen pixels. */
export interface SlotDrag {
  pageId: string;
  slotId: string;
  kind: "move" | "resize";
  dx: number;
  dy: number;
  bypass: boolean;
  duplicate?: boolean;
  handle?: ResizeHandle;
  /** Selected Slots moved together with `slotId`, which is one of them. */
  slotIds?: string[];
}

function boundsOf(rects: Rectangle[]): Rectangle {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x, y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
}

/** Moves Selected Slots as one rigid unit, snapping their outer bounds. */
function applyGroupDrag(album: Album, drag: SlotDrag & { slotIds: string[] }, trimWidth: number, trimHeight: number): {
  album: Album;
  guides: SnapGuide[];
} {
  const page = album.pages.find((item) => item.id === drag.pageId);
  const ids = new Set(drag.slotIds);
  const moving = page?.slots.filter((slot) => ids.has(slot.id)) ?? [];
  if (!page || moving.length !== ids.size) return { album, guides: [] };
  const bounds = boundsOf(moving);
  const apply = (dx: number, dy: number) => moveSlots(album, drag.pageId, drag.slotIds, dx, dy);
  const boundsAfter = (moved: Album) => boundsOf(moved.pages.find((item) => item.id === drag.pageId)!.slots
    .filter((slot) => ids.has(slot.id)));
  const dx = drag.dx / trimWidth;
  const dy = drag.dy / trimHeight;
  const updated = apply(dx, dy);
  if (drag.bypass) return { album: updated, guides: [] };
  const dimensions = pageDimensions(album.pageFormat);
  const snapped = snapSlot({
    rect: boundsAfter(updated),
    unclamped: { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
    pageSize: { width: trimWidth, height: trimHeight },
    safeZone: { x: album.pageFormat.safeZoneMm / dimensions.widthMm, y: album.pageFormat.safeZoneMm / dimensions.heightMm },
    otherSlots: page.slots.filter((slot) => !ids.has(slot.id)),
    kind: "move",
    resizeHeight: false,
    project: (rect) => boundsAfter(apply(rect.x - bounds.x, rect.y - bounds.y)),
    members: moving.map((slot) => ({ x: slot.x - bounds.x, y: slot.y - bounds.y, width: slot.width, height: slot.height })),
  });
  return { album: apply(snapped.rect.x - bounds.x, snapped.rect.y - bounds.y), guides: snapped.guides };
}

export function applySlotDrag(album: Album, drag: SlotDrag, trimWidth: number, trimHeight: number, measurePlaceholders = false): {
  album: Album;
  guides: SnapGuide[];
} {
  if (drag.kind === "move" && !drag.duplicate && drag.slotIds && drag.slotIds.length > 1) {
    return applyGroupDrag(album, { ...drag, slotIds: drag.slotIds }, trimWidth, trimHeight);
  }
  if (drag.duplicate && drag.kind === "move") {
    album = duplicateSlot(album, drag.pageId, drag.slotId);
    drag = { ...drag, slotId: album.pages.find((page) => page.id === drag.pageId)!.slots.at(-1)!.id };
  }
  const slot = album.pages.find((page) => page.id === drag.pageId)?.slots.find((item) => item.id === drag.slotId);
  if (!slot) return { album, guides: [] };
  const handle = drag.handle ?? "se";
  const edges = slotResizeEdges(slot, handle);
  const unclamped = drag.kind === "move"
    ? { ...slot, x: slot.x + drag.dx / trimWidth, y: slot.y + drag.dy / trimHeight }
    : {
      ...slot,
      x: slot.x + (edges.x === -1 ? drag.dx / trimWidth : 0),
      y: slot.y + (edges.y === -1 ? drag.dy / trimHeight : 0),
      width: slot.width + edges.x * drag.dx / trimWidth,
      height: slot.height + edges.y * drag.dy / trimHeight,
    };
  const apply = (rect: Rectangle) => drag.kind === "move"
    ? moveSlot(album, drag.pageId, drag.slotId, rect.x, rect.y)
    : resizeSlot(album, drag.pageId, drag.slotId, rect.width, rect.height, handle);
  const updated = fitTextSlots(apply(unclamped), album, measurePlaceholders);
  if (drag.bypass) return { album: updated, guides: [] };
  const page = updated.pages.find((item) => item.id === drag.pageId)!;
  const proposed = page.slots.find((item) => item.id === drag.slotId)!;
  const dimensions = pageDimensions(album.pageFormat);
  const snapped = snapSlot({
    rect: proposed,
    unclamped,
    pageSize: { width: trimWidth, height: trimHeight },
    safeZone: { x: album.pageFormat.safeZoneMm / dimensions.widthMm, y: album.pageFormat.safeZoneMm / dimensions.heightMm },
    otherSlots: page.slots.filter((item) => item.id !== drag.slotId),
    kind: drag.kind,
    resizeEdges: edges,
    resizeWidth: edges.x !== 0,
    resizeHeight: edges.y !== 0,
    project: (rect) => {
      const candidate = fitTextSlots(apply(rect), album, measurePlaceholders);
      return candidate.pages.find((item) => item.id === drag.pageId)!.slots.find((item) => item.id === drag.slotId)!;
    },
  });
  const result = fitTextSlots(apply(snapped.rect), album, measurePlaceholders);
  const actual = result.pages.find((item) => item.id === drag.pageId)!.slots.find((item) => item.id === drag.slotId)!;
  return {
    album: result,
    guides: snapped.guides.filter((guide) => {
      const dimension = guide.axis === "x" ? "width" : "height";
      return Math.abs(actual[guide.axis] - snapped.rect[guide.axis]) < 1e-9
        && Math.abs(actual[dimension] - snapped.rect[dimension]) < 1e-9;
    }),
  };
}

const resizeHandles: { handle: ResizeHandle; label: string; left: string; top: string; cursor: string }[] = [
  { handle: "nw", label: "top left", left: "0%", top: "0%", cursor: "nwse-resize" },
  { handle: "n", label: "top", left: "50%", top: "0%", cursor: "ns-resize" },
  { handle: "ne", label: "top right", left: "100%", top: "0%", cursor: "nesw-resize" },
  { handle: "e", label: "right", left: "100%", top: "50%", cursor: "ew-resize" },
  { handle: "se", label: "bottom right", left: "100%", top: "100%", cursor: "nwse-resize" },
  { handle: "s", label: "bottom", left: "50%", top: "100%", cursor: "ns-resize" },
  { handle: "sw", label: "bottom left", left: "0%", top: "100%", cursor: "nesw-resize" },
  { handle: "w", label: "left", left: "0%", top: "50%", cursor: "ew-resize" },
];

export function SlotResizeHandles({ slot, name, onMouseDown }: {
  slot: Slot; name: string; onMouseDown: (event: ReactMouseEvent, handle: ResizeHandle) => void;
}) {
  const sidewaysText = slot.type === "text" && (slot.rotation === 90 || slot.rotation === 270);
  const primary = slot.type === "photo" ? "se" : sidewaysText ? "s" : "e";
  return resizeHandles.map(({ handle, label, left, top, cursor }) => {
    const edges = slotResizeEdges(slot, handle);
    if (edges.x === 0 && edges.y === 0) return null;
    const corner = handle.length === 2;
    return (
      <span key={handle}
        className={`slot-resize-handle${corner ? " slot-resize-handle--corner" : ""}${slot.type === "text" ? sidewaysText ? " slot-resize-handle--text-sideways" : " slot-resize-handle--text" : ""}`}
        role="button" aria-label={handle === primary ? `Resize ${name}` : `Resize ${name} from ${label}`}
        title={`Resize ${name} from ${label}`}
        style={{ left, top, cursor: slot.type === "text" ? sidewaysText ? "ns-resize" : "ew-resize" : cursor }}
        onMouseDown={(event) => onMouseDown(event, handle)} />
    );
  });
}

/** Positions a Slot on the canvas and turns it by its Slot rotation; `children` draw in the Slot's own upright box. */
export function SlotFrame({ slot, rect, children }: {
  slot: Slot; rect: Rectangle; children: (local: Rectangle) => ReactNode;
}) {
  const sideways = slot.rotation === 90 || slot.rotation === 270;
  const local = { x: 0, y: 0, width: sideways ? rect.height : rect.width, height: sideways ? rect.width : rect.height };
  return (
    <Group x={rect.x + rect.width / 2} y={rect.y + rect.height / 2}
      offsetX={local.width / 2} offsetY={local.height / 2} rotation={slot.rotation ?? 0}>
      {children(local)}
    </Group>
  );
}

export type PhotoSource = HTMLImageElement | HTMLCanvasElement;

/** Draws a Placement's image in its Slot's box: the Crop filling the box, or with Fit, the whole image centred on white. */
export function PhotoImage({ x, y, width, height, image, crop, fit, opacity = 1 }: {
  x: number; y: number; width: number; height: number; image: PhotoSource; crop: Crop; fit: boolean; opacity?: number;
}) {
  const imageWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const imageHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const bounds = fit ? fitPhotoRect(imageWidth / imageHeight, width / height) : { x: 0, y: 0, width: 1, height: 1 };
  return (
    <>
      {fit && <Rect x={x} y={y} width={width} height={height} fill="#ffffff" />}
      <KonvaImage image={image} x={x + bounds.x * width} y={y + bounds.y * height}
        width={bounds.width * width} height={bounds.height * height} opacity={opacity} crop={{
          x: crop.x * imageWidth,
          y: crop.y * imageHeight,
          width: crop.width * imageWidth,
          height: crop.height * imageHeight,
        }} />
    </>
  );
}

/** Draws a Text Slot's text, or, where `showPlaceholder` is set and the Slot is empty, its placeholder greyed out. */
export function TextContent({ slot, id, rect, scale, format, hidden, showPlaceholder, onOverflow }: {
  slot: TextSlot; id: string; rect: Rectangle;
  scale: number; format: PageFormat; hidden: boolean; showPlaceholder: boolean; onOverflow: (id: string, overflow: boolean) => void;
}) {
  const layout = useMemo(() => measureTextSlot(slot, format),
    [slot.text, slot.placeholder, slot.style, slot.width, slot.height, slot.rotation, format]);
  const placeholder = !slot.text && showPlaceholder;
  useEffect(() => { onOverflow(id, layout.tooWide); }, [id, layout.tooWide, onOverflow]);
  const textScale = scale / POINTS_PER_MM;
  return (
    <Group x={rect.x} y={rect.y} scaleX={textScale} scaleY={textScale}
      clipX={0} clipY={0} clipWidth={layout.width} clipHeight={rect.height / textScale}>
      <Text width={layout.width} text={placeholder ? slot.placeholder : slot.text}
        fontFamily={slot.style.fontFamily} fontSize={slot.style.fontSize} fontStyle={textFontStyle(slot.style)}
        textDecoration={slot.style.underline ? "underline" : ""}
        fill={slot.style.color} align={slot.style.align} lineHeight={TEXT_LINE_HEIGHT} opacity={hidden ? 0 : placeholder ? 0.4 : 1} />
    </Group>
  );
}

export function LayerPage({ x, y, width, height, bleed, safeZone, children }: {
  x: number; y: number; width: number; height: number; bleed: number; safeZone: number; children: ReactNode;
}) {
  return (
    <>
      <Rect x={x} y={y} width={width} height={height} fill="#ffffff" stroke="#b89176" strokeWidth={1}
        shadowColor="#1e2926" shadowBlur={12} shadowOpacity={0.1} shadowOffsetY={4} />
      {children}
      <Rect x={x + bleed} y={y + bleed} width={width - 2 * bleed} height={height - 2 * bleed}
        stroke="#9e6d4e" strokeWidth={1} dash={[5, 4]} />
      <Rect x={x + bleed + safeZone} y={y + bleed + safeZone}
        width={width - 2 * (bleed + safeZone)} height={height - 2 * (bleed + safeZone)}
        stroke="#56829d" strokeWidth={1} dash={[3, 3]} />
    </>
  );
}

/** Snap guides over the canvas, drawn relative to the trim edge of the Page being edited, in screen pixels. */
export function SnapGuides({ guides, width, height, trimLeft, trimTop, trimWidth, trimHeight }: {
  guides: SnapGuide[]; width: number; height: number;
  trimLeft: number; trimTop: number; trimWidth: number; trimHeight: number;
}) {
  return (
    <svg className="snap-guides" width={width} height={height}>
      {guides.map((guide) => {
        if (guide.target === "Equal gap") {
          return (
            <g key={`${guide.axis}-gap`} role="img" aria-label="Snap to Equal gap">
              {guide.gaps.map((gap) => {
                const x1 = trimLeft + (guide.axis === "x" ? gap.start : guide.cross) * trimWidth;
                const y1 = trimTop + (guide.axis === "y" ? gap.start : guide.cross) * trimHeight;
                const x2 = trimLeft + (guide.axis === "x" ? gap.end : guide.cross) * trimWidth;
                const y2 = trimTop + (guide.axis === "y" ? gap.end : guide.cross) * trimHeight;
                return (
                  <g key={gap.start}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} />
                    <line x1={x1 - (guide.axis === "y" ? 4 : 0)} y1={y1 - (guide.axis === "x" ? 4 : 0)}
                      x2={x1 + (guide.axis === "y" ? 4 : 0)} y2={y1 + (guide.axis === "x" ? 4 : 0)} />
                    <line x1={x2 - (guide.axis === "y" ? 4 : 0)} y1={y2 - (guide.axis === "x" ? 4 : 0)}
                      x2={x2 + (guide.axis === "y" ? 4 : 0)} y2={y2 + (guide.axis === "x" ? 4 : 0)} />
                    <text x={(x1 + x2) / 2 + 3} y={(y1 + y2) / 2 - 4}>=</text>
                  </g>
                );
              })}
            </g>
          );
        }
        const x = trimLeft + guide.position * trimWidth;
        const y = trimTop + guide.position * trimHeight;
        return (
          <g key={`${guide.axis}-${guide.position}`} role="img" aria-label={`Snap to ${guide.target}`}>
            {guide.axis === "x"
              ? <line x1={x} y1={trimTop} x2={x} y2={trimTop + trimHeight} />
              : <line x1={trimLeft} y1={y} x2={trimLeft + trimWidth} y2={y} />}
            <text x={guide.axis === "x" ? x + (guide.position > 0.8 ? -4 : 4) : trimLeft + 4}
              y={guide.axis === "x" ? trimTop + trimHeight - 6 : y + (guide.position < 0.5 ? 13 : -4)}
              textAnchor={guide.axis === "x" && guide.position > 0.8 ? "end" : "start"}>
              {guide.target}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
