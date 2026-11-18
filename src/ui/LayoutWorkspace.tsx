import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Group, Layer, Rect, Stage } from "react-konva";
import {
  addPhotoSlot, addTextSlot, deleteLayout, deleteSlot, duplicateLayout, madeForOtherAspectRatio, newLayout, pageAspectRatio, pageDimensions,
  rotateSlot, setLayoutSlots, setSlotPlaceholder, setTextStyle, POINTS_PER_MM, TEXT_LINE_HEIGHT,
  type Album, type Layout, type PageFormat, type Slot, type TextStyle,
} from "../core";
import LayoutLibraryPane from "./LayoutLibraryPane";
import ModalDialog from "./ModalDialog";
import { applySlotDrag, LayerPage, SnapGuides, TextContent, type SlotDrag } from "./pageCanvas";
import { PhotoSlotTools, SlotActions } from "./SlotTools";
import { tauriFontPorts, type FontPorts } from "./tauriFontPorts";
import { fitTextSlots } from "./textLayout";
import TextSlotTools from "./TextSlotTools";
import type { LayoutLibraryState } from "./useLayoutLibrary";

export type LayoutCommandName = "new-layout" | "duplicate-layout" | "delete-layout" | "add-photo-slot" | "add-text-slot";

/** A command bar command for Layout mode; `serial` makes repeated commands distinct. */
export interface LayoutCommand {
  name: LayoutCommandName;
  serial: number;
}

/** What the command bar needs to know to offer Layout commands. */
export interface LayoutBarState {
  editable: boolean;
  layoutSelected: boolean;
  slotSelected: boolean;
}

/** How Layout mode and the command bar talk to each other. */
export interface LayoutBarLink {
  command?: LayoutCommand;
  /** Where the selected Slot's tools render: the middle of the command bar. */
  toolsHost?: HTMLElement | null;
  onStateChange?: (state: LayoutBarState) => void;
}

interface Props {
  /** The open Album's Page Format: the canvas uses its aspect ratio, Bleed and Safe Zone. */
  format: PageFormat;
  /** The Layout Library, shared with Album mode. */
  layouts: LayoutLibraryState;
  fontPorts?: FontPorts;
  /** Where the Layout Library is listed: the Side pane. */
  paneHost: HTMLElement | null;
  /** False while another mode is shown; the hidden workspace then leaves keyboard shortcuts and the bar alone. */
  active: boolean;
  bar?: LayoutBarLink;
  confirmSlotDeletion?: boolean;
  setConfirmSlotDeletion?: (value: boolean) => Promise<void>;
}

const LAYOUT_PAGE = "layout";

/** Edits a Layout through the same Slot operations as a Page, as a one-Page Album. */
function layoutAlbum(layout: Layout, format: PageFormat): Album {
  return { schemaVersion: 2, title: "", pageFormat: format, pages: [{ id: LAYOUT_PAGE, background: "#ffffff", slots: layout.slots }] };
}

export default function LayoutWorkspace({ format, layouts, fontPorts = tauriFontPorts, paneHost, active, bar = {}, confirmSlotDeletion = true, setConfirmSlotDeletion }: Props) {
  const { command, toolsHost, onStateChange } = bar;
  const { library, disabled, error, change: changeLibrary } = layouts;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  /** The Text Slot whose placeholder is being edited. */
  const [editingPlaceholder, setEditingPlaceholder] = useState<string | null>(null);
  const [layoutDeleteTarget, setLayoutDeleteTarget] = useState<string | null>(null);
  const [slotDeleteTarget, setSlotDeleteTarget] = useState<string | null>(null);
  const [neverAsk, setNeverAsk] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } & (
    { kind: "page"; centre: { x: number; y: number } } | { kind: "slot"; slotId: string }
  ) | null>(null);
  const [fonts, setFonts] = useState<string[] | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const [fontRetry, setFontRetry] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [slotDrag, setSlotDrag] = useState<SlotDrag | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stopSlotDrag = useRef<(() => void) | null>(null);
  const handledCommand = useRef(command?.serial);
  // Layout mode opens on the first Layout, once the Layout Library is loaded.
  const [selectionStarted, setSelectionStarted] = useState(false);
  if (library && !selectionStarted) {
    setSelectionStarted(true);
    setSelectedId(library.layouts[0]?.id ?? null);
  }

  /** Selecting another Slot, or none, ends editing a placeholder. */
  function selectSlot(slotId: string | null) {
    if (slotId !== selectedSlotId) setEditingPlaceholder(null);
    setSelectedSlotId(slotId);
  }

  const layoutIndex = library?.layouts.findIndex((layout) => layout.id === selectedId) ?? -1;
  const layout = layoutIndex >= 0 ? library!.layouts[layoutIndex] : null;
  const savedAlbum = useMemo(() => layout ? layoutAlbum(layout, format) : null, [layout, format]);

  const dimensions = pageDimensions(format);
  const { bleedMm, safeZoneMm } = format;
  const fullWidth = dimensions.widthMm + 2 * bleedMm;
  const fullHeight = dimensions.heightMm + 2 * bleedMm;
  const scale = Math.max(0, Math.min((viewport.width - 48) / fullWidth, (viewport.height - 48) / fullHeight));
  const pageWidth = fullWidth * scale;
  const pageHeight = fullHeight * scale;
  const originX = (viewport.width - pageWidth) / 2;
  const originY = (viewport.height - pageHeight) / 2;
  const trimLeft = originX + bleedMm * scale;
  const trimTop = originY + bleedMm * scale;
  const trimWidth = dimensions.widthMm * scale;
  const trimHeight = dimensions.heightMm * scale;
  const dragPreview = slotDrag && savedAlbum && scale > 0 ? applySlotDrag(savedAlbum, slotDrag, trimWidth, trimHeight, true) : null;
  const slots = (dragPreview?.album ?? savedAlbum)?.pages[0].slots ?? [];
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => { stopSlotDrag.current?.(); }, []);

  useEffect(() => {
    if (selectedSlot?.type !== "text" || fonts !== null) return;
    let current = true;
    fontPorts.list().then((names) => {
      if (current) {
        setFonts(names);
        setFontError(null);
      }
    }).catch((cause: unknown) => {
      if (current) setFontError(`Could not list system fonts: ${String(cause)}`);
    });
    return () => { current = false; };
  }, [selectedSlot?.type, fontPorts, fonts, fontRetry]);

  const editable = !disabled;
  const layoutSelected = layout !== null;
  const slotSelected = selectedSlot !== null;
  useEffect(() => {
    onStateChange?.({ editable, layoutSelected, slotSelected });
  }, [editable, layoutSelected, slotSelected, onStateChange]);
  useEffect(() => () => onStateChange?.({ editable: false, layoutSelected: false, slotSelected: false }), [onStateChange]);

  function changeLayout(update: (album: Album) => Album) {
    const id = selectedId;
    if (!id) return;
    changeLibrary((current) => {
      const target = current.layouts.find((item) => item.id === id);
      if (!target) throw new Error("Layout not found in the Layout Library.");
      const before = layoutAlbum(target, format);
      return setLayoutSlots(current, id, fitTextSlots(update(before), before, true).pages[0].slots, pageAspectRatio(format));
    });
  }

  function selectLayout(id: string | null) {
    stopSlotDrag.current?.();
    setSelectedId(id);
    selectSlot(null);
    setCanvasMenu(null);
  }

  function addSlot(type: "photo" | "text", centre?: { x: number; y: number }) {
    if (disabled || !savedAlbum) return;
    const add = type === "photo" ? addPhotoSlot : addTextSlot;
    const added = add(savedAlbum, LAYOUT_PAGE, centre).pages[0].slots.at(-1)!;
    changeLayout((current) => add(current, LAYOUT_PAGE, centre));
    selectSlot(added.id);
  }

  function removeSlot(slotId: string) {
    selectSlot(null);
    changeLayout((current) => deleteSlot(current, LAYOUT_PAGE, slotId));
  }

  function requestDeleteSlot(slotId = selectedSlot?.id) {
    if (!slotId || disabled) return;
    if (confirmSlotDeletion) {
      setNeverAsk(false);
      setDeleteError(null);
      setSlotDeleteTarget(slotId);
    } else {
      removeSlot(slotId);
    }
  }

  async function confirmDeleteSlot() {
    if (!slotDeleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (neverAsk) {
        if (!setConfirmSlotDeletion) throw new Error("Preferences are unavailable.");
        await setConfirmSlotDeletion(false);
      }
      removeSlot(slotDeleteTarget);
      setSlotDeleteTarget(null);
    } catch (cause) {
      setDeleteError(`Could not save preference: ${String(cause)}`);
    } finally {
      setDeleting(false);
    }
  }

  function confirmDeleteLayout() {
    const id = layoutDeleteTarget;
    const current = library;
    setLayoutDeleteTarget(null);
    if (!id || !current) return;
    const index = current.layouts.findIndex((item) => item.id === id);
    if (!changeLibrary((latest) => deleteLayout(latest, id))) return;
    const remaining = current.layouts.filter((item) => item.id !== id);
    selectLayout(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
  }

  function rotateSelectedSlot(turn: 90 | -90) {
    if (!selectedSlot || disabled) return;
    const slotId = selectedSlot.id;
    changeLayout((current) => rotateSlot(current, LAYOUT_PAGE, slotId, turn));
  }

  function changeTextStyle(style: Partial<TextStyle>) {
    if (selectedSlot?.type !== "text") return;
    const slotId = selectedSlot.id;
    changeLayout((current) => {
      const slot = current.pages[0].slots.find((item) => item.id === slotId);
      if (slot?.type !== "text") throw new Error("Text Slot not found in Layout.");
      return setTextStyle(current, LAYOUT_PAGE, slotId, { ...slot.style, ...style });
    });
  }

  function toggleTextShortcut(event: ReactKeyboardEvent, slot: Slot): boolean {
    if (slot.type !== "text" || disabled || event.altKey || (!event.ctrlKey && !event.metaKey)) return false;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i" && key !== "u") return false;
    event.preventDefault();
    event.stopPropagation();
    selectSlot(slot.id);
    const property = key === "b" ? "bold" : key === "i" ? "italic" : "underline";
    changeLayout((current) => {
      const currentSlot = current.pages[0].slots.find((item) => item.id === slot.id);
      if (currentSlot?.type !== "text") throw new Error("Text Slot not found in Layout.");
      return setTextStyle(current, LAYOUT_PAGE, slot.id, { ...currentSlot.style, [property]: !currentSlot.style[property] });
    });
    return true;
  }

  function startSlotDrag(event: ReactMouseEvent, slotId: string, kind: SlotDrag["kind"]) {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectSlot(slotId);
    if (disabled) return;
    event.preventDefault();
    stopSlotDrag.current?.();
    const slot = slots.find((item) => item.id === slotId);
    const startX = event.clientX;
    const startY = event.clientY;
    const sidewaysText = slot?.type === "text" && (slot.rotation === 90 || slot.rotation === 270);
    let latest: SlotDrag = { pageId: LAYOUT_PAGE, slotId, kind, dx: 0, dy: 0, bypass: event.altKey };
    const offset = (moved: MouseEvent): SlotDrag => ({
      pageId: LAYOUT_PAGE, slotId, kind, dx: kind === "resize" && sidewaysText ? 0 : moved.clientX - startX,
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
      if (drag.dx !== 0 || drag.dy !== 0) changeLayout((current) => applySlotDrag(current, drag, trimWidth, trimHeight, true).album);
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

  useEffect(() => {
    if (!command || handledCommand.current === command.serial) return;
    handledCommand.current = command.serial;
    const current = library;
    if (!current || disabled) return;
    if (command.name === "new-layout") {
      const created = newLayout(current, pageAspectRatio(format));
      if (changeLibrary(() => created.library)) selectLayout(created.id);
    } else if (command.name === "duplicate-layout" && layout) {
      const copy = duplicateLayout(current, layout.id);
      if (changeLibrary(() => copy.library)) selectLayout(copy.id);
    } else if (command.name === "delete-layout" && layout) {
      setLayoutDeleteTarget(layout.id);
    } else if (command.name === "add-photo-slot") addSlot("photo");
    else if (command.name === "add-text-slot") addSlot("text");
  });

  useEffect(() => {
    const deleteSelected = (event: KeyboardEvent) => {
      if (!active || event.key !== "Delete" || event.defaultPrevented || !selectedSlot) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      if (document.querySelector("[aria-modal='true']")) return;
      event.preventDefault();
      requestDeleteSlot();
    };
    window.addEventListener("keydown", deleteSelected);
    return () => window.removeEventListener("keydown", deleteSelected);
  });

  useEffect(() => {
    if (!canvasMenu) return;
    const close = () => setCanvasMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", escape); };
  }, [canvasMenu]);

  const pane = (
    <LayoutLibraryPane layouts={layouts} format={format} selectedId={selectedId}
      emptyText="No Layouts yet. Use New Layout in the command bar." onClick={(item) => selectLayout(item.id)} />
  );

  return (
    <section className="workspace layout-workspace" aria-label="Layouts">
      {paneHost && createPortal(pane, paneHost)}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {layouts.saveStatus === "error" && (
        <button type="button" className="button-quiet" onClick={layouts.retrySave}>Retry save</button>
      )}
      {layout && madeForOtherAspectRatio(layout, format) && (
        <p className="usage-warning" role="status">This Layout was made for Pages with a different aspect ratio.</p>
      )}
      <section className="album-editor layout-editor" aria-label="Layout canvas">
        <div className="canvas-viewport" ref={viewportRef} role="group" aria-label="Layout editor">
          {!layout && library && <p className="photo-empty layout-empty">Select a Layout, or create one with New Layout.</p>}
          {layout && viewport.width > 0 && viewport.height > 0 && scale > 0 && (
            <Stage width={viewport.width} height={viewport.height}>
              <Layer>
                <LayerPage x={originX} y={originY} width={pageWidth} height={pageHeight}
                  bleed={bleedMm * scale} safeZone={safeZoneMm * scale}>
                  {slots.map((slot) => {
                    const rect = { x: trimLeft + slot.x * trimWidth, y: trimTop + slot.y * trimHeight, width: slot.width * trimWidth, height: slot.height * trimHeight };
                    const sideways = slot.rotation === 90 || slot.rotation === 270;
                    const local = { x: 0, y: 0, width: sideways ? rect.height : rect.width, height: sideways ? rect.width : rect.height };
                    return (
                      <Group key={slot.id} x={rect.x + rect.width / 2} y={rect.y + rect.height / 2}
                        offsetX={local.width / 2} offsetY={local.height / 2} rotation={slot.rotation ?? 0}>
                        {slot.type === "text"
                          ? <TextContent slot={slot} id={slot.id} rect={local} scale={scale} format={format}
                            hidden={editingPlaceholder === slot.id} showPlaceholder onOverflow={ignoreOverflow} />
                          : <Rect {...local} fill="#e8ebe6" stroke="#9aa49c" strokeWidth={1} dash={[4, 3]} />}
                      </Group>
                    );
                  })}
                </LayerPage>
              </Layer>
            </Stage>
          )}
          {layout && scale > 0 && <button type="button" className="canvas-page-hit" aria-label="Layout Page"
            style={{ left: originX, top: originY, width: pageWidth, height: pageHeight }}
            onClick={() => selectSlot(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectSlot(null);
              if (disabled) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              setCanvasMenu({
                x: event.clientX, y: event.clientY, kind: "page",
                centre: {
                  x: (event.clientX - bounds.left - bleedMm * scale) / trimWidth,
                  y: (event.clientY - bounds.top - bleedMm * scale) / trimHeight,
                },
              });
            }} />}
          {layout && scale > 0 && slots.map((slot, index) => {
            const name = `${slot.type === "photo" ? "Photo" : "Text"} Slot ${index + 1}`;
            return (
              <div key={slot.id} className="slot-overlay" role="button" tabIndex={0} aria-label={name}
                aria-pressed={slot.id === selectedSlot?.id}
                style={{ left: trimLeft + slot.x * trimWidth, top: trimTop + slot.y * trimHeight, width: slot.width * trimWidth, height: slot.height * trimHeight }}
                onMouseDown={(event) => startSlotDrag(event, slot.id, "move")}
                onClick={(event) => { event.stopPropagation(); selectSlot(slot.id); }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectSlot(slot.id);
                  if (!disabled) setCanvasMenu({ x: event.clientX, y: event.clientY, kind: "slot", slotId: slot.id });
                }}
                title={slot.type === "text" ? "Double-click to edit the placeholder" : undefined}
                onDoubleClick={() => { if (!disabled && slot.type === "text") setEditingPlaceholder(slot.id); }}
                onKeyDown={(event) => {
                  if (toggleTextShortcut(event, slot)) return;
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    selectSlot(slot.id);
                    if (event.key === "Enter" && slot.type === "text" && !disabled) setEditingPlaceholder(slot.id);
                  } else if ((event.key === "Delete" || event.key === "Backspace") && !disabled) {
                    event.preventDefault();
                    selectSlot(slot.id);
                    requestDeleteSlot(slot.id);
                  }
                }}>
                {slot.type === "text" && editingPlaceholder === slot.id && (
                  <textarea className="slot-text-editor" aria-label={`Edit the placeholder of ${name}`} autoFocus
                    value={slot.placeholder} disabled={disabled}
                    style={{
                      ...(slot.rotation ? {
                        inset: "auto", left: "50%", top: "50%",
                        width: slot.rotation === 90 || slot.rotation === 270 ? slot.height * trimHeight : slot.width * trimWidth,
                        height: slot.rotation === 90 || slot.rotation === 270 ? slot.width * trimWidth : slot.height * trimHeight,
                        transform: `translate(-50%, -50%) rotate(${slot.rotation}deg)`,
                      } : {}),
                      fontFamily: slot.style.fontFamily, fontSize: slot.style.fontSize / POINTS_PER_MM * scale,
                      color: slot.style.color, opacity: 0.6, fontWeight: slot.style.bold ? "bold" : "normal",
                      fontStyle: slot.style.italic ? "italic" : "normal", textAlign: slot.style.align,
                      textDecoration: slot.style.underline ? "underline" : "none", lineHeight: TEXT_LINE_HEIGHT,
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (toggleTextShortcut(event, slot)) return;
                      event.stopPropagation();
                      if (event.key === "Escape") setEditingPlaceholder(null);
                    }}
                    onChange={(event) => {
                      const placeholder = event.target.value;
                      changeLayout((current) => setSlotPlaceholder(current, LAYOUT_PAGE, slot.id, placeholder));
                    }} />
                )}
                {!disabled && (
                  <span className={`slot-resize-handle${slot.type === "text" ? slot.rotation === 90 || slot.rotation === 270 ? " slot-resize-handle--text-sideways" : " slot-resize-handle--text" : ""}`}
                    aria-label={`Resize ${name}`} role="button"
                    onMouseDown={(event) => startSlotDrag(event, slot.id, "resize")} />
                )}
              </div>
            );
          })}
          {slotDrag && dragPreview && dragPreview.guides.length > 0 && (
            <SnapGuides guides={dragPreview.guides} width={viewport.width} height={viewport.height}
              trimLeft={trimLeft} trimTop={trimTop} trimWidth={trimWidth} trimHeight={trimHeight} />
          )}
          {active && toolsHost && selectedSlot && createPortal(<Fragment key={`${selectedId}:${selectedSlot.id}`}>
            {selectedSlot.type === "text" ? (
              <TextSlotTools style={selectedSlot.style} fonts={fonts} fontError={fontError} disabled={disabled}
                onShortcut={(event) => toggleTextShortcut(event, selectedSlot)}
                onStyle={changeTextStyle} onCommit={ignoreCommit}
                onRetryFonts={() => { setFontError(null); setFontRetry((value) => value + 1); }}>
                <SlotActions disabled={disabled} onRotate={rotateSelectedSlot} onDelete={() => requestDeleteSlot()} />
              </TextSlotTools>
            ) : (
              <PhotoSlotTools fit={null} content={false} disabled={disabled} onFit={ignoreCommit} onZoom={ignoreCommit}
                onRotate={rotateSelectedSlot} onDelete={() => requestDeleteSlot()} />
            )}
          </Fragment>, toolsHost)}
        </div>
        <div className="workspace-footer">
          <span>{layout && library ? `LAYOUT ${layoutIndex + 1} OF ${library.layouts.length}` : "NO LAYOUT SELECTED"}</span>
          <span className="guide-legend">
            <span>Bleed: {bleedMm} mm</span><span>Trim edge</span><span>Safe Zone: {safeZoneMm} mm</span>
            <span>Hold Alt for free placement</span>
          </span>
        </div>
      </section>
      {canvasMenu?.kind === "page" && <div role="menu" className="strip-menu" aria-label="Layout actions"
        style={{ left: Math.min(canvasMenu.x, window.innerWidth - 220), top: Math.min(canvasMenu.y, window.innerHeight - 100) }}>
        <button role="menuitem" type="button"
          onClick={() => { addSlot("photo", canvasMenu.centre); setCanvasMenu(null); }}>Add Photo Slot</button>
        <button role="menuitem" type="button"
          onClick={() => { addSlot("text", canvasMenu.centre); setCanvasMenu(null); }}>Add Text Slot</button>
      </div>}
      {canvasMenu?.kind === "slot" && (() => {
        const { slotId } = canvasMenu;
        const close = () => setCanvasMenu(null);
        return <div role="menu" className="strip-menu" aria-label="Slot actions"
          style={{ left: Math.min(canvasMenu.x, window.innerWidth - 220), top: Math.min(canvasMenu.y, window.innerHeight - 130) }}>
          <button role="menuitem" type="button"
            onClick={() => { changeLayout((current) => rotateSlot(current, LAYOUT_PAGE, slotId, -90)); close(); }}>Rotate left</button>
          <button role="menuitem" type="button"
            onClick={() => { changeLayout((current) => rotateSlot(current, LAYOUT_PAGE, slotId, 90)); close(); }}>Rotate right</button>
          <button role="menuitem" type="button" onClick={() => { requestDeleteSlot(slotId); close(); }}>Delete</button>
        </div>;
      })()}
      {layoutDeleteTarget && <ModalDialog label="Delete Layout?" onClose={() => setLayoutDeleteTarget(null)}>
        <h2>Delete Layout?</h2>
        <p>Pages it was already applied to keep their Slots.</p>
        <div className="album-toolbar">
          <button type="button" onClick={confirmDeleteLayout}>Delete Layout</button>
          <button type="button" onClick={() => setLayoutDeleteTarget(null)}>Cancel</button>
        </div>
      </ModalDialog>}
      {slotDeleteTarget && <ModalDialog label="Delete Slot?" closeDisabled={deleting} onClose={() => setSlotDeleteTarget(null)}>
        <h2>Delete Slot?</h2>
        <label><input type="checkbox" checked={neverAsk} onChange={(event) => setNeverAsk(event.target.checked)} /> Never ask again</label>
        {deleteError && <p role="alert">{deleteError}</p>}
        <div className="album-toolbar">
          <button type="button" disabled={deleting} onClick={() => void confirmDeleteSlot()}>Delete</button>
          <button type="button" disabled={deleting} onClick={() => setSlotDeleteTarget(null)}>Cancel</button>
        </div>
      </ModalDialog>}
    </section>
  );
}

function ignoreOverflow() {}
function ignoreCommit() {}
