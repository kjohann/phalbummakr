import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import {
  addPage, addPhotoSlot, addTextSlot, albumSpreads, deletePage, deleteSlot, duplicatePage, movePage, moveSlot, pageDimensions,
  fitPhotoRect, panCrop, placePhoto, placePhotoOnPage, placementDisplayCrop, photoUsage, removePlacement, resizeSlot, rotateSlot, setPlacementCrop,
  setPlacementFit, setSlotText, setTextStyle, swapPlacements, zoomCrop, POINTS_PER_MM, TEXT_LINE_HEIGHT,
  type Album, type Crop, type PageFormat, type PhotoPreviewPorts, type Rectangle, type Slot, type SlotAddress, type TextSlot, type TextStyle,
} from "../core";
import { hasPhotoDrag, readPhotoDrag } from "./photoDrag";
import { snapSlot, type SnapGuide } from "./slotSnapping";
import type { FontPorts } from "./tauriFontPorts";
import { fitTextSlots, measureTextSlot, textFontStyle } from "./textLayout";
import TextSlotControls from "./TextSlotControls";

const PLACEMENT_DRAG_TYPE = "application/x-phalbummakr-placement";

function hasPlacementDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(PLACEMENT_DRAG_TYPE);
}

interface Props {
  album: Album;
  onChange: (update: (album: Album) => Album) => void;
  disabled: boolean;
  textDisabled: boolean;
  root: string;
  photoPorts: PhotoPreviewPorts;
  fontPorts: FontPorts;
  onDuplicatePhoto: (path: string) => void;
  onCropPendingChange: (pending: boolean) => void;
}

/** An in-progress mouse drag of a Slot, in screen pixels. */
interface SlotDrag {
  pageId: string;
  slotId: string;
  kind: "move" | "resize";
  dx: number;
  dy: number;
  bypass: boolean;
}

function applySlotDrag(album: Album, drag: SlotDrag, trimWidth: number, trimHeight: number): {
  album: Album;
  guides: SnapGuide[];
} {
  const slot = album.pages.find((page) => page.id === drag.pageId)?.slots.find((item) => item.id === drag.slotId);
  if (!slot) return { album, guides: [] };
  const unclamped = drag.kind === "move"
    ? { ...slot, x: slot.x + drag.dx / trimWidth, y: slot.y + drag.dy / trimHeight }
    : { ...slot, width: slot.width + drag.dx / trimWidth, height: slot.height + drag.dy / trimHeight };
  const apply = (rect: Rectangle) => drag.kind === "move"
    ? moveSlot(album, drag.pageId, drag.slotId, rect.x, rect.y)
    : resizeSlot(album, drag.pageId, drag.slotId, rect.width, rect.height);
  const updated = fitTextSlots(apply(unclamped), album);
  if (drag.bypass) return { album: updated, guides: [] };
  const page = updated.pages.find((item) => item.id === drag.pageId)!;
  const proposed = page.slots.find((item) => item.id === drag.slotId)!;
  const dimensions = pageDimensions(album.pageFormat);
  const sidewaysText = slot.type === "text" && (slot.rotation === 90 || slot.rotation === 270);
  const property = (axis: "x" | "y") => drag.kind === "move" ? axis : axis === "x" ? "width" : "height";
  const snapped = snapSlot({
    rect: proposed,
    unclamped,
    pageSize: { width: trimWidth, height: trimHeight },
    safeZone: { x: album.pageFormat.safeZoneMm / dimensions.widthMm, y: album.pageFormat.safeZoneMm / dimensions.heightMm },
    otherSlots: page.slots.filter((item) => item.id !== drag.slotId),
    kind: drag.kind,
    resizeWidth: !sidewaysText,
    resizeHeight: slot.type === "photo" || sidewaysText,
    project: (rect) => {
      const candidate = fitTextSlots(apply(rect), album);
      return candidate.pages.find((item) => item.id === drag.pageId)!.slots.find((item) => item.id === drag.slotId)!;
    },
  });
  const result = fitTextSlots(apply(snapped.rect), album);
  const actual = result.pages.find((item) => item.id === drag.pageId)!.slots.find((item) => item.id === drag.slotId)!;
  return {
    album: result,
    guides: snapped.guides.filter((guide) => {
      const key = property(guide.axis);
      return Math.abs(actual[key] - snapped.rect[key]) < 1e-9;
    }),
  };
}

export default function AlbumView({ album: savedAlbum, onChange, disabled, textDisabled, root, photoPorts, fontPorts, onDuplicatePhoto, onCropPendingChange }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const selectedSlotOverlayRef = useRef<HTMLDivElement>(null);
  const draggedId = useRef<string | null>(null);
  const draggedPlacement = useRef<SlotAddress | null>(null);
  const stopSlotDrag = useRef<(() => void) | null>(null);
  const cropZoomTimer = useRef<number | null>(null);
  const cropPreviewRef = useRef<{ pageId: string; slotId: string; crop: Crop } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(savedAlbum.pages[0].id);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [fonts, setFonts] = useState<string[] | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [fontRetry, setFontRetry] = useState(0);
  const [overflowSlots, setOverflowSlots] = useState<Record<string, boolean>>({});
  const [slotDrag, setSlotDrag] = useState<SlotDrag | null>(null);
  const [cropPreview, setCropPreview] = useState<{ pageId: string; slotId: string; crop: Crop } | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [replaceSource, setReplaceSource] = useState<SlotAddress | null>(null);
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
  const dragPreview = slotDrag && scale > 0 ? applySlotDrag(savedAlbum, slotDrag, trimWidth, trimHeight) : null;
  const album = cropPreview
    ? setPlacementCrop(savedAlbum, cropPreview.pageId, cropPreview.slotId, cropPreview.crop)
    : dragPreview?.album ?? savedAlbum;
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
    changeAlbum((current) => {
      const updated = operation(current);
      selectPage(updated.pages[Math.min(nextIndex, updated.pages.length - 1)].id);
      return updated;
    });
  }

  useEffect(() => () => {
    stopSlotDrag.current?.();
    if (cropZoomTimer.current !== null) window.clearTimeout(cropZoomTimer.current);
  }, []);

  function updateCropPreview(next: { pageId: string; slotId: string; crop: Crop } | null) {
    if (next) setReplaceSource(null);
    const changed = (cropPreviewRef.current !== null) !== (next !== null);
    cropPreviewRef.current = next;
    setCropPreview(next);
    if (changed) onCropPendingChange(next !== null);
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

  function changeAlbum(update: (album: Album) => Album) {
    setReplaceSource(null);
    commitCropPreview();
    onChange((current) => fitTextSlots(update(current), current));
  }

  useEffect(() => {
    const startPhotoDrag = (event: DragEvent) => {
      if (!event.dataTransfer || (!hasPhotoDrag(event.dataTransfer) && !hasPlacementDrag(event.dataTransfer))) return;
      setPhotoDragActive(true);
      setDropTargetId(null);
    };
    const clearPhotoDrag = () => {
      setPhotoDragActive(false);
      setDropTargetId(null);
      draggedPlacement.current = null;
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

  useEffect(() => {
    if (selectedSlot?.type !== "text" || fonts !== null) return;
    let active = true;
    fontPorts.list().then((names) => {
      if (active) {
        setFonts(names);
        setFontError(null);
      }
    }).catch((cause: unknown) => {
      if (active) setFontError(`Could not list system fonts: ${String(cause)}`);
    });
    return () => { active = false; };
  }, [selectedSlot?.type, fontPorts, fonts, fontRetry]);

  const reportTextOverflow = useCallback((id: string, overflow: boolean) => {
    setOverflowSlots((current) => current[id] === overflow ? current : { ...current, [id]: overflow });
  }, []);

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
    setReplaceSource(null);
    setSelectedId(pageId);
    setSelectedSlotId(null);
    setEditingText(null);
  }

  function selectSlot(pageId: string, slotId: string) {
    setReplaceSource(null);
    if (pageId !== selectedId || slotId !== selectedSlotId) setEditingText(null);
    setSelectedId(pageId);
    setSelectedSlotId(slotId);
  }

  function startSlotDrag(event: ReactMouseEvent, pageId: string, slotId: string, kind: SlotDrag["kind"]) {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectSlot(pageId, slotId);
    if (disabled) return;
    event.preventDefault();
    commitCropPreview();
    stopSlotDrag.current?.();
    const slot = album.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slotId);
    if (cropMode && kind === "move" && slot?.placement && !slot.placement.fit) {
      const startX = event.clientX;
      const startY = event.clientY;
      const baseCrop = slot.placement.crop;
      const rect = event.currentTarget.getBoundingClientRect();
      let nextCrop = baseCrop;
      updateCropPreview({ pageId, slotId, crop: baseCrop });
      const move = (moved: MouseEvent) => {
        const dx = (moved.clientX - startX) / rect.width;
        const dy = (moved.clientY - startY) / rect.height;
        const [localX, localY] = slot.rotation === 90 ? [dy, -dx]
          : slot.rotation === 180 ? [-dx, -dy]
            : slot.rotation === 270 ? [-dy, dx] : [dx, dy];
        nextCrop = panCrop(baseCrop, -localX * baseCrop.width, -localY * baseCrop.height);
        updateCropPreview({ pageId, slotId, crop: nextCrop });
      };
      const finish = () => {
        stop();
        updateCropPreview(null);
        if (nextCrop.x !== baseCrop.x || nextCrop.y !== baseCrop.y) {
          changeAlbum((current) => setPlacementCrop(current, pageId, slotId, nextCrop));
        }
      };
      const up = (released: MouseEvent) => {
        move(released);
        finish();
      };
      const stop = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("blur", finish);
        stopSlotDrag.current = null;
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("blur", finish);
      stopSlotDrag.current = stop;
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const sidewaysText = slot?.type === "text" && (slot.rotation === 90 || slot.rotation === 270);
    let latest: SlotDrag = { pageId, slotId, kind, dx: 0, dy: 0, bypass: event.altKey };
    const offset = (moved: MouseEvent): SlotDrag => ({
      pageId, slotId, kind, dx: kind === "resize" && sidewaysText ? 0 : moved.clientX - startX,
      dy: kind === "resize" && slot?.type === "text" && !sidewaysText ? 0 : moved.clientY - startY,
      bypass: moved.altKey,
    });
    const move = (moved: MouseEvent) => {
      latest = offset(moved);
      setSlotDrag(latest.dx !== 0 || latest.dy !== 0 ? latest : null);
    };
    const modifier = (pressed: KeyboardEvent) => {
      if (pressed.key !== "Alt") return;
      if (pressed.type === "keydown") pressed.preventDefault();
      latest = { ...latest, bypass: pressed.type === "keydown" };
      if (latest.dx !== 0 || latest.dy !== 0) setSlotDrag(latest);
    };
    const finish = (drag: SlotDrag) => {
      stop();
      if (drag.dx !== 0 || drag.dy !== 0) changeAlbum((current) => applySlotDrag(current, drag, trimWidth, trimHeight).album);
    };
    const up = (released: MouseEvent) => finish(offset(released));
    const blur = () => finish(latest);
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", modifier);
      window.removeEventListener("keyup", modifier);
      window.removeEventListener("blur", blur);
      stopSlotDrag.current = null;
      setSlotDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", modifier);
    window.addEventListener("keyup", modifier);
    window.addEventListener("blur", blur);
    stopSlotDrag.current = stop;
  }

  function zoomPlacement(event: WheelEvent, pageId: string, slotId: string) {
    const slot = album.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slotId);
    const deltaY = event.deltaY;
    if (disabled || !slot?.placement || slot.placement.fit || deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (cropPreviewRef.current && (cropPreviewRef.current.pageId !== pageId || cropPreviewRef.current.slotId !== slotId)) {
      commitCropPreview();
    }
    const previous = cropPreviewRef.current?.pageId === pageId && cropPreviewRef.current.slotId === slotId
      ? cropPreviewRef.current.crop : slot.placement.crop;
    const crop = zoomCrop(previous, Math.exp(-deltaY * 0.002));
    updateCropPreview({ pageId, slotId, crop });
    if (cropZoomTimer.current !== null) window.clearTimeout(cropZoomTimer.current);
    cropZoomTimer.current = window.setTimeout(commitCropPreview, 220);
  }

  useEffect(() => {
    const overlay = selectedSlotOverlayRef.current;
    if (!cropMode || !selectedSlot || !overlay) return;
    const handleWheel = (event: WheelEvent) => zoomPlacement(event, selectedPage.id, selectedSlot.id);
    overlay.addEventListener("wheel", handleWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", handleWheel);
  });

  function zoomPlacementBy(pageId: string, slotId: string, factor: number) {
    changeAlbum((current) => {
      const placement = current.pages.find((page) => page.id === pageId)?.slots.find((slot) => slot.id === slotId)?.placement;
      return placement && !placement.fit
        ? setPlacementCrop(current, pageId, slotId, zoomCrop(placement.crop, factor))
        : current;
    });
  }

  function removeSlot(pageId: string, slotId: string) {
    setSelectedSlotId(null);
    setEditingText(null);
    changeAlbum((current) => deleteSlot(current, pageId, slotId));
  }

  function changeTextStyle(style: Partial<TextStyle>) {
    if (selectedSlot?.type !== "text") return;
    changeAlbum((current) => setTextStyle(current, selectedPage.id, selectedSlot.id, { ...selectedSlot.style, ...style }));
  }

  function toggleTextShortcut(event: ReactKeyboardEvent, pageId: string, slot: Slot): boolean {
    if (slot.type !== "text" || textDisabled || event.altKey || (!event.ctrlKey && !event.metaKey)) return false;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i" && key !== "u") return false;
    event.preventDefault();
    event.stopPropagation();
    selectSlot(pageId, slot.id);
    const property = key === "b" ? "bold" : key === "i" ? "italic" : "underline";
    changeAlbum((current) => {
      const currentSlot = current.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slot.id);
      if (currentSlot?.type !== "text") throw new Error("Text Slot not found on Page.");
      return setTextStyle(current, pageId, slot.id, { ...currentSlot.style, [property]: !currentSlot.style[property] });
    });
    return true;
  }

  return (
    <section className="album-editor" aria-label="Album Pages" onDragOver={(event) => {
      if (disabled || (!hasPhotoDrag(event.dataTransfer) && !hasPlacementDrag(event.dataTransfer))) return;
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
          changeAlbum((current) => addPhotoSlot(current, pageId));
          setSelectedSlotId(added.id);
          setEditingText(null);
        }}>Add Photo Slot</button>
        <button type="button" className="button-quiet" disabled={disabled} onClick={() => {
          const pageId = selectedPage.id;
          const added = addTextSlot(album, pageId).pages.find((page) => page.id === pageId)!.slots.at(-1)!;
          changeAlbum((current) => addTextSlot(current, pageId));
          setSelectedSlotId(added.id);
          setEditingText(`${pageId}:${added.id}`);
        }}>Add Text Slot</button>
        <button type="button" className="button-quiet" disabled={disabled || !selectedSlot}
          onClick={() => selectedSlot && removeSlot(selectedPage.id, selectedSlot.id)}>Delete Slot</button>
        <button type="button" className="button-quiet" aria-label="Rotate Slot counterclockwise" disabled={disabled || !selectedSlot}
          onClick={() => selectedSlot && changeAlbum((current) => rotateSlot(current, selectedPage.id, selectedSlot.id, -90))}>Rotate left</button>
        <button type="button" className="button-quiet" aria-label="Rotate Slot clockwise" disabled={disabled || !selectedSlot}
          onClick={() => selectedSlot && changeAlbum((current) => rotateSlot(current, selectedPage.id, selectedSlot.id, 90))}>Rotate right</button>
        {selectedSlot?.placement && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />
            <label className="workspace-label">
              <input type="checkbox" aria-label="Fit Photo" disabled={disabled}
                checked={selectedSlot.placement.fit} onChange={(event) => {
                  setCropMode(false);
                  changeAlbum((current) => setPlacementFit(current, selectedPage.id, selectedSlot.id, event.target.checked));
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
        {replaceSource && (
          <span>
            Photos swapped.{" "}
            <button type="button" className="button-quiet" disabled={disabled}
              onClick={() => changeAlbum((current) => removePlacement(current, replaceSource))}>Replace instead</button>
          </span>
        )}
      </div>
      <div className="canvas-viewport" ref={viewportRef} role="group" aria-label="Spread editor">
        {viewport.width > 0 && viewport.height > 0 && scale > 0 && (
          <Stage width={viewport.width} height={viewport.height}>
            <Layer>
              {[spread.left, spread.right].map((page, side) => page && (
                <LayerPage key={page.id} x={originX + side * (pageWidth + gap)} y={originY}
                  width={pageWidth} height={pageHeight} bleed={bleedMm * scale}
                  safeZone={safeZoneMm * scale}>
                  {page.slots.map((slot) => {
                    const rect = slotRect(slot, originX + side * (pageWidth + gap) + bleedMm * scale);
                    const slotId = `${page.id}:${slot.id}`;
                    const sideways = slot.rotation === 90 || slot.rotation === 270;
                    const localRect = { x: 0, y: 0, width: sideways ? rect.height : rect.width, height: sideways ? rect.width : rect.height };
                    return (
                      <Group key={slotId} x={rect.x + rect.width / 2} y={rect.y + rect.height / 2}
                        offsetX={localRect.width / 2} offsetY={localRect.height / 2} rotation={slot.rotation ?? 0}>
                        {slot.type === "text" ? (
                          <TextContent slot={slot} id={slotId} rect={localRect} scale={scale} format={album.pageFormat}
                            hidden={editingText === slotId} onOverflow={reportTextOverflow} />
                        ) : slot.placement ? (
                          <PlacementImage {...localRect} crop={placementDisplayCrop(slot.placement)} fit={slot.placement.fit}
                            root={root} path={slot.placement.photoPath} photoPorts={photoPorts}
                            thumbnail={thumbnailBySlot[slotId]} attempt={previewStates[slotId]?.path === slot.placement.photoPath
                              ? previewStates[slotId].attempt : 0}
                            slotId={slotId} onStatus={reportPreviewStatus} />
                        ) : <Rect {...localRect} fill="#e8ebe6" stroke="#9aa49c" strokeWidth={1} dash={[4, 3]} />}
                      </Group>
                    );
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
                  if (photoUsage(savedAlbum).has(photo.path)) onDuplicatePhoto(photo.path);
                  rememberThumbnail(`${page.id}:${slotId}`, photo.thumbnail);
                  changeAlbum((current) => placePhotoOnPage(current, page.id, photo, x, y));
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
          const name = `Page ${pageNumbers.get(page.id)} ${slot.type === "photo" ? "Photo" : "Text"} Slot ${index + 1}`;
          const targetId = `${page.id}:${slot.id}`;
          const outsidePage = slot.type === "text" && slot.text.length > 0
            && (slot.x < -1e-9 || slot.y < -1e-9 || slot.x + slot.width > 1 + 1e-9 || slot.y + slot.height > 1 + 1e-9);
          const previewState = slot.placement && previewStates[targetId]?.path === slot.placement.photoPath
            ? previewStates[targetId] : undefined;
          const previewStatus = previewState?.status ?? "loading";
          return (
            <Fragment key={targetId}>
            <div className={`slot-overlay${photoDragActive && slot.type === "photo" ? " slot-overlay--dragging" : ""}${dropTargetId === targetId ? " slot-overlay--drop-target" : ""}${cropMode && slot.placement && !slot.placement.fit ? " slot-overlay--crop-mode" : ""}`} role="button" tabIndex={0}
              ref={page.id === selectedPage.id && slot.id === selectedSlot?.id ? selectedSlotOverlayRef : undefined}
              aria-label={name} aria-pressed={page.id === selectedPage.id && slot.id === selectedSlot?.id}
              title={slot.type === "text" ? "Double-click to edit text" : slot.placement?.photoPath ?? "Drag a Photo here"}
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "move")}
              onClick={(event) => {
                event.stopPropagation();
                selectSlot(page.id, slot.id);
              }}
              onDoubleClick={() => { if (!disabled && slot.type === "text") setEditingText(targetId); }}
              onKeyDown={(event) => {
                if (toggleTextShortcut(event, page.id, slot)) return;
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  selectSlot(page.id, slot.id);
                  if (event.key === "Enter" && slot.type === "text" && !disabled) setEditingText(targetId);
                } else if ((event.key === "Delete" || event.key === "Backspace") && !disabled) {
                  event.preventDefault();
                  removeSlot(page.id, slot.id);
                }
              }}
              onDragOver={(event) => {
                if (disabled || slot.type !== "photo"
                  || (!hasPhotoDrag(event.dataTransfer) && !(hasPlacementDrag(event.dataTransfer) && draggedPlacement.current))) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = hasPlacementDrag(event.dataTransfer) ? "move" : "copy";
                setPhotoDragActive(true);
                setDropTargetId(targetId);
              }}
              onDrop={(event) => {
                if (disabled || slot.type !== "photo") return;
                if (hasPlacementDrag(event.dataTransfer) && draggedPlacement.current) {
                  event.preventDefault();
                  const source = draggedPlacement.current;
                  draggedPlacement.current = null;
                  setPhotoDragActive(false);
                  setDropTargetId(null);
                  if (source.pageId === page.id && source.slotId === slot.id) return;
                  const sourceKey = `${source.pageId}:${source.slotId}`;
                  setThumbnailBySlot((current) => {
                    const next = { ...current };
                    if (current[targetId]) next[sourceKey] = current[targetId];
                    else delete next[sourceKey];
                    if (current[sourceKey]) next[targetId] = current[sourceKey];
                    else delete next[targetId];
                    return next;
                  });
                  selectSlot(page.id, slot.id);
                  changeAlbum((current) => swapPlacements(current, source, { pageId: page.id, slotId: slot.id }));
                  if (slot.placement) setReplaceSource(source);
                  return;
                }
                const photo = readPhotoDrag(event.dataTransfer);
                if (!photo) return;
                event.preventDefault();
                setPhotoDragActive(false);
                setDropTargetId(null);
                try {
                  placePhoto(album, page.id, slot.id, photo);
                } catch {
                  return; // Not a valid Photo, e.g. a forged drag payload.
                }
                if (photoUsage(savedAlbum).has(photo.path)) onDuplicatePhoto(photo.path);
                rememberThumbnail(targetId, photo.thumbnail);
                selectSlot(page.id, slot.id);
                changeAlbum((current) => placePhoto(current, page.id, slot.id, photo));
              }}>
              {dropTargetId === targetId && (
                <span className="slot-drop-label">{draggedPlacement.current
                  ? slot.placement ? "Swap Photos" : "Move Photo"
                  : slot.placement ? "Replace Photo" : "Place Photo"}</span>
              )}
              {slot.type === "photo" && slot.placement && !disabled && (
                <span className="slot-photo-drag-handle" draggable aria-label={`Drag Photo from ${name}`}
                  title="Drag Photo to another Photo Slot"
                  onMouseDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    setReplaceSource(null);
                    commitCropPreview();
                    draggedPlacement.current = { pageId: page.id, slotId: slot.id };
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(PLACEMENT_DRAG_TYPE, "placement");
                    setPhotoDragActive(true);
                    setDropTargetId(null);
                  }}>Drag Photo</span>
              )}
              {slot.type === "text" && editingText === targetId && (
                <textarea className="slot-text-editor" aria-label={`Edit ${name}`} autoFocus value={slot.text} disabled={textDisabled}
                  style={{
                    ...(slot.rotation ? {
                      inset: "auto", left: "50%", top: "50%",
                      width: slot.rotation === 90 || slot.rotation === 270 ? rect.height : rect.width,
                      height: slot.rotation === 90 || slot.rotation === 270 ? rect.width : rect.height,
                      transform: `translate(-50%, -50%) rotate(${slot.rotation}deg)`,
                    } : {}),
                    fontFamily: slot.style.fontFamily, fontSize: slot.style.fontSize / POINTS_PER_MM * scale,
                    color: slot.style.color, fontWeight: slot.style.bold ? "bold" : "normal",
                    fontStyle: slot.style.italic ? "italic" : "normal", textAlign: slot.style.align,
                    textDecoration: slot.style.underline ? "underline" : "none", lineHeight: TEXT_LINE_HEIGHT,
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (toggleTextShortcut(event, page.id, slot)) return;
                    event.stopPropagation();
                    if (event.key === "Escape") setEditingText(null);
                  }}
                  onChange={(event) => {
                    const text = event.target.value;
                    changeAlbum((current) => setSlotText(current, page.id, slot.id, text));
                  }} />
              )}
              {slot.type === "text" && (overflowSlots[targetId] || outsidePage) && (
                <span className="slot-overflow-warning" role="status">{outsidePage ? "Text extends beyond Page" : "Text overflows Slot"}</span>
              )}
              {slot.type === "text" && editingText === targetId && !disabled && (
                <span className="slot-move-handle" role="button" aria-label={`Move ${name}`}
                  onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "move")}>Move</span>
              )}
              {!disabled && (
                <span className={`slot-resize-handle${slot.type === "text" ? slot.rotation === 90 || slot.rotation === 270 ? " slot-resize-handle--text-sideways" : " slot-resize-handle--text" : ""}`} aria-label={`Resize ${name}`} role="button"
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
        {slotDrag && dragPreview && dragPreview.guides.length > 0 && (() => {
          const side = spread.left?.id === slotDrag.pageId ? 0 : 1;
          const trimLeft = originX + side * (pageWidth + gap) + bleedMm * scale;
          const trimTop = originY + bleedMm * scale;
          return (
            <svg className="snap-guides" width={viewport.width} height={viewport.height}>
              {dragPreview.guides.map((guide) => {
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
        })()}
        {scale > 0 && selectedSlot?.type === "text" && (
          <TextSlotControls key={`${selectedPage.id}:${selectedSlot.id}`} style={selectedSlot.style}
            anchor={slotRect(selectedSlot, originX + (spread.left?.id === selectedPage.id ? 0 : pageWidth + gap) + bleedMm * scale)}
            viewport={viewport} fonts={fonts} fontError={fontError} disabled={textDisabled}
            onShortcut={(event) => toggleTextShortcut(event, selectedPage.id, selectedSlot)}
            onStyle={changeTextStyle} onRetryFonts={() => { setFontError(null); setFontRetry((value) => value + 1); }} />
        )}
      </div>
      <div className="workspace-footer">
        <span>PAGE {visiblePageIndex + 1} OF {album.pages.length}</span>
        <span className="guide-legend">
          <span>Bleed: {bleedMm} mm</span><span>Trim edge</span><span>Safe Zone: {safeZoneMm} mm</span>
          <span>Hold Alt for free placement</span>
        </span>
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
                  selectPage(page.id);
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
                  changeAlbum((current) => movePage(current, id, current.pages.findIndex((target) => target.id === page.id)));
                }}
                onDragEnd={() => { draggedId.current = null; }}
                onClick={() => selectPage(page.id)}>{pageNumbers.get(page.id)}</button>
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

function TextContent({ slot, id, rect, scale, format, hidden, onOverflow }: {
  slot: TextSlot; id: string; rect: Rectangle;
  scale: number; format: PageFormat; hidden: boolean; onOverflow: (id: string, overflow: boolean) => void;
}) {
  const layout = useMemo(() => measureTextSlot(slot, format), [slot.text, slot.style, slot.width, slot.height, slot.rotation, format]);
  useEffect(() => { onOverflow(id, layout.tooWide); }, [id, layout.tooWide, onOverflow]);
  const textScale = scale / POINTS_PER_MM;
  return (
    <Group x={rect.x} y={rect.y} scaleX={textScale} scaleY={textScale}
      clipX={0} clipY={0} clipWidth={layout.width} clipHeight={rect.height / textScale}>
      <Text width={layout.width} text={slot.text}
        fontFamily={slot.style.fontFamily} fontSize={slot.style.fontSize} fontStyle={textFontStyle(slot.style)}
        textDecoration={slot.style.underline ? "underline" : ""}
        fill={slot.style.color} align={slot.style.align} lineHeight={TEXT_LINE_HEIGHT} opacity={hidden ? 0 : 1} />
    </Group>
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
