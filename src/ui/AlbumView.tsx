import { Fragment, useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Layer, Rect, Stage } from "react-konva";
import {
  addPage, addPhotoSlot, addTextSlot, albumSpreads, applyLayout, deletePage, deleteSlot, duplicatePage, movePage, pageDimensions,
  panCrop, placePhoto, placePhotoOnPage, placementDisplayCrop, photoUsage, rotateSlot, saveLayoutFromPage, setPlacementCrop,
  setPlacementFit, setSlotText, setTextStyle, swapPlacements, zoomCrop, POINTS_PER_MM, TEXT_LINE_HEIGHT,
  type Album, type AppliedLayout, type HistoryDirection, type Crop, type Page, type PageFormat, type PhotoPreviewPorts, type Slot, type SlotAddress, type TextStyle,
} from "../core";
import { hasLayoutDrag, hasPhotoDrag, readLayoutDrag, readPhotoDrag, writeLayoutDrag } from "./photoDrag";
import { historyShortcut } from "./historyShortcut";
import LayoutLibraryPane, { plural } from "./LayoutLibraryPane";
import { applySlotDrag, LayerPage, PhotoImage, SlotFrame, SnapGuides, TextContent, type SlotDrag } from "./pageCanvas";
import type { FontPorts } from "./tauriFontPorts";
import { fitTextSlots } from "./textLayout";
import TextSlotTools from "./TextSlotTools";
import { PhotoSlotTools, SlotActions } from "./SlotTools";
import { useSlotShortcuts } from "./slotShortcuts";
import type { AlbumHistory, AlbumLayouts, CommandBarLink } from "./AlbumWorkspace";

const PLACEMENT_DRAG_TYPE = "application/x-phalbummakr-placement";

function hasPlacementDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes(PLACEMENT_DRAG_TYPE);
}

interface Props {
  album: Album;
  /** Applies a change as one undo step; consecutive changes in the same `group` share a step. */
  onChange: (update: (album: Album) => Album, group?: string) => void;
  history: AlbumHistory;
  disabled: boolean;
  textDisabled: boolean;
  root: string;
  photoPorts: PhotoPreviewPorts;
  fontPorts: FontPorts;
  onDuplicatePhoto: (path: string) => void;
  onCropPendingChange: (pending: boolean) => void;
  bar: CommandBarLink;
  active?: boolean;
  layouts?: AlbumLayouts;
  /** Reports what happened when a Layout was applied or saved; `null` clears the notice. */
  onNotice?: (message: string | null) => void;
}

/** Tells the user what applying a Layout dropped, and when it was made for another Page shape. */
function appliedLayoutNotice({ dropped, aspectMismatch }: AppliedLayout, pageNumber: number | undefined): string | null {
  const photos = dropped.placements.length;
  const texts = dropped.texts.length;
  const parts = [photos && plural(photos, "Photo"), texts && plural(texts, "text")].filter(Boolean);
  const messages: string[] = [];
  if (parts.length) {
    messages.push(`${parts.join(" and ")} did not fit the Layout on Page ${pageNumber} and ${photos + texts === 1 ? "was" : "were"} removed.`);
  }
  if (aspectMismatch) messages.push("The Layout was made for Pages with a different aspect ratio, so its Slots may not sit as intended.");
  return messages.length ? messages.join(" ") : null;
}

export default function AlbumView({ album: savedAlbum, onChange, history, disabled, textDisabled, root, photoPorts, fontPorts, onDuplicatePhoto, onCropPendingChange, bar, active = true, layouts, onNotice }: Props) {
  const { command, toolsHost, onSlotSelectedChange } = bar;
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const draggedId = useRef<string | null>(null);
  const focusPageId = useRef<string | null>(null);
  const draggedPlacement = useRef<SlotAddress | null>(null);
  const stopSlotDrag = useRef<(() => void) | null>(null);
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
  const [photoDragActive, setPhotoDragActive] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [stripMenu, setStripMenu] = useState<{ x: number; y: number; pageId: string | null } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; pageId: string } & (
    { kind: "page"; centre: { x: number; y: number } } | { kind: "slot"; slotId: string }
  ) | null>(null);
  const [pageDropId, setPageDropId] = useState<string | null>(null);
  const [layoutMenu, setLayoutMenu] = useState<{ x: number; y: number; layoutId: string } | null>(null);
  /** The Page a dragged Layout would be applied to. */
  const [layoutDropPageId, setLayoutDropPageId] = useState<string | null>(null);
  const handledCommand = useRef(command?.serial);
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
  }, [selectedPage.id, visiblePageIndex]);

  useEffect(() => {
    if (!focusPageId.current) return;
    const target = Array.from(stripRef.current?.querySelectorAll<HTMLButtonElement>("[data-page-id]") ?? [])
      .find((button) => button.dataset.pageId === focusPageId.current);
    target?.focus();
    focusPageId.current = null;
  }, [savedAlbum]);

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

  function deleteSpread(index: number) {
    const item = spreads[index];
    if (!item.left || !item.right || disabled) return;
    const id = item.left.id;
    const pageIndex = index * 2 - 1;
    changeAlbum((current) => {
      const currentIndex = current.pages.findIndex((page) => page.id === id);
      if (currentIndex <= 0 || currentIndex >= current.pages.length - 1 || currentIndex % 2 !== 1) {
        throw new Error("Spread is no longer available for deletion.");
      }
      const updated = deletePage(current, id);
      if (!updated.pages.some((page) => page.id === selectedId)) {
        selectPage(updated.pages[Math.min(pageIndex, updated.pages.length - 1)].id);
      }
      return updated;
    });
  }

  /** Undoes or redoes one step, then shows where it happened if that is not on the selected Page. */
  function undoOrRedo(direction: HistoryDirection) {
    if (disabled || cropPreviewRef.current) return;
    stopSlotDrag.current?.();
    const result = history.step(direction);
    if (!result) return;
    const { before, after } = result;
    const selected = after.pages.find((page) => page.id === selectedId);
    if (selected && selected !== before.pages.find((page) => page.id === selectedId)) {
      if (!selected.slots.some((slot) => slot.id === selectedSlotId)) {
        setSelectedSlotId(null);
        setEditingText(null);
      }
      return;
    }
    const changed = after.pages.findIndex((page, index) => page !== before.pages[index]);
    if (changed >= 0) selectPage(after.pages[changed].id);
    else if (!selected) selectPage(after.pages[Math.min(visiblePageIndex, after.pages.length - 1)].id);
  }

  useEffect(() => {
    if (!stripMenu && !canvasMenu && !layoutMenu) return;
    const close = () => { setStripMenu(null); setCanvasMenu(null); setLayoutMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", escape); };
  }, [stripMenu, canvasMenu, layoutMenu]);

  useEffect(() => () => {
    stopSlotDrag.current?.();
  }, []);

  function updateCropPreview(next: { pageId: string; slotId: string; crop: Crop } | null) {
    const changed = (cropPreviewRef.current !== null) !== (next !== null);
    cropPreviewRef.current = next;
    setCropPreview(next);
    if (changed) onCropPendingChange(next !== null);
  }

  function commitCropPreview() {
    const pending = cropPreviewRef.current;
    if (!pending) return;
    updateCropPreview(null);
    onChange((current) => setPlacementCrop(current, pending.pageId, pending.slotId, pending.crop));
  }

  function changeAlbum(update: (album: Album) => Album, group?: string) {
    commitCropPreview();
    onChange((current) => fitTextSlots(update(current), current), group);
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
      setLayoutDropPageId(null);
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
    setSelectedId(pageId);
    setSelectedSlotId(null);
    setEditingText(null);
  }

  function selectSlot(pageId: string, slotId: string) {
    if (pageId !== selectedId || slotId !== selectedSlotId) setEditingText(null);
    setSelectedId(pageId);
    setSelectedSlotId(slotId);
  }

  function startCropPan(event: ReactMouseEvent<HTMLElement>, pageId: string, slotId: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectSlot(pageId, slotId);
    if (disabled) return;
    event.preventDefault();
    commitCropPreview();
    stopSlotDrag.current?.();
    const slot = album.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slotId);
    if (!slot?.placement || slot.placement.fit) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const baseCrop = slot.placement.crop;
    const rect = (event.currentTarget.closest(".slot-overlay") ?? event.currentTarget).getBoundingClientRect();
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

  const selectedTextEditor = useRef<HTMLTextAreaElement | null>(null);
  // Set when focus leaves the text being edited for a Slot tool, so it can return once the style is chosen.
  const returnToTextEditor = useRef(false);

  function restoreTextEditorFocus() {
    if (!returnToTextEditor.current) return;
    returnToTextEditor.current = false;
    selectedTextEditor.current?.focus({ preventScroll: true });
  }

  function rotateSelectedSlot(turn: 90 | -90) {
    if (!selectedSlot || disabled) return;
    const pageId = selectedPage.id;
    const slotId = selectedSlot.id;
    changeAlbum((current) => rotateSlot(current, pageId, slotId, turn));
  }

  function deleteSlotAt(pageId = selectedPage.id, slotId = selectedSlot?.id) {
    if (!slotId || disabled) return;
    removeSlot(pageId, slotId);
  }

  function applyLayoutTo(pageId: string, layoutId: string) {
    const layout = layouts?.state.library?.layouts.find((item) => item.id === layoutId);
    if (disabled || !layout) return;
    const result = applyLayout(savedAlbum, pageId, layout);
    changeAlbum((current) => applyLayout(current, pageId, layout).album);
    setSelectedId(pageId);
    setSelectedSlotId(null);
    setEditingText(null);
    onNotice?.(appliedLayoutNotice(result, pageNumbers.get(pageId)));
  }

  /** Lets a dragged Layout land anywhere on a Page, including on its Slots. Returns whether the drag was a Layout. */
  function layoutDragOver(event: ReactDragEvent, pageId: string): boolean {
    if (disabled || !hasLayoutDrag(event.dataTransfer)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setLayoutDropPageId(pageId);
    return true;
  }

  function layoutDrop(event: ReactDragEvent, pageId: string): boolean {
    const layoutId = readLayoutDrag(event.dataTransfer);
    if (!layoutId) return false;
    event.preventDefault();
    event.stopPropagation();
    setLayoutDropPageId(null);
    applyLayoutTo(pageId, layoutId);
    return true;
  }

  function saveAsLayout() {
    const pageId = selectedPage.id;
    if (!layouts?.state.change((library) => saveLayoutFromPage(library, savedAlbum, pageId).library)) return;
    onNotice?.(`Saved Page ${pageNumbers.get(pageId)} as a new Layout.`);
  }

  function addSpreadAtEnd() {
    if (disabled || album.pages.length >= 10000) return;
    editPages((current) => addPage(current, current.pages.at(-1)!.id), album.pages.length - 1);
  }

  const hasSelectedSlot = selectedSlot !== null;
  useEffect(() => {
    onSlotSelectedChange?.(hasSelectedSlot);
  }, [hasSelectedSlot, onSlotSelectedChange]);
  useEffect(() => () => onSlotSelectedChange?.(false), [onSlotSelectedChange]);

  useEffect(() => {
    if (!command || handledCommand.current === command.serial) return;
    handledCommand.current = command.serial;
    if (command.name === "add-spread") addSpreadAtEnd();
    else if (command.name === "add-photo-slot") addSlot("photo", selectedPage.id);
    else if (command.name === "add-text-slot") addSlot("text", selectedPage.id);
    else if (command.name === "save-as-layout") saveAsLayout();
    else if (command.name === "undo" || command.name === "redo") undoOrRedo(command.name);
  });

  const zoomable = selectedSlot?.type === "photo" && selectedSlot.placement && !selectedSlot.placement.fit;
  useSlotShortcuts(active, selectedSlot && !disabled ? {
    delete: () => deleteSlotAt(),
    rotate: rotateSelectedSlot,
    zoom: zoomable ? (factor) => zoomPlacementBy(selectedPage.id, selectedSlot.id, factor) : undefined,
  } : {});

  function addSlot(type: "photo" | "text", pageId: string, centre?: { x: number; y: number }) {
    if (disabled) return;
    const add = type === "photo" ? addPhotoSlot : addTextSlot;
    const added = add(album, pageId, centre).pages.find((page) => page.id === pageId)!.slots.at(-1)!;
    changeAlbum((current) => add(current, pageId, centre));
    setSelectedId(pageId);
    setSelectedSlotId(added.id);
    setEditingText(type === "text" ? `${pageId}:${added.id}` : null);
  }

  function changeTextStyle(style: Partial<TextStyle>) {
    if (selectedSlot?.type !== "text") return;
    // The colour picker reports every colour it passes; they form one step until the colour is chosen.
    const group = Object.keys(style).join() === "color" ? `colour:${selectedPage.id}:${selectedSlot.id}` : undefined;
    changeAlbum((current) => setTextStyle(current, selectedPage.id, selectedSlot.id, { ...selectedSlot.style, ...style }), group);
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
                    return (
                      <SlotFrame key={slotId} slot={slot} rect={rect}>
                        {(localRect) => slot.type === "text" ? (
                          <TextContent slot={slot} id={slotId} rect={localRect} scale={scale} format={album.pageFormat}
                            hidden={editingText === slotId} showPlaceholder onOverflow={reportTextOverflow} />
                        ) : slot.placement ? (
                          <PlacementImage {...localRect} crop={placementDisplayCrop(slot.placement)} fit={slot.placement.fit}
                            root={root} path={slot.placement.photoPath} photoPorts={photoPorts}
                            thumbnail={thumbnailBySlot[slotId]} attempt={previewStates[slotId]?.path === slot.placement.photoPath
                              ? previewStates[slotId].attempt : 0}
                            slotId={slotId} onStatus={reportPreviewStatus} />
                        ) : <Rect {...localRect} fill="#e8ebe6" stroke="#9aa49c" strokeWidth={1} dash={[4, 3]} />}
                      </SlotFrame>
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
              data-layout-target={layoutDropPageId === page.id || undefined}
              onDragOver={(event) => {
                if (layoutDragOver(event, page.id)) return;
                if (disabled || !hasPhotoDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setPhotoDragActive(true);
                setDropTargetId(null);
              }}
              onDrop={(event) => {
                if (layoutDrop(event, page.id)) return;
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
              onClick={() => selectPage(page.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectPage(page.id);
                if (disabled || scale <= 0) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                setStripMenu(null);
                setCanvasMenu({
                  x: event.clientX, y: event.clientY, pageId: page.id, kind: "page",
                  centre: {
                    x: (event.clientX - bounds.left - bleedMm * scale) / trimWidth,
                    y: (event.clientY - bounds.top - bleedMm * scale) / trimHeight,
                  },
                });
              }}>
              <span className="canvas-page-number">Page {pageNumbers.get(page.id)}</span>
            </button>
          ) : (
            <div className="canvas-blocked-page" key={`blocked-${side}`} style={style}>
              Inside cover
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
            <div className={`slot-overlay${photoDragActive && slot.type === "photo" ? " slot-overlay--dragging" : ""}${dropTargetId === targetId ? " slot-overlay--drop-target" : ""}`} role="button" tabIndex={0}
              aria-label={name} aria-pressed={page.id === selectedPage.id && slot.id === selectedSlot?.id}
              title={slot.type === "text" ? "Double-click to edit text" : slot.placement?.photoPath ?? "Drag a Photo here"}
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              onMouseDown={(event) => startSlotDrag(event, page.id, slot.id, "move")}
              onClick={(event) => {
                event.stopPropagation();
                selectSlot(page.id, slot.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectSlot(page.id, slot.id);
                setStripMenu(null);
                if (!disabled) setCanvasMenu({ x: event.clientX, y: event.clientY, pageId: page.id, kind: "slot", slotId: slot.id });
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
                  selectSlot(page.id, slot.id);
                  deleteSlotAt(page.id, slot.id);
                }
              }}
              onDragOver={(event) => {
                if (layoutDragOver(event, page.id)) return;
                if (disabled || slot.type !== "photo"
                  || (!hasPhotoDrag(event.dataTransfer) && !(hasPlacementDrag(event.dataTransfer) && draggedPlacement.current))) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = hasPlacementDrag(event.dataTransfer) ? "move" : "copy";
                setPhotoDragActive(true);
                setDropTargetId(targetId);
              }}
              onDrop={(event) => {
                if (layoutDrop(event, page.id)) return;
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
              {slot.type === "photo" && slot.placement && (!disabled
                || (draggedPlacement.current?.pageId === page.id && draggedPlacement.current.slotId === slot.id)) && (
                <span className="slot-photo-drag-handle" draggable aria-label={`Drag Photo from ${name}`}
                  title="Drag to swap"
                  onMouseDown={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    commitCropPreview();
                    draggedPlacement.current = { pageId: page.id, slotId: slot.id };
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(PLACEMENT_DRAG_TYPE, "placement");
                    setPhotoDragActive(true);
                    setDropTargetId(null);
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M8 13V5a1.5 1.5 0 0 1 3 0v7V3a1.5 1.5 0 0 1 3 0v9V4a1.5 1.5 0 0 1 3 0v8V7a1.5 1.5 0 0 1 3 0v9c0 4-2 6-6 6h-1c-3 0-5-2-6-4l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 13Z" />
                    </svg>
                </span>
              )}
              {slot.type === "photo" && slot.placement && !slot.placement.fit
                && page.id === selectedPage.id && slot.id === selectedSlot?.id && (
                <span className="slot-crop-handle" role="button" aria-label={`Pan Photo in ${name}`}
                  title="Drag to move the Photo inside the Slot"
                  onMouseDown={(event) => startCropPan(event, page.id, slot.id)}>✥</span>
              )}
              {slot.type === "text" && editingText === targetId && (
                <textarea className="slot-text-editor" aria-label={`Edit ${name}`} autoFocus value={slot.text} disabled={textDisabled}
                  placeholder={slot.placeholder}
                  ref={selectedTextEditor}
                  onFocus={() => { returnToTextEditor.current = false; history.endGroup(); }}
                  onBlur={(event) => {
                    history.endGroup();
                    returnToTextEditor.current = event.relatedTarget instanceof Node && toolsHost?.contains(event.relatedTarget) === true;
                  }}
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
                  onContextMenu={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (toggleTextShortcut(event, page.id, slot)) return;
                    // Undo and redo are handled for the whole window.
                    if (historyShortcut(event)) return;
                    event.stopPropagation();
                    if (event.key === "Escape") setEditingText(null);
                  }}
                  onChange={(event) => {
                    const text = event.target.value;
                    changeAlbum((current) => setSlotText(current, page.id, slot.id, text), `text:${page.id}:${slot.id}`);
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
        {slotDrag && dragPreview && dragPreview.guides.length > 0 && (
          <SnapGuides guides={dragPreview.guides} width={viewport.width} height={viewport.height}
            trimLeft={originX + (spread.left?.id === slotDrag.pageId ? 0 : 1) * (pageWidth + gap) + bleedMm * scale}
            trimTop={originY + bleedMm * scale} trimWidth={trimWidth} trimHeight={trimHeight} />
        )}
        {active && toolsHost && selectedSlot && createPortal(<Fragment key={`${selectedPage.id}:${selectedSlot.id}`}>
          {selectedSlot.type === "text" ? (
            <TextSlotTools style={selectedSlot.style}
              fonts={fonts} fontError={fontError} disabled={textDisabled}
              onShortcut={(event) => toggleTextShortcut(event, selectedPage.id, selectedSlot)}
              onStyle={changeTextStyle} onCommit={() => { history.endGroup(); restoreTextEditorFocus(); }}
              onRetryFonts={() => { setFontError(null); setFontRetry((value) => value + 1); }}>
              <SlotActions disabled={disabled} onRotate={rotateSelectedSlot} onDelete={() => deleteSlotAt()} />
            </TextSlotTools>
          ) : (
            <PhotoSlotTools fit={selectedSlot.placement?.fit ?? null} disabled={disabled}
              onFit={(fit) => changeAlbum((current) => setPlacementFit(current, selectedPage.id, selectedSlot.id, fit))}
              onZoom={(factor) => zoomPlacementBy(selectedPage.id, selectedSlot.id, factor)}
              onRotate={rotateSelectedSlot} onDelete={() => deleteSlotAt()} />
          )}
        </Fragment>, toolsHost)}
      </div>
      <div className="workspace-footer">
        <span>PAGE {visiblePageIndex + 1} OF {album.pages.length}</span>
        <span className="guide-legend">
          <span>Bleed: {bleedMm} mm</span><span>Trim edge</span><span>Safe Zone: {safeZoneMm} mm</span>
          <span>Hold Alt for free placement</span>
        </span>
      </div>
      <nav className="spread-strip" aria-label="Spreads" ref={stripRef} onContextMenu={(event) => {
        event.preventDefault();
        setCanvasMenu(null);
                  if (!disabled) setStripMenu({ x: event.clientX, y: event.clientY, pageId: null });
      }} onDragOver={(event) => {
        if (disabled || !draggedId.current) return;
        if (!(event.target instanceof Element) || !event.target.closest(".page-thumbnail[draggable='true']")) setPageDropId(null);
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left + 32) event.currentTarget.scrollLeft -= 16;
        else if (event.clientX > bounds.right - 32) event.currentTarget.scrollLeft += 16;
      }} onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPageDropId(null);
      }}>
        {spreads.map((item, index) => (
          <Fragment key={index}>
          {index > 0 && <div className="spread-gap">
            <button type="button" aria-label={`Insert Spread before Spread ${index + 1}`}
              disabled={disabled || album.pages.length >= 10000}
              onClick={() => editPages((current) => addPage(current, album.pages[index * 2 - 2].id), index * 2 - 1)}>+</button>
          </div>}
          <div className="spread-thumbnail" key={index} role="group" aria-label={`Spread ${index + 1}`}>
            {index > 0 && index < spreads.length - 1 && <button type="button" className="spread-delete"
              aria-label={`Delete Spread ${index + 1}`} disabled={disabled}
              onClick={() => deleteSpread(index)}>×</button>}
            {[item.left, item.right].map((page, side) => page ? (
              <div className="page-thumbnail-wrapper" key={page.id}>
              <PagePreview page={page} format={album.pageFormat} root={root} photoPorts={photoPorts} />
              <button type="button" key={page.id} className={`page-thumbnail${pageDropId === page.id ? " page-drop-target" : ""}`}
                style={{ aspectRatio: `${dimensions.widthMm} / ${dimensions.heightMm}` }}
                aria-label={`Select Page ${pageNumbers.get(page.id)}`} aria-pressed={page.id === selectedPage.id}
                data-page-id={page.id} title="Alt+Left or Alt+Right moves this Page"
                draggable={!disabled}
                onKeyDown={(event) => {
                  if (disabled || !event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
                  event.preventDefault();
                  const position = album.pages.findIndex((entry) => entry.id === page.id);
                  const next = position + (event.key === "ArrowLeft" ? -1 : 1);
                  if (next < 0 || next >= album.pages.length) return;
                  focusPageId.current = page.id;
                  editPages((current) => movePage(current, page.id, next), next);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCanvasMenu(null);
                  if (!disabled) setStripMenu({ x: event.clientX, y: event.clientY, pageId: page.id });
                }}
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
                  setPageDropId(page.id);
                }}
                onDrop={(event) => {
                  if (disabled || !draggedId.current) return;
                  event.preventDefault();
                  const id = draggedId.current;
                  draggedId.current = null;
                  setPageDropId(null);
                  changeAlbum((current) => movePage(current, id, current.pages.findIndex((target) => target.id === page.id)));
                }}
                onDragEnd={() => { draggedId.current = null; setPageDropId(null); }}
                onClick={() => selectPage(page.id)}><span className="thumbnail-number">{pageNumbers.get(page.id)}</span></button>
              </div>
            ) : (
              <span key={`blocked-${side}`} className="page-thumbnail page-thumbnail-blocked"
                onDragOver={() => setPageDropId(null)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                Inside cover
              </span>
            ))}
          </div>
          </Fragment>
        ))}
      </nav>
      {stripMenu && (() => {
        const pageIndex = album.pages.findIndex((page) => page.id === stripMenu.pageId);
        const targetSpreadIndex = pageIndex < 0 ? -1 : Math.floor((pageIndex + 1) / 2);
        const full = album.pages.length >= 10000;
        const close = () => setStripMenu(null);
        return <div role="menu" className="strip-menu" style={{ left: Math.min(stripMenu.x, window.innerWidth - 220), top: Math.min(stripMenu.y, window.innerHeight - 160) }}>
          {pageIndex < 0 ? <button role="menuitem" type="button" disabled={full}
            onClick={() => { editPages((current) => addPage(current, album.pages.at(-1)!.id), album.pages.length - 1); close(); }}>Add Spread</button> : <>
            <button role="menuitem" type="button" disabled={full || targetSpreadIndex === 0}
              onClick={() => { editPages((current) => addPage(current, album.pages[targetSpreadIndex * 2 - 2].id), targetSpreadIndex * 2 - 1); close(); }}>Insert Spread Before</button>
            <button role="menuitem" type="button" disabled={full || targetSpreadIndex === spreads.length - 1}
              onClick={() => { editPages((current) => addPage(current, stripMenu.pageId!), targetSpreadIndex * 2 + 1); close(); }}>Insert Spread After</button>
            <button role="menuitem" type="button" disabled={targetSpreadIndex === 0 || targetSpreadIndex === spreads.length - 1}
              onClick={() => { deleteSpread(targetSpreadIndex); close(); }}>Delete Spread</button>
            <button role="menuitem" type="button" disabled={full}
              onClick={() => {
                const insertion = Math.min(targetSpreadIndex * 2 + 1, album.pages.length - 1);
                const copyIndex = insertion + (pageIndex % 2 === 0 && pageIndex !== album.pages.length - 1 ? 1 : 0);
                editPages((current) => duplicatePage(current, stripMenu.pageId!), copyIndex);
                close();
              }}>Duplicate Page onto New Spread</button>
          </>}
        </div>;
      })()}
      {canvasMenu?.kind === "page" && <div role="menu" className="strip-menu" aria-label="Page actions"
        style={{ left: Math.min(canvasMenu.x, window.innerWidth - 220), top: Math.min(canvasMenu.y, window.innerHeight - 100) }}>
        <button role="menuitem" type="button"
          onClick={() => { addSlot("photo", canvasMenu.pageId, canvasMenu.centre); setCanvasMenu(null); }}>Add Photo Slot</button>
        <button role="menuitem" type="button"
          onClick={() => { addSlot("text", canvasMenu.pageId, canvasMenu.centre); setCanvasMenu(null); }}>Add Text Slot</button>
      </div>}
      {canvasMenu?.kind === "slot" && (() => {
        const { pageId, slotId } = canvasMenu;
        const slot = album.pages.find((page) => page.id === pageId)?.slots.find((item) => item.id === slotId);
        if (!slot) return null;
        const close = () => setCanvasMenu(null);
        return <div role="menu" className="strip-menu" aria-label="Slot actions"
          style={{ left: Math.min(canvasMenu.x, window.innerWidth - 220), top: Math.min(canvasMenu.y, window.innerHeight - 160) }}>
          {slot.placement && <button role="menuitemcheckbox" type="button" aria-checked={slot.placement.fit}
            onClick={() => { changeAlbum((current) => setPlacementFit(current, pageId, slotId, !slot.placement!.fit)); close(); }}>
            Fit</button>}
          <button role="menuitem" type="button"
            onClick={() => { changeAlbum((current) => rotateSlot(current, pageId, slotId, -90)); close(); }}>Rotate left</button>
          <button role="menuitem" type="button"
            onClick={() => { changeAlbum((current) => rotateSlot(current, pageId, slotId, 90)); close(); }}>Rotate right</button>
          <button role="menuitem" type="button" onClick={() => { deleteSlotAt(pageId, slotId); close(); }}>Delete</button>
        </div>;
      })()}
      {layouts?.paneHost && createPortal(
        <LayoutLibraryPane layouts={layouts.state} format={album.pageFormat}
          emptyText="No Layouts yet. Create them in Layout mode, or use Save as Layout."
          title={(label) => `${label}. Drag onto a Page, or click to apply it to the current Spread.`}
          onDragStart={(layout, event) => writeLayoutDrag(event.dataTransfer, layout.id)}
          onClick={(layout, event) => {
            event.stopPropagation();
            const bounds = event.currentTarget.getBoundingClientRect();
            setLayoutMenu({ x: bounds.left, y: bounds.bottom, layoutId: layout.id });
          }}
          onContextMenu={(layout, event) => {
            event.preventDefault();
            event.stopPropagation();
            setLayoutMenu({ x: event.clientX, y: event.clientY, layoutId: layout.id });
          }} />, layouts.paneHost)}
      {/* On the body, as it opens over the Side pane rather than the canvas. */}
      {layoutMenu && createPortal(<div role="menu" className="strip-menu" aria-label="Apply Layout"
        style={{ left: Math.min(layoutMenu.x, window.innerWidth - 220), top: Math.min(layoutMenu.y, window.innerHeight - 100) }}>
        {([["left", spread.left], ["right", spread.right]] as const).map(([side, page]) => page && (
          <button key={side} role="menuitem" type="button" disabled={disabled}
            onClick={() => { applyLayoutTo(page.id, layoutMenu.layoutId); setLayoutMenu(null); }}>Apply to {side} Page</button>
        ))}
      </div>, document.body)}
    </section>
  );
}

function PagePreview({ page, format, root, photoPorts }: {
  page: Page; format: PageFormat; root: string; photoPorts: PhotoPreviewPorts;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const dimensions = pageDimensions(format);
  const scale = 76 / dimensions.widthMm;
  const width = dimensions.widthMm * scale;
  const height = dimensions.heightMm * scale;
  return <div ref={ref} className="page-preview" aria-hidden="true">
    {visible && <VisiblePagePreview page={page} format={format} root={root} photoPorts={photoPorts}
      width={width} height={height} scale={scale} />}
  </div>;
}

function VisiblePagePreview({ page, format, root, photoPorts, width, height, scale }: {
  page: Page; format: PageFormat; root: string; photoPorts: PhotoPreviewPorts; width: number; height: number; scale: number;
}) {
  return <Stage width={width} height={height}>
      <Layer clipX={0} clipY={0} clipWidth={width} clipHeight={height}>
        {page.slots.map((slot) => {
          const rect = { x: slot.x * width, y: slot.y * height, width: slot.width * width, height: slot.height * height };
          return <SlotFrame key={slot.id} slot={slot} rect={rect}>
            {(local) => slot.type === "text"
              ? <TextContent slot={slot} id={slot.id} rect={local} scale={scale} format={format} hidden={false}
                showPlaceholder={false} onOverflow={ignoreOverflow} />
              : slot.placement
                ? <PlacementImage {...local} crop={placementDisplayCrop(slot.placement)} fit={slot.placement.fit}
                  root={root} path={slot.placement.photoPath} photoPorts={photoPorts} thumbnailRequest={photoPorts.pageThumbnail}
                  attempt={0} slotId={slot.id} onStatus={ignorePreviewStatus} />
                : <Rect {...local} fill="#e8ebe6" />}
          </SlotFrame>;
        })}
      </Layer>
    </Stage>;
}

function ignoreOverflow() {}
function ignorePreviewStatus() {}

/** Draws a Placement from its cached preview; originals are only used by Page Export. */
function PlacementImage({ x, y, width, height, crop, fit, root, path, photoPorts, thumbnailRequest, thumbnail, attempt, slotId, onStatus }: {
  x: number; y: number; width: number; height: number; crop: Crop; fit: boolean;
  root: string; path: string; photoPorts: Pick<PhotoPreviewPorts, "preview">;
  thumbnailRequest?: PhotoPreviewPorts["pageThumbnail"];
  thumbnail?: string; attempt: number; slotId: string;
  onStatus: (slotId: string, path: string, status: "loading" | "ready" | "error") => void;
}) {
  const [preview, setPreview] = useState<{ path: string; attempt: number; image: HTMLImageElement | null } | null>(null);
  const [thumbnailImage, setThumbnailImage] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    onStatus(slotId, path, "loading");
    const request = thumbnailRequest ? thumbnailRequest(root, path, controller.signal) : photoPorts.preview(root, path);
    request.then((url) => {
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
      if (active) {
        console.error(`Could not load the preview of ${path}`, cause);
        setPreview({ path, attempt, image: null });
        onStatus(slotId, path, "error");
      }
    });
    return () => { active = false; controller.abort(); };
  }, [root, path, photoPorts, thumbnailRequest, attempt, slotId, onStatus]);

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
  return <PhotoImage x={x} y={y} width={width} height={height} image={visibleImage} crop={crop} fit={fit} opacity={image ? 1 : 0.45} />;
}
