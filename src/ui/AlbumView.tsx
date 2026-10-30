import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import {
  addPage, addPhotoSlot, albumSpreads, deletePage, deleteSlot, duplicatePage, movePage, moveSlot, pageDimensions,
  placePhoto, resizeSlot, type Album, type Crop, type PhotoPreviewPorts, type Slot,
} from "../core";
import { hasPhotoDrag, readPhotoDrag } from "./photoDrag";

interface Props {
  album: Album;
  onChange: (update: (album: Album) => Album) => void;
  disabled: boolean;
  root: string;
  photoPorts: PhotoPreviewPorts;
}

/** An in-progress mouse drag of a Slot, in screen pixels. */
interface SlotDrag {
  pageId: string;
  slotId: string;
  kind: "move" | "resize";
  dx: number;
  dy: number;
}

function applySlotDrag(album: Album, drag: SlotDrag, trimWidth: number, trimHeight: number): Album {
  const slot = album.pages.find((page) => page.id === drag.pageId)?.slots.find((item) => item.id === drag.slotId);
  if (!slot) return album;
  return drag.kind === "move"
    ? moveSlot(album, drag.pageId, drag.slotId, slot.x + drag.dx / trimWidth, slot.y + drag.dy / trimHeight)
    : resizeSlot(album, drag.pageId, drag.slotId, slot.width + drag.dx / trimWidth, slot.height + drag.dy / trimHeight);
}

export default function AlbumView({ album: savedAlbum, onChange, disabled, root, photoPorts }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const draggedId = useRef<string | null>(null);
  const stopSlotDrag = useRef<(() => void) | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(savedAlbum.pages[0].id);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [slotDrag, setSlotDrag] = useState<SlotDrag | null>(null);
  const dimensions = pageDimensions(savedAlbum.pageFormat);
  const { bleedMm, safeZoneMm } = savedAlbum.pageFormat;
  const fullWidth = dimensions.widthMm + 2 * bleedMm;
  const fullHeight = dimensions.heightMm + 2 * bleedMm;
  const gap = 18;
  const scale = Math.max(0, Math.min((viewport.width - 48 - gap) / (2 * fullWidth), (viewport.height - 48) / fullHeight));
  const pageWidth = fullWidth * scale;
  const pageHeight = fullHeight * scale;
  const originX = (viewport.width - 2 * pageWidth - gap) / 2;
  const originY = (viewport.height - pageHeight) / 2;

  const trimWidth = dimensions.widthMm * scale;
  const trimHeight = dimensions.heightMm * scale;
  const album = slotDrag && scale > 0 ? applySlotDrag(savedAlbum, slotDrag, trimWidth, trimHeight) : savedAlbum;
  const visiblePageIndex = Math.max(0, album.pages.findIndex((page) => page.id === selectedId));
  const selectedPage = album.pages[visiblePageIndex];
  const spreads = albumSpreads(album);
  const spreadIndex = spreads.findIndex((spread) => spread.left?.id === selectedPage.id || spread.right?.id === selectedPage.id);
  const spread = spreads[spreadIndex];
  const pageNumbers = new Map(album.pages.map((page, index) => [page.id, index + 1]));

  useEffect(() => {
    stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedPage.id, visiblePageIndex, album.startingSide]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function editPages(operation: (album: Album) => Album, nextIndex: number) {
    onChange((current) => {
      const updated = operation(current);
      setSelectedId(updated.pages[Math.min(nextIndex, updated.pages.length - 1)].id);
      return updated;
    });
  }

  useEffect(() => () => stopSlotDrag.current?.(), []);

  function slotRect(slot: Slot, trimLeft: number) {
    return {
      x: trimLeft + slot.x * trimWidth,
      y: originY + bleedMm * scale + slot.y * trimHeight,
      width: slot.width * trimWidth,
      height: slot.height * trimHeight,
    };
  }

  const selectedSlot = selectedPage.slots.find((slot) => slot.id === selectedSlotId) ?? null;

  function selectPage(pageId: string) {
    setSelectedId(pageId);
    setSelectedSlotId(null);
  }

  function selectSlot(pageId: string, slotId: string) {
    setSelectedId(pageId);
    setSelectedSlotId(slotId);
  }

  function startSlotDrag(event: ReactMouseEvent, pageId: string, slotId: string, kind: SlotDrag["kind"]) {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectSlot(pageId, slotId);
    if (disabled) return;
    event.preventDefault();
    stopSlotDrag.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const offset = (moved: MouseEvent): SlotDrag => ({
      pageId, slotId, kind, dx: moved.clientX - startX, dy: moved.clientY - startY,
    });
    const move = (moved: MouseEvent) => setSlotDrag(offset(moved));
    const up = (released: MouseEvent) => {
      stop();
      const drag = offset(released);
      if (drag.dx !== 0 || drag.dy !== 0) onChange((current) => applySlotDrag(current, drag, trimWidth, trimHeight));
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      stopSlotDrag.current = null;
      setSlotDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    stopSlotDrag.current = stop;
  }

  function removeSlot(pageId: string, slotId: string) {
    setSelectedSlotId(null);
    onChange((current) => deleteSlot(current, pageId, slotId));
  }

  return (
    <section className="album-editor" aria-label="Album Pages">
      <div className="page-toolbar">
        <label className="workspace-label">Page{" "}
          <select value={selectedPage.id} onChange={(event) => selectPage(event.target.value)}>
            {album.pages.map((page, index) => <option key={page.id} value={page.id}>{index + 1}</option>)}
          </select>
        </label>
        <button type="button" className="button-quiet" disabled={disabled || album.pages.length >= 10000}
          onClick={() => editPages((current) => addPage(current, selectedPage.id), visiblePageIndex + 1)}>Add Page</button>
        <button type="button" className="button-quiet" disabled={disabled || album.pages.length >= 10000}
          onClick={() => editPages((current) => duplicatePage(current, selectedPage.id), visiblePageIndex + 1)}>Duplicate Page</button>
        <button type="button" className="button-quiet" disabled={disabled || album.pages.length === 1}
          onClick={() => editPages((current) => deletePage(current, selectedPage.id), visiblePageIndex)}>Delete Page</button>
        <button type="button" className="button-quiet" aria-label="Move Page earlier" disabled={disabled || visiblePageIndex === 0}
          onClick={() => editPages((current) => movePage(current, selectedPage.id, visiblePageIndex - 1), visiblePageIndex - 1)}>
          Earlier
        </button>
        <button type="button" className="button-quiet" aria-label="Move Page later" disabled={disabled || visiblePageIndex === album.pages.length - 1}
          onClick={() => editPages((current) => movePage(current, selectedPage.id, visiblePageIndex + 1), visiblePageIndex + 1)}>
          Later
        </button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button type="button" className="button-quiet" disabled={disabled} onClick={() => {
          const pageId = selectedPage.id;
          const added = addPhotoSlot(album, pageId).pages.find((page) => page.id === pageId)!.slots.at(-1)!;
          onChange((current) => addPhotoSlot(current, pageId));
          setSelectedSlotId(added.id);
        }}>Add Photo Slot</button>
        <button type="button" className="button-quiet" disabled={disabled || !selectedSlot}
          onClick={() => selectedSlot && removeSlot(selectedPage.id, selectedSlot.id)}>Delete Slot</button>
      </div>
      <div className="canvas-viewport" ref={viewportRef} role="group" aria-label="Spread editor">
        {viewport.width > 0 && viewport.height > 0 && (
          <Stage width={viewport.width} height={viewport.height}>
            <Layer>
              {[spread.left, spread.right].map((page, side) => page && (
                <LayerPage key={page.id} x={originX + side * (pageWidth + gap)} y={originY}
                  width={pageWidth} height={pageHeight} bleed={bleedMm * scale}
                  safeZone={safeZoneMm * scale}>
                  {page.slots.map((slot) => {
                    const rect = slotRect(slot, originX + side * (pageWidth + gap) + bleedMm * scale);
                    return slot.placement ? (
                      <PlacementImage key={slot.id} {...rect} crop={slot.placement.crop}
                        root={root} path={slot.placement.photoPath} photoPorts={photoPorts} />
                    ) : <Rect key={slot.id} {...rect} fill="#e8ebe6" stroke="#9aa49c" strokeWidth={1} dash={[4, 3]} />;
                  })}
                </LayerPage>
              ))}
            </Layer>
          </Stage>
        )}
        {[spread.left, spread.right].map((page, side) => {
          const style = {
            left: originX + side * (pageWidth + gap), top: originY, width: pageWidth, height: pageHeight,
          };
          return page ? (
            <button type="button" className="canvas-page-hit" key={page.id} style={style}
              aria-label={`Select Page ${pageNumbers.get(page.id)}`} aria-pressed={page.id === selectedPage.id}
              onClick={() => selectPage(page.id)}>
              <span className="canvas-page-number">Page {pageNumbers.get(page.id)}</span>
            </button>
          ) : (
            <div className="canvas-blocked-page" key={`blocked-${side}`} style={style}>
              {spreadIndex === 0 ? "Inside cover" : "No Page"}
            </div>
          );
        })}
        {scale > 0 && [spread.left, spread.right].map((page, side) => page?.slots.map((slot, index) => {
          const rect = slotRect(slot, originX + side * (pageWidth + gap) + bleedMm * scale);
          const name = `Page ${pageNumbers.get(page.id)} Photo Slot ${index + 1}`;
          return (
            <div key={`${page.id}:${slot.id}`} className="slot-overlay" role="button" tabIndex={0}
              aria-label={name} aria-pressed={page.id === selectedPage.id && slot.id === selectedSlot?.id}
              title={slot.placement?.photoPath ?? "Drag a Photo here"}
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "move")}
              onClick={(event) => {
                event.stopPropagation();
                selectSlot(page.id, slot.id);
              }}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  selectSlot(page.id, slot.id);
                } else if ((event.key === "Delete" || event.key === "Backspace") && !disabled) {
                  event.preventDefault();
                  removeSlot(page.id, slot.id);
                }
              }}
              onDragOver={(event) => {
                if (disabled || !hasPhotoDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                const photo = readPhotoDrag(event.dataTransfer);
                if (disabled || !photo) return;
                event.preventDefault();
                try {
                  placePhoto(album, page.id, slot.id, photo);
                } catch {
                  return; // Not a valid Photo, e.g. a forged drag payload.
                }
                selectSlot(page.id, slot.id);
                onChange((current) => placePhoto(current, page.id, slot.id, photo));
              }}>
              {!disabled && (
                <span className="slot-resize-handle" aria-label={`Resize ${name}`} role="button"
                  onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "resize")} />
              )}
            </div>
          );
        }))}
      </div>
      <div className="workspace-footer">
        <span>PAGE {visiblePageIndex + 1} OF {album.pages.length}</span>
        <span className="guide-legend"><span>Bleed: {bleedMm} mm</span><span>Trim edge</span><span>Safe Zone: {safeZoneMm} mm</span></span>
      </div>
      <nav className="spread-strip" aria-label="Spreads" ref={stripRef} onDragOver={(event) => {
        if (disabled || !draggedId.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left + 32) event.currentTarget.scrollLeft -= 16;
        else if (event.clientX > bounds.right - 32) event.currentTarget.scrollLeft += 16;
      }}>
        {spreads.map((item, index) => (
          <div className="spread-thumbnail" key={index} role="group" aria-label={`Spread ${index + 1}`}>
            {[item.left, item.right].map((page, side) => page ? (
              <button type="button" key={page.id} className="page-thumbnail"
                style={{ aspectRatio: `${dimensions.widthMm} / ${dimensions.heightMm}` }}
                aria-label={`Select Page ${pageNumbers.get(page.id)}`} aria-pressed={page.id === selectedPage.id}
                draggable={!disabled}
                onDragStart={(event) => {
                  if (disabled) { event.preventDefault(); return; }
                  draggedId.current = page.id;
                  setSelectedId(page.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", page.id);
                }}
                onDragOver={(event) => {
                  if (disabled || !draggedId.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (disabled || !draggedId.current) return;
                  event.preventDefault();
                  const id = draggedId.current;
                  draggedId.current = null;
                  onChange((current) => movePage(current, id, current.pages.findIndex((target) => target.id === page.id)));
                }}
                onDragEnd={() => { draggedId.current = null; }}
                onClick={() => setSelectedId(page.id)}>{pageNumbers.get(page.id)}</button>
            ) : (
              <span key={`blocked-${side}`} className="page-thumbnail page-thumbnail-blocked">
                {index === 0 ? "Inside cover" : "No Page"}
              </span>
            ))}
          </div>
        ))}
      </nav>
    </section>
  );
}

function LayerPage({ x, y, width, height, bleed, safeZone, children }: {
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

/** Draws a Placement from its cached preview; originals are only used by Page Export. */
function PlacementImage({ x, y, width, height, crop, root, path, photoPorts }: {
  x: number; y: number; width: number; height: number; crop: Crop;
  root: string; path: string; photoPorts: PhotoPreviewPorts;
}) {
  const [preview, setPreview] = useState<{ path: string; image: HTMLImageElement | null } | null>(null);
  useEffect(() => {
    let active = true;
    photoPorts.preview(root, path).then((url) => {
      const image = new Image();
      image.onload = () => { if (active) setPreview({ path, image }); };
      image.onerror = () => { if (active) setPreview({ path, image: null }); };
      image.src = url;
    }).catch((cause: unknown) => {
      console.error(`Could not load the preview of ${path}`, cause);
      if (active) setPreview({ path, image: null });
    });
    return () => { active = false; };
  }, [root, path, photoPorts]);

  const image = preview?.path === path ? preview.image : undefined;
  if (!image) {
    return <Rect x={x} y={y} width={width} height={height} fill={image === null ? "#efe1da" : "#eef0ec"} />;
  }
  return (
    <KonvaImage image={image} x={x} y={y} width={width} height={height} crop={{
      x: crop.x * image.naturalWidth,
      y: crop.y * image.naturalHeight,
      width: crop.width * image.naturalWidth,
      height: crop.height * image.naturalHeight,
    }} />
  );
}
