import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import {
  addPage, addPhotoSlot, albumSpreads, deletePage, deleteSlot, duplicatePage, movePage, moveSlot, pageDimensions,
  fitPhotoRect, panCrop, placePhoto, placePhotoOnPage, placementDisplayCrop, resizeSlot, setPlacementCrop,
  setPlacementFit, zoomCrop, type Album, type Crop, type PhotoPreviewPorts, type Slot,
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
  const cropZoomTimer = useRef<number | null>(null);
  const cropPreviewRef = useRef<{ pageId: string; slotId: string; crop: Crop } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(savedAlbum.pages[0].id);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [slotDrag, setSlotDrag] = useState<SlotDrag | null>(null);
  const [cropPreview, setCropPreview] = useState<{ pageId: string; slotId: string; crop: Crop } | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [thumbnailBySlot, setThumbnailBySlot] = useState<Record<string, string>>({});
  const [previewStates, setPreviewStates] = useState<Record<string, {
    path: string; status: "loading" | "ready" | "error"; attempt: number;
  }>>({});
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
  const album = cropPreview
    ? setPlacementCrop(savedAlbum, cropPreview.pageId, cropPreview.slotId, cropPreview.crop)
    : slotDrag && scale > 0 ? applySlotDrag(savedAlbum, slotDrag, trimWidth, trimHeight) : savedAlbum;
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

  function updateCropPreview(next: { pageId: string; slotId: string; crop: Crop } | null) {
    cropPreviewRef.current = next;
    setCropPreview(next);
  }

  function commitCropPreview() {
    if (cropZoomTimer.current !== null) {
      window.clearTimeout(cropZoomTimer.current);
      cropZoomTimer.current = null;
    }
    const pending = cropPreviewRef.current;
    if (!pending) return;
    updateCropPreview(null);
    onChange((current) => setPlacementCrop(current, pending.pageId, pending.slotId, pending.crop));
  }

  useEffect(() => {
    const startPhotoDrag = (event: DragEvent) => {
      if (!event.dataTransfer || !hasPhotoDrag(event.dataTransfer)) return;
      setPhotoDragActive(true);
      setDropTargetId(null);
    };
    const clearPhotoDrag = () => {
      setPhotoDragActive(false);
      setDropTargetId(null);
    };
    window.addEventListener("dragstart", startPhotoDrag);
    window.addEventListener("dragend", clearPhotoDrag);
    return () => {
      window.removeEventListener("dragstart", startPhotoDrag);
      window.removeEventListener("dragend", clearPhotoDrag);
    };
  }, []);

  function slotRect(slot: Slot, trimLeft: number) {
    return {
      x: trimLeft + slot.x * trimWidth,
      y: originY + bleedMm * scale + slot.y * trimHeight,
      width: slot.width * trimWidth,
      height: slot.height * trimHeight,
    };
  }

  const selectedSlot = selectedPage.slots.find((slot) => slot.id === selectedSlotId) ?? null;

  const reportPreviewStatus = useCallback((slotId: string, path: string, status: "loading" | "ready" | "error") => {
    setPreviewStates((current) => {
      const previous = current[slotId];
      if (previous?.path === path && previous.status === status) return current;
      return {
        ...current,
        [slotId]: { path, status, attempt: previous?.path === path ? previous.attempt : 0 },
      };
    });
    if (status === "ready") {
      setThumbnailBySlot((current) => {
        if (!(slotId in current)) return current;
        const next = { ...current };
        delete next[slotId];
        return next;
      });
    }
  }, []);

  function rememberThumbnail(slotId: string, thumbnail?: string) {
    setThumbnailBySlot((current) => {
      const next = { ...current };
      if (thumbnail?.startsWith("data:image/")) next[slotId] = thumbnail;
      else delete next[slotId];
      return next;
    });
  }

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
    const slot = album.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slotId);
    if (cropMode && kind === "move" && slot?.placement && !slot.placement.fit) {
      const startX = event.clientX;
      const startY = event.clientY;
      const baseCrop = slot.placement.crop;
      const rect = event.currentTarget.getBoundingClientRect();
      let nextCrop = baseCrop;
      const move = (moved: MouseEvent) => {
        nextCrop = panCrop(baseCrop,
          -(moved.clientX - startX) / rect.width * baseCrop.width,
          -(moved.clientY - startY) / rect.height * baseCrop.height);
        updateCropPreview({ pageId, slotId, crop: nextCrop });
      };
      const up = (released: MouseEvent) => {
        move(released);
        stop();
        if (nextCrop.x !== baseCrop.x || nextCrop.y !== baseCrop.y) {
          updateCropPreview(null);
          onChange((current) => setPlacementCrop(current, pageId, slotId, nextCrop));
        }
      };
      const stop = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        stopSlotDrag.current = null;
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      stopSlotDrag.current = stop;
      return;
    }
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

  function zoomPlacement(event: React.WheelEvent, pageId: string, slotId: string) {
    const slot = album.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slotId);
    const deltaY = event.nativeEvent.deltaY;
    if (disabled || !slot?.placement || slot.placement.fit || deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const previous = cropPreviewRef.current?.pageId === pageId && cropPreviewRef.current.slotId === slotId
      ? cropPreviewRef.current.crop : slot.placement.crop;
    const crop = zoomCrop(previous, Math.exp(-deltaY * 0.002));
    updateCropPreview({ pageId, slotId, crop });
    if (cropZoomTimer.current !== null) window.clearTimeout(cropZoomTimer.current);
    cropZoomTimer.current = window.setTimeout(commitCropPreview, 220);
  }

  function zoomPlacementBy(pageId: string, slotId: string, factor: number) {
    onChange((current) => {
      const placement = current.pages.find((page) => page.id === pageId)?.slots.find((slot) => slot.id === slotId)?.placement;
      return placement && !placement.fit
        ? setPlacementCrop(current, pageId, slotId, zoomCrop(placement.crop, factor))
        : current;
    });
  }

  function removeSlot(pageId: string, slotId: string) {
    setSelectedSlotId(null);
    onChange((current) => deleteSlot(current, pageId, slotId));
  }

  return (
    <section className="album-editor" aria-label="Album Pages" onDragOver={(event) => {
      if (disabled || !hasPhotoDrag(event.dataTransfer)) return;
      if (event.target instanceof Element && event.target.closest(".slot-overlay, .canvas-page-hit")) return;
      setPhotoDragActive(true);
      setDropTargetId(null);
    }}>
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
        {selectedSlot?.placement && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />
            <label className="workspace-label">
              <input type="checkbox" aria-label="Fit Photo" disabled={disabled}
                checked={selectedSlot.placement.fit} onChange={(event) => {
                  setCropMode(false);
                  onChange((current) => setPlacementFit(current, selectedPage.id, selectedSlot.id, event.target.checked));
                }} /> Fit
            </label>
            <label className="workspace-label" title="Drag the Photo to pan; use the mouse wheel to zoom.">
              <input type="checkbox" aria-label="Crop photo" disabled={disabled || selectedSlot.placement.fit}
                checked={cropMode} onChange={(event) => setCropMode(event.target.checked)} /> Crop photo
            </label>
            <button type="button" className="button-quiet" aria-label="Zoom out" title="Zoom out"
              disabled={disabled || selectedSlot.placement.fit}
              onClick={() => zoomPlacementBy(selectedPage.id, selectedSlot.id, 1 / 1.2)}>Zoom out</button>
            <button type="button" className="button-quiet" aria-label="Zoom in" title="Zoom in"
              disabled={disabled || selectedSlot.placement.fit}
              onClick={() => zoomPlacementBy(selectedPage.id, selectedSlot.id, 1.2)}>Zoom in</button>
          </>
        )}
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
                    const slotId = `${page.id}:${slot.id}`;
                    return slot.placement ? (
                      <PlacementImage key={slotId} {...rect} crop={placementDisplayCrop(slot.placement)} fit={slot.placement.fit}
                        root={root} path={slot.placement.photoPath} photoPorts={photoPorts}
                        thumbnail={thumbnailBySlot[slotId]} attempt={previewStates[slotId]?.path === slot.placement.photoPath
                          ? previewStates[slotId].attempt : 0}
                        slotId={slotId} onStatus={reportPreviewStatus} />
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
              onDragOver={(event) => {
                if (disabled || !hasPhotoDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setPhotoDragActive(true);
                setDropTargetId(null);
              }}
              onDrop={(event) => {
                const photo = readPhotoDrag(event.dataTransfer);
                if (disabled || !photo || scale <= 0) return;
                event.preventDefault();
                setPhotoDragActive(false);
                setDropTargetId(null);
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = (event.clientX - bounds.left - bleedMm * scale) / trimWidth;
                const y = (event.clientY - bounds.top - bleedMm * scale) / trimHeight;
                try {
                  const updated = placePhotoOnPage(album, page.id, photo, x, y);
                  const slotId = updated.pages.find((item) => item.id === page.id)!.slots.at(-1)!.id;
                  rememberThumbnail(`${page.id}:${slotId}`, photo.thumbnail);
                  onChange((current) => placePhotoOnPage(current, page.id, photo, x, y));
                  selectSlot(page.id, slotId);
                } catch {
                  return; // Not a valid Photo or drop point, e.g. a forged drag payload.
                }
              }}
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
          const targetId = `${page.id}:${slot.id}`;
          const previewState = slot.placement && previewStates[targetId]?.path === slot.placement.photoPath
            ? previewStates[targetId] : undefined;
          const previewStatus = previewState?.status ?? "loading";
          return (
            <Fragment key={targetId}>
            <div className={`slot-overlay${photoDragActive ? " slot-overlay--dragging" : ""}${dropTargetId === targetId ? " slot-overlay--drop-target" : ""}${cropMode && slot.placement && !slot.placement.fit ? " slot-overlay--crop-mode" : ""}`} role="button" tabIndex={0}
              aria-label={name} aria-pressed={page.id === selectedPage.id && slot.id === selectedSlot?.id}
              title={slot.placement?.photoPath ?? "Drag a Photo here"}
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "move")}
              onWheelCapture={(event) => zoomPlacement(event, page.id, slot.id)}
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
                setPhotoDragActive(true);
                setDropTargetId(targetId);
              }}
              onDrop={(event) => {
                const photo = readPhotoDrag(event.dataTransfer);
                if (disabled || !photo) return;
                event.preventDefault();
                setPhotoDragActive(false);
                setDropTargetId(null);
                try {
                  placePhoto(album, page.id, slot.id, photo);
                } catch {
                  return; // Not a valid Photo, e.g. a forged drag payload.
                }
                rememberThumbnail(targetId, photo.thumbnail);
                selectSlot(page.id, slot.id);
                onChange((current) => placePhoto(current, page.id, slot.id, photo));
              }}>
              {dropTargetId === targetId && (
                <span className="slot-drop-label">{slot.placement ? "Replace Photo" : "Place Photo"}</span>
              )}
              {!disabled && (
                <span className="slot-resize-handle" aria-label={`Resize ${name}`} role="button"
                  onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "resize")} />
              )}
            </div>
            {slot.placement && previewStatus !== "ready" && (
              <div className="slot-preview-status" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                aria-busy={previewStatus === "loading"}>
                {previewStatus === "loading" ? (
                  <span className="preview-spinner" role="status" aria-label="Loading Photo preview" />
                ) : (
                  <div className="slot-preview-error" role="alert">
                    <span>Couldn't load Photo</span>
                    <button type="button" className="button-quiet" onClick={() => {
                      setPreviewStates((current) => ({
                        ...current,
                        [targetId]: {
                          path: slot.placement!.photoPath,
                          status: "loading",
                          attempt: (current[targetId]?.path === slot.placement!.photoPath
                            ? current[targetId].attempt : 0) + 1,
                        },
                      }));
                    }}>Retry</button>
                  </div>
                )}
              </div>
            )}
            </Fragment>
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
function PlacementImage({ x, y, width, height, crop, fit, root, path, photoPorts, thumbnail, attempt, slotId, onStatus }: {
  x: number; y: number; width: number; height: number; crop: Crop; fit: boolean;
  root: string; path: string; photoPorts: PhotoPreviewPorts;
  thumbnail?: string; attempt: number; slotId: string;
  onStatus: (slotId: string, path: string, status: "loading" | "ready" | "error") => void;
}) {
  const [preview, setPreview] = useState<{ path: string; attempt: number; image: HTMLImageElement | null } | null>(null);
  const [thumbnailImage, setThumbnailImage] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    let active = true;
    onStatus(slotId, path, "loading");
    photoPorts.preview(root, path).then((url) => {
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        setPreview({ path, attempt, image });
        onStatus(slotId, path, "ready");
      };
      image.onerror = () => {
        if (!active) return;
        setPreview({ path, attempt, image: null });
        onStatus(slotId, path, "error");
      };
      image.src = url;
    }).catch((cause: unknown) => {
      console.error(`Could not load the preview of ${path}`, cause);
      if (active) {
        setPreview({ path, attempt, image: null });
        onStatus(slotId, path, "error");
      }
    });
    return () => { active = false; };
  }, [root, path, photoPorts, attempt, slotId, onStatus]);

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailImage(null);
      return;
    }
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setThumbnailImage({ url: thumbnail, image }); };
    image.onerror = () => { if (active) setThumbnailImage(null); };
    image.src = thumbnail;
    return () => { active = false; };
  }, [thumbnail]);

  const image = preview?.path === path && preview.attempt === attempt ? preview.image : undefined;
  const visibleImage = image ?? (thumbnailImage && thumbnailImage.url === thumbnail ? thumbnailImage.image : null);
  if (!visibleImage) {
    return <Rect x={x} y={y} width={width} height={height} fill={image === null ? "#efe1da" : "#eef0ec"} />;
  }
  const fitBounds = fit ? fitPhotoRect(visibleImage.naturalWidth / visibleImage.naturalHeight, width / height) : null;
  const imageX = fitBounds ? x + fitBounds.x * width : x;
  const imageY = fitBounds ? y + fitBounds.y * height : y;
  const imageWidth = fitBounds ? fitBounds.width * width : width;
  const imageHeight = fitBounds ? fitBounds.height * height : height;
  return (
    <>
      {fit && <Rect x={x} y={y} width={width} height={height} fill="#ffffff" />}
      <KonvaImage image={visibleImage} x={imageX} y={imageY} width={imageWidth} height={imageHeight}
        opacity={image ? 1 : 0.45} crop={{
          x: crop.x * visibleImage.naturalWidth,
          y: crop.y * visibleImage.naturalHeight,
          width: crop.width * visibleImage.naturalWidth,
          height: crop.height * visibleImage.naturalHeight,
        }} />
    </>
  );
}
