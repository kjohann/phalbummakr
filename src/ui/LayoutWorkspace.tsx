import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Group, Layer, Rect, Stage } from "react-konva";
import {
  addPhotoSlot, addTextSlot, deleteLayout, deleteSlot, duplicateLayout, madeForOtherAspectRatio, newLayout, pageAspectRatio, pageDimensions,
  readLayoutLibrary, rotateSlot, serializeLayoutLibrary, setLayoutSlots, setTextStyle,
  type Album, type Layout, type LayoutLibrary, type LayoutPorts, type PageFormat, type Slot, type TextStyle,
} from "../core";
import ModalDialog from "./ModalDialog";
import { applySlotDrag, LayerPage, SnapGuides, TextContent, type SlotDrag } from "./pageCanvas";
import { PhotoSlotTools, SlotActions } from "./SlotTools";
import { tauriFontPorts, type FontPorts } from "./tauriFontPorts";
import { tauriLayoutPorts } from "./tauriLayoutPorts";
import { fitTextSlots } from "./textLayout";
import TextSlotTools from "./TextSlotTools";

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
  root: string;
  /** The open Album's Page Format: the canvas uses its aspect ratio, Bleed and Safe Zone. */
  format: PageFormat;
  ports?: LayoutPorts;
  fontPorts?: FontPorts;
  /** Where the Layout Library is listed: the Photo pane. */
  paneHost: HTMLElement | null;
  /** False while another mode is shown; the hidden workspace then leaves keyboard shortcuts and the bar alone. */
  active: boolean;
  bar?: LayoutBarLink;
  onBusyChange?: (busy: boolean) => void;
  confirmSlotDeletion?: boolean;
  setConfirmSlotDeletion?: (value: boolean) => Promise<void>;
}

const LAYOUT_PAGE = "layout";
const SAMPLE_TEXT = "Sample text";

/** Edits a Layout through the same Slot operations as a Page, as a one-Page Album. */
function layoutAlbum(layout: Layout, format: PageFormat): Album {
  return { schemaVersion: 2, title: "", pageFormat: format, pages: [{ id: LAYOUT_PAGE, background: "#ffffff", slots: layout.slots }] };
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function layoutLabel(layout: Layout, index: number) {
  const photos = layout.slots.filter((slot) => slot.type === "photo").length;
  const texts = layout.slots.length - photos;
  const parts = [photos && plural(photos, "Photo Slot"), texts && plural(texts, "Text Slot")].filter(Boolean);
  return `Layout ${index + 1}: ${parts.length ? parts.join(", ") : "empty"}`;
}

function LayoutPreview({ layout }: { layout: Layout }) {
  const width = 100 * layout.aspectRatio;
  return (
    <svg className="layout-preview" viewBox={`0 0 ${width} 100`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect className="layout-preview-page" x={0} y={0} width={width} height={100} />
      {layout.slots.map((slot) => {
        const rect = { x: slot.x * width, y: slot.y * 100, width: slot.width * width, height: slot.height * 100 };
        return slot.type === "photo"
          ? <rect key={slot.id} className="layout-preview-photo" {...rect} />
          : <g key={slot.id}>
            <rect className="layout-preview-text" {...rect} />
            <line className="layout-preview-text-line" x1={rect.x + rect.width * 0.2} x2={rect.x + rect.width * 0.8}
              y1={rect.y + rect.height / 2} y2={rect.y + rect.height / 2} />
          </g>;
      })}
    </svg>
  );
}

export default function LayoutWorkspace({ root, format, ports = tauriLayoutPorts, fontPorts = tauriFontPorts, paneHost, active, bar = {}, onBusyChange, confirmSlotDeletion = true, setConfirmSlotDeletion }: Props) {
  const { command, toolsHost, onStateChange } = bar;
  const [library, setLibraryState] = useState<LayoutLibrary | null>(null);
  const libraryRef = useRef<LayoutLibrary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [retry, setRetry] = useState(0);
  const savedJson = useRef<string | null>(null);
  const saveInFlight = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
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
  const formatRef = useRef(format);
  formatRef.current = format;

  function setLibrary(next: LayoutLibrary | null) {
    libraryRef.current = next;
    setLibraryState(next);
  }

  useEffect(() => {
    let current = true;
    setLoadError(null);
    ports.read(root).then((json) => {
      if (!current) return;
      const loaded = readLayoutLibrary(json ?? null, formatRef.current);
      // A seeded Library is only written once it is edited, so `.phalbummakr/` is not created just by looking.
      savedJson.current = serializeLayoutLibrary(loaded);
      setLibrary(loaded);
      setSelectedId(loaded.layouts[0]?.id ?? null);
    }).catch((cause: unknown) => {
      if (current) setLoadError(`Could not load the Layout Library: ${String(cause)}`);
    });
    return () => { current = false; };
  }, [root, ports, reload]);

  useEffect(() => {
    if (!library || saveInFlight.current || saveStatus === "error") return;
    const json = serializeLayoutLibrary(library);
    if (json === savedJson.current) {
      setSaveStatus("saved");
      return;
    }
    const timer = window.setTimeout(() => {
      saveInFlight.current = true;
      setSaveStatus("saving");
      ports.write(root, json).then(() => {
        saveInFlight.current = false;
        savedJson.current = json;
        const latest = libraryRef.current;
        setSaveStatus(latest && serializeLayoutLibrary(latest) === json ? "saved" : "pending");
      }).catch((cause: unknown) => {
        saveInFlight.current = false;
        setError(`Could not save the Layout Library: ${String(cause)}`);
        setSaveStatus("error");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [library, root, ports, retry, saveStatus]);

  useEffect(() => {
    onBusyChange?.(saveStatus !== "saved");
  }, [saveStatus, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const disabled = library === null || saveStatus === "saving" || saveStatus === "error";
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
  const dragPreview = slotDrag && savedAlbum && scale > 0 ? applySlotDrag(savedAlbum, slotDrag, trimWidth, trimHeight) : null;
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

  function changeLibrary(update: (library: LayoutLibrary) => LayoutLibrary): boolean {
    const previous = libraryRef.current;
    if (!previous || disabled) return false;
    try {
      const next = update(previous);
      serializeLayoutLibrary(next);
      setError(null);
      setSaveStatus(saveInFlight.current ? "saving" : "pending");
      setLibrary(next);
      return true;
    } catch (cause) {
      setError(`Could not update the Layout Library: ${String(cause)}`);
      return false;
    }
  }

  function changeLayout(update: (album: Album) => Album) {
    const id = selectedId;
    if (!id) return;
    changeLibrary((current) => {
      const target = current.layouts.find((item) => item.id === id);
      if (!target) throw new Error("Layout not found in the Layout Library.");
      const before = layoutAlbum(target, format);
      return setLayoutSlots(current, id, fitTextSlots(update(before), before).pages[0].slots, pageAspectRatio(format));
    });
  }

  function selectLayout(id: string | null) {
    stopSlotDrag.current?.();
    setSelectedId(id);
    setSelectedSlotId(null);
    setCanvasMenu(null);
  }

  function addSlot(type: "photo" | "text", centre?: { x: number; y: number }) {
    if (disabled || !savedAlbum) return;
    const add = type === "photo" ? addPhotoSlot : addTextSlot;
    const added = add(savedAlbum, LAYOUT_PAGE, centre).pages[0].slots.at(-1)!;
    changeLayout((current) => add(current, LAYOUT_PAGE, centre));
    setSelectedSlotId(added.id);
  }

  function removeSlot(slotId: string) {
    setSelectedSlotId(null);
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
    const current = libraryRef.current;
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
    setSelectedSlotId(slot.id);
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
    setSelectedSlotId(slotId);
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
      if (drag.dx !== 0 || drag.dy !== 0) changeLayout((current) => applySlotDrag(current, drag, trimWidth, trimHeight).album);
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
    const current = libraryRef.current;
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
    <div className="layout-pane">
      <div className="photo-browser-header">
        <h2 className="layout-pane-title">Layouts</h2>
        {library && <span className="photo-count">{plural(library.layouts.length, "Layout")}</span>}
      </div>
      {loadError ? (
        <div className="photo-empty" role="alert">
          {loadError}{" "}
          <button type="button" className="button-quiet" onClick={() => setReload((value) => value + 1)}>Retry</button>
        </div>
      ) : !library ? <p className="photo-empty">Loading Layouts…</p>
        : library.layouts.length === 0 ? <p className="photo-empty">No Layouts yet. Use New Layout in the command bar.</p>
          : <ul className="layout-grid" aria-label="Layout Library">
            {library.layouts.map((item, index) => (
              <li key={item.id}>
                <button type="button" className="layout-card" aria-label={layoutLabel(item, index)}
                  aria-pressed={item.id === selectedId} title={layoutLabel(item, index)}
                  onClick={() => selectLayout(item.id)}>
                  <LayoutPreview layout={item} />
                  {madeForOtherAspectRatio(item, format) && <span className="layout-badge">Other aspect ratio</span>}
                </button>
              </li>
            ))}
          </ul>}
    </div>
  );

  return (
    <section className="workspace layout-workspace" aria-label="Layouts">
      {paneHost && createPortal(pane, paneHost)}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {saveStatus === "error" && (
        <button type="button" className="button-quiet" onClick={() => {
          setError(null);
          setSaveStatus("pending");
          setRetry((value) => value + 1);
        }}>Retry save</button>
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
                          ? <TextContent slot={{ ...slot, text: SAMPLE_TEXT }} id={slot.id} rect={local} scale={scale} format={format}
                            hidden={false} onOverflow={ignoreOverflow} />
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
            onClick={() => setSelectedSlotId(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedSlotId(null);
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
                onClick={(event) => { event.stopPropagation(); setSelectedSlotId(slot.id); }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedSlotId(slot.id);
                  if (!disabled) setCanvasMenu({ x: event.clientX, y: event.clientY, kind: "slot", slotId: slot.id });
                }}
                onKeyDown={(event) => {
                  if (toggleTextShortcut(event, slot)) return;
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    setSelectedSlotId(slot.id);
                  } else if ((event.key === "Delete" || event.key === "Backspace") && !disabled) {
                    event.preventDefault();
                    setSelectedSlotId(slot.id);
                    requestDeleteSlot(slot.id);
                  }
                }}>
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
