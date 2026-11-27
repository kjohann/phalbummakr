import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  adjustPageBoundary, canRedo, canUndo, createAlbum, deserializeAlbum, emptyHistory, endGroup, pageDimensions, recordChange, relinkPlacements, scaleAlbum, serializeAlbum, stepHistory,
  type Album, type AlbumPorts, type ContentIndexStats, type HistoryDirection, type PhotoIdentity, type PhotoPreviewPorts, type PhotoSize, type PlacementRelink, type UndoHistory,
} from "../core";
import AlbumView from "./AlbumView";
import ExportDialog from "./ExportDialog";
import { PageFormatChoices, PrintSettingsFields, readPageChoice, readPrintSettings } from "./AlbumFormatFields";
import ModalDialog from "./ModalDialog";
import { tauriPageExportPorts, type PageExportPorts } from "./pageExport";
import { tauriAlbumPorts } from "./tauriAlbumPorts";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { tauriFontPorts, type FontPorts } from "./tauriFontPorts";
import { fitTextSlots } from "./textLayout";
import type { LayoutLibraryState } from "./useLayoutLibrary";

export type AlbumCommandName = "album-settings" | "add-spread" | "add-photo-slot" | "add-text-slot" | "save-as-layout" | "undo" | "redo" | "export-pages";

/** What the open document can currently undo and redo. */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

/** The open Album's undo history, as AlbumView uses it. */
export interface AlbumHistory {
  /** Undoes or redoes one step, returning the Album before and after; null when there is nothing to step to. */
  step: (direction: HistoryDirection) => { before: Album; after: Album } | null;
  /** Makes the next change a new undo step, e.g. when the user leaves the text being typed. */
  endGroup: () => void;
}

/** A command bar command for the open Album; `serial` makes repeated commands distinct. */
export interface AlbumCommand {
  name: AlbumCommandName;
  serial: number;
}

/**
 * Runs a Photo move or Folder rename against the open Album. Edits and autosave pause while `move`
 * runs with the current Album, which `move` writes to disk itself. The Album then adopts the new
 * Photo paths `move` returns, outside undo.
 */
export type PhotoMoveRunner = <T extends PlacementRelink>(move: (album: Album) => Promise<T>) => Promise<T>;

/** Where the open Album puts its Photo move runner for the Photo pane to use. */
export interface PhotoMoveLink {
  current: PhotoMoveRunner | null;
}

/** How the open Album and the command bar talk to each other. */
export interface CommandBarLink {
  command?: AlbumCommand;
  /** Where the selected Slot's tools render: the middle of the command bar. */
  toolsHost?: HTMLElement | null;
  onSlotSelectedChange?: (selected: boolean) => void;
  /** Whether Album commands can currently change the Album. Stays true while an autosave is only pending. */
  onEditableChange?: (editable: boolean) => void;
  onHistoryChange?: (history: HistoryState) => void;
}

interface Props {
  root: string;
  ports?: AlbumPorts;
  photoPorts?: PhotoPreviewPorts;
  fontPorts?: FontPorts;
  onBusyChange?: (busy: boolean) => void;
  onAlbumChange?: (album: Album | null) => void;
  document?: { path: string; album: Album };
  suspended?: boolean;
  bar?: CommandBarLink;
  /** False while another mode is shown; the hidden workspace then leaves keyboard shortcuts alone. */
  active?: boolean;
  /** Whether Album mode is selected, even if a temporary form hides the workspace. */
  clipboardActive?: boolean;
  layouts?: AlbumLayouts;
  photoMoves?: PhotoMoveLink;
  exportPorts?: PageExportPorts;
  /** Scanned pixel sizes of the Library's Photos by path, for Effective Resolution warnings. */
  photoSizes?: ReadonlyMap<string, PhotoSize>;
  /** Content identities supplied by the Library index; omitted by standalone workspaces. */
  photoIdentities?: ReadonlyMap<string, PhotoIdentity>;
  contentIndexStats?: ContentIndexStats | null;
}

/** The shared Layout Library, and where Album mode lists it: the Layouts tab of the Side pane. */
export interface AlbumLayouts {
  state: LayoutLibraryState;
  paneHost: HTMLElement | null;
}

const NO_PHOTO_SIZES: ReadonlyMap<string, PhotoSize> = new Map();

export default function AlbumWorkspace({ root, ports = tauriAlbumPorts, photoPorts = tauriPhotoPorts, fontPorts = tauriFontPorts, onBusyChange, onAlbumChange, document, suspended = false, bar = {}, active = true, clipboardActive = active, layouts, photoMoves, exportPorts = tauriPageExportPorts, photoSizes = NO_PHOTO_SIZES, photoIdentities, contentIndexStats }: Props) {
  const { command, onEditableChange, onHistoryChange } = bar;
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ filename: string; album: Album } | null>(
    () => document ? { filename: document.path, album: fitTextSlots(document.album) } : null,
  );
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dimensionMode, setDimensionMode] = useState<"scale" | "boundary">("scale");
  const [dimensionWidth, setDimensionWidth] = useState("");
  const [dimensionHeight, setDimensionHeight] = useState("");
  const [pendingDimensions, setPendingDimensions] = useState<{ before: Album; after: Album; mode: "scale" | "boundary" } | null>(null);
  // The Album as it was when Export Pages was chosen; later edits don't change the export.
  const [exporting, setExporting] = useState<{ filename: string; album: Album } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clipboardVersion, setClipboardVersion] = useState(0);
  // A failed Layout Library save makes "Saved … as a new Layout" untrue.
  const layoutSaveFailed = layouts?.state.saveStatus === "error";
  useEffect(() => {
    if (layoutSaveFailed) setNotice(null);
  }, [layoutSaveFailed]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "saving" | "error">(
    () => document && current && serializeAlbum(current.album) !== serializeAlbum(document.album) ? "pending" : "saved",
  );
  const [cropPending, setCropPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [listing, setListing] = useState(!document);
  const savedJson = useRef<string | null>(document ? serializeAlbum(document.album) : null);
  // Gesture callbacks can outlive a render, so apply them to the latest Album.
  const currentRef = useRef(current);
  // Kept only for the session: reopening an Album starts with an empty history.
  const historyRef = useRef(emptyHistory<Album>());
  const [historyState, setHistoryState] = useState<HistoryState>({ canUndo: false, canRedo: false });
  const saveInFlight = useRef(false);
  // Settles when the autosave being written finishes, so a Photo move can wait for it.
  const savePromise = useRef<Promise<boolean>>(Promise.resolve(true));
  const moving = useRef(false);
  const locked = busy || listing || saveStatus !== "saved" || cropPending;
  const handledCommand = useRef(command?.serial);

  useEffect(() => {
    if (!command || handledCommand.current === command.serial) return;
    handledCommand.current = command.serial;
    if (command.name === "album-settings" && currentRef.current && !suspended) {
      const { widthMm, heightMm } = pageDimensions(currentRef.current.album.pageFormat);
      setDimensionWidth(String(widthMm / 10));
      setDimensionHeight(String(heightMm / 10));
      setDimensionMode("scale");
      setPendingDimensions(null);
      setError(null);
      setSettingsOpen(true);
    }
    if (command.name === "export-pages" && currentRef.current && !suspended) setExporting(currentRef.current);
  }, [command, suspended]);

  function setCurrentAlbum(next: typeof current) {
    currentRef.current = next;
    setCurrent(next);
  }

  function setHistory(next: UndoHistory<Album>) {
    historyRef.current = next;
    setHistoryState((previous) => previous.canUndo === canUndo(next) && previous.canRedo === canRedo(next)
      ? previous : { canUndo: canUndo(next), canRedo: canRedo(next) });
  }

  useEffect(() => {
    onHistoryChange?.(historyState);
  }, [historyState, onHistoryChange]);
  useEffect(() => () => onHistoryChange?.({ canUndo: false, canRedo: false }), [onHistoryChange]);

  useEffect(() => {
    if (document) return;
    let active = true;
    setListing(true);
    ports.list(root).then((albums) => {
      if (active) setNames(albums);
    }).catch((cause: unknown) => {
      if (active) setError(`Could not list Albums: ${String(cause)}`);
    }).finally(() => {
      if (active) setListing(false);
    });
    return () => { active = false; };
  }, [root, ports, refresh, document]);

  useEffect(() => {
    onBusyChange?.(locked);
  }, [locked, onBusyChange]);

  const editable = current !== null && !suspended && !busy && !listing && !cropPending
    && saveStatus !== "saving" && saveStatus !== "error";
  useEffect(() => {
    onEditableChange?.(editable);
  }, [editable, onEditableChange]);

  useEffect(() => {
    onAlbumChange?.(current?.album ?? null);
  }, [current?.album, onAlbumChange]);

  useEffect(() => {
    if (!current || busy || cropPending || saveInFlight.current || saveStatus === "error") return;
    const json = serializeAlbum(current.album);
    if (json === savedJson.current) {
      setSaveStatus("saved");
      return;
    }
    const timer = window.setTimeout(() => {
      saveInFlight.current = true;
      setSaveStatus("saving");
      savePromise.current = ports.write(root, current.filename, json, false).then(() => {
        saveInFlight.current = false;
        savedJson.current = json;
        const latest = currentRef.current;
        setSaveStatus(latest?.filename === current.filename && serializeAlbum(latest.album) === json ? "saved" : "pending");
        return true;
      }).catch((cause: unknown) => {
        saveInFlight.current = false;
        setError(`Could not save Album: ${String(cause)}`);
        setSaveStatus("error");
        return false;
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [current, root, ports, retry, cropPending, saveStatus, busy]);

  async function runPhotoMove<T extends PlacementRelink>(move: (album: Album) => Promise<T>): Promise<T> {
    if (!currentRef.current || suspended || busy || listing || cropPending || moving.current) {
      throw new Error("The open Album is busy. Try again in a moment.");
    }
    if (saveStatus === "error") throw new Error("The open Album could not be saved. Retry saving it first.");
    moving.current = true;
    setBusy(true);
    try {
      if (!await savePromise.current) throw new Error("The open Album could not be saved. Retry saving it first.");
      const present = currentRef.current;
      const moves = await move(present.album);
      setClipboardVersion((version) => version + 1);
      const relinked = relinkPlacements(present.album, moves);
      // The move wrote the relinked Album to its file, so it is already saved.
      if (relinked !== present.album) savedJson.current = serializeAlbum(relinked);
      const { past, future } = historyRef.current;
      setHistory({
        ...historyRef.current,
        past: past.map((album) => relinkPlacements(album, moves)),
        future: future.map((album) => relinkPlacements(album, moves)),
      });
      setCurrentAlbum({ ...present, album: relinked });
      return moves;
    } finally {
      moving.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!photoMoves) return;
    photoMoves.current = runPhotoMove;
    return () => { photoMoves.current = null; };
  });

  useEffect(() => {
    if (!locked) return;
    function preventUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [locked]);

  async function open(name: string) {
    setBusy(true);
    setError(null);
    try {
      const album = deserializeAlbum(await ports.read(root, name));
      const fitted = fitTextSlots(album);
      savedJson.current = serializeAlbum(album);
      setSaveStatus(fitted === album ? "saved" : "pending");
      setHistory(emptyHistory());
      setCurrentAlbum({ filename: name, album: fitted });
      setDuplicateWarning(null);
      setCreating(false);
      setSettingsOpen(false);
    } catch (cause) {
      setError(`Could not open Album: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const album = createAlbum({
        name: String(form.get("name")),
        dimensions: readPageChoice(form),
        pageCount: Number(form.get("pageCount")),
        ...readPrintSettings(form),
      });
      await ports.write(root, album.title, serializeAlbum(album), true);
      savedJson.current = serializeAlbum(album);
      setSaveStatus("saved");
      setNames((previous) => [...new Set([...previous, album.title])].sort());
      setHistory(emptyHistory());
      setCurrentAlbum({ filename: album.title, album });
      setDuplicateWarning(null);
      setCreating(false);
      setSettingsOpen(false);
    } catch (cause) {
      setError(`Could not create Album: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  /** Applies a change as one undo step; consecutive changes in the same `group` share a step. */
  function changeAlbum(update: (album: Album) => Album, group?: string) {
    if (suspended) return;
    const previous = currentRef.current;
    if (!previous) return;
    try {
      const album = update(previous.album);
      if (album === previous.album) return;
      serializeAlbum(album);
      setError(null);
      setHistory(recordChange(historyRef.current, previous.album, group));
      showAlbum({ ...previous, album });
    } catch (cause) {
      setError(`Could not update Album: ${String(cause)}`);
    }
  }

  function showAlbum(next: { filename: string; album: Album }) {
    setSaveStatus(saveInFlight.current ? "saving" : "pending");
    setCurrentAlbum(next);
  }

  const history: AlbumHistory = {
    step: (direction) => {
      const present = currentRef.current;
      if (!present || suspended) return null;
      const result = stepHistory(historyRef.current, present.album, direction);
      if (!result) return null;
      setError(null);
      setHistory(result.history);
      showAlbum({ ...present, album: result.state });
      return { before: present.album, after: result.state };
    },
    endGroup: () => {
      if (historyRef.current.group !== undefined) setHistory(endGroup(historyRef.current));
    },
  };

  return (
    <section className="workspace album-workspace" aria-label="Album workspace">
      {!document && <><div className="album-toolbar">
        <h1>Albums</h1>
        <button type="button" className="button-quiet" disabled={locked || creating} onClick={() => {
          setError(null);
          setRefresh((value) => value + 1);
        }}>Refresh Albums</button>
        <button type="button" className="button-primary" disabled={locked} onClick={() => { setError(null); setCreating(true); }}>
          New Album
        </button>
      </div>
      <nav className="album-list" aria-label="Albums">
        {names.map((name) => (
          <button type="button" className="button-quiet" key={name} disabled={locked}
            aria-label={`Open Album ${name}`} aria-current={current?.filename === name ? "page" : undefined}
            onClick={() => void open(name)}>{name}</button>
        ))}
      </nav></>}
      {error && !settingsOpen && <p className="error-banner" role="alert">{error}</p>}
      {duplicateWarning && (
        <div className="usage-warning" role="status">
          <span>{duplicateWarning} is already used in this Album.</span>
          <button type="button" className="button-quiet" onClick={() => setDuplicateWarning(null)}>Dismiss</button>
        </div>
      )}
      {notice && !layoutSaveFailed && (
        <div className="usage-warning" role="status">
          <span>{notice}</span>
          <button type="button" className="button-quiet" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {layouts?.state.error && <p className="error-banner" role="alert">{layouts.state.error}</p>}
      {layouts?.state.saveStatus === "error" && (
        <button type="button" className="button-quiet" onClick={layouts.state.retrySave}>Retry Layout Library save</button>
      )}
      {saveStatus === "error" && (
        <button type="button" className="button-quiet" onClick={() => {
          setError(null);
          setSaveStatus("pending");
          setRetry((value) => value + 1);
        }}>Retry save</button>
      )}
      {creating ? (
        <form className="album-form" onSubmit={(event) => void create(event)} aria-label="New Album">
          <h2>New Album</h2>
          <label>Name<input name="name" required maxLength={100} autoFocus disabled={busy} /></label>
          <PageFormatChoices disabled={busy} />
          <PrintSettingsFields disabled={busy} />
          <label>Page count<input name="pageCount" type="number" min="2" max="10000" step="2" defaultValue="2" required disabled={busy} /></label>
          <div className="album-toolbar">
            <button type="submit" className="button-primary" disabled={busy}>Create Album</button>
            <button type="button" className="button-quiet" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      ) : current ? (
        <>
          {settingsOpen && (
            <ModalDialog label="Album settings" onClose={() => { setSettingsOpen(false); setPendingDimensions(null); }}>
              <form id="album-settings" className="album-settings" aria-label="Album settings"
                hidden={pendingDimensions !== null}
                style={pendingDimensions ? { display: "none" } : undefined}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const album = currentRef.current?.album;
                  if (!album) return;
                  const original = pageDimensions(album.pageFormat);
                  const widthMm = Number(dimensionWidth) * 10;
                  const heightMm = Number(dimensionHeight) * 10;
                  try {
                    const settings = readPrintSettings(form);
                    if (!dimensionWidth || !dimensionHeight || !Number.isFinite(widthMm) || widthMm <= 0
                      || !Number.isFinite(heightMm) || heightMm <= 0) throw new Error("Page dimensions must be positive numbers in cm.");
                    const changed = Math.abs(widthMm - original.widthMm) > 1e-8 || Math.abs(heightMm - original.heightMm) > 1e-8;
                    const result = !changed ? { ...album, pageFormat: { ...album.pageFormat, ...settings } }
                      : dimensionMode === "scale" ? scaleAlbum(album, widthMm / original.widthMm, settings)
                        : adjustPageBoundary(album, { widthMm, heightMm }, settings);
                    const after = { ...result, title: document ? String(form.get("title")) : album.title };
                    serializeAlbum(after);
                    setError(null);
                    if (changed) setPendingDimensions({ before: album, after, mode: dimensionMode });
                    else changeAlbum(() => after);
                  } catch (cause) {
                    setError(`Could not update Album: ${String(cause)}`);
                  }
                }}>
                <h2>Album settings</h2>
                {error && <p className="error-banner" role="alert">{error}</p>}
                <fieldset disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"}>
                  {document && <label>Title<textarea name="title" defaultValue={current.album.title} rows={2} /></label>}
                  <fieldset>
                    <legend>Page dimensions</legend>
                    <label className="dimension-operation"><input type="radio" name="dimensionMode" checked={dimensionMode === "scale"}
                      onChange={() => {
                        setDimensionMode("scale");
                        const { widthMm, heightMm } = pageDimensions(current.album.pageFormat);
                        const width = Number(dimensionWidth);
                        setDimensionHeight(width > 0 ? String(Number((width * heightMm / widthMm).toPrecision(12))) : "");
                      }} /> Scale proportionally</label>
                    <p>Linked dimensions scale Slots and text together, preserving Photo framing.</p>
                    <label className="dimension-operation"><input type="radio" name="dimensionMode" checked={dimensionMode === "boundary"}
                      onChange={() => setDimensionMode("boundary")} /> Adjust page boundary</label>
                    <p>Independent dimensions preserve Slot positions and sizes. Prepare every Page and the current Safe Zone first.</p>
                    <label>Page width (cm)<input type="number" min="0" step="any" required value={dimensionWidth}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDimensionWidth(value);
                        if (dimensionMode === "scale") {
                          const { widthMm, heightMm } = pageDimensions(current.album.pageFormat);
                          setDimensionHeight(Number(value) > 0 ? String(Number((Number(value) * heightMm / widthMm).toPrecision(12))) : "");
                        }
                      }} /></label>
                    <label>Page height (cm)<input type="number" min="0" step="any" required value={dimensionHeight}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDimensionHeight(value);
                        if (dimensionMode === "scale") {
                          const { widthMm, heightMm } = pageDimensions(current.album.pageFormat);
                          setDimensionWidth(Number(value) > 0 ? String(Number((Number(value) * widthMm / heightMm).toPrecision(12))) : "");
                        }
                      }} /></label>
                  </fieldset>
                  <PrintSettingsFields format={current.album.pageFormat} />
                </fieldset>
                <details>
                  <summary>Diagnostics</summary>
                  <h3>Content index statistics</h3>
                  {contentIndexStats ? <p>{contentIndexStats.hashedFiles} files hashed ({contentIndexStats.hashedBytes.toLocaleString()} bytes),
                    {" "}{contentIndexStats.cacheHits} cached; {contentIndexStats.elapsedMs.toFixed(1)} ms indexing.</p>
                    : <p>Content index statistics are not available while checking Photos.</p>}
                </details>
                <div className="album-toolbar">
                  <button type="submit" className="button-primary"
                    disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"}>Apply print settings</button>
                  <button type="button" className="button-quiet" onClick={() => setSettingsOpen(false)}>Close</button>
                </div>
              </form>
              {pendingDimensions && <div>
                <h2>Confirm dimension change</h2>
                <p>{pendingDimensions.mode === "scale"
                  ? "Slots and text will scale proportionally; Photo framing is preserved. Margins change only if edited."
                  : "The Page boundary will change without moving or resizing Slots or changing Photo framing."} Check all Pages after applying.</p>
                <div className="album-toolbar">
                  <button type="button" className="button-primary" autoFocus
                    disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"} onClick={() => {
                    if (currentRef.current?.album !== pendingDimensions.before) {
                      setError("The Album changed. Review the settings and try again.");
                      setPendingDimensions(null);
                      return;
                    }
                    changeAlbum(() => pendingDimensions.after);
                    setPendingDimensions(null);
                    setSettingsOpen(false);
                    setNotice("Page dimensions changed. Please check all Pages.");
                  }}>Confirm dimension change</button>
                  <button type="button" className="button-quiet" onClick={() => setPendingDimensions(null)}>Cancel dimension change</button>
                </div>
              </div>}
            </ModalDialog>
          )}
          {exporting && (
            <ExportDialog album={exporting.album} root={root} ports={exportPorts} photoSizes={photoSizes} onClose={() => setExporting(null)}
              name={exporting.filename.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "")} />
          )}
          <AlbumView key={current.filename} album={current.album} onChange={changeAlbum} history={history} photoIdentities={photoIdentities}
            root={root} photoPorts={photoPorts} fontPorts={fontPorts} photoSizes={photoSizes}
            bar={bar} active={active} clipboardActive={clipboardActive} layouts={layouts} onNotice={setNotice} clipboardVersion={clipboardVersion} onClipboardError={setError}
            onDuplicatePhoto={setDuplicateWarning}
            onCropPendingChange={setCropPending}
            textDisabled={suspended || busy || saveStatus === "error"}
            disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"} />
        </>
      ) : <p className="photo-empty">Open an Album or create a new one.</p>}
    </section>
  );
}
