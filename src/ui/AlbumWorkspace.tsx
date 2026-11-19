import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  canRedo, canUndo, createAlbum, deserializeAlbum, emptyHistory, endGroup, recordChange, relinkPlacements, serializeAlbum, stepHistory,
  type Album, type AlbumPorts, type HistoryDirection, type PhotoPreviewPorts, type PlacementRelink, type UndoHistory,
} from "../core";
import AlbumView from "./AlbumView";
import ModalDialog from "./ModalDialog";
import { tauriAlbumPorts } from "./tauriAlbumPorts";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { tauriFontPorts, type FontPorts } from "./tauriFontPorts";
import { fitTextSlots } from "./textLayout";
import type { LayoutLibraryState } from "./useLayoutLibrary";

export type AlbumCommandName = "album-settings" | "add-spread" | "add-photo-slot" | "add-text-slot" | "save-as-layout" | "undo" | "redo";

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
  layouts?: AlbumLayouts;
  photoMoves?: PhotoMoveLink;
}

/** The shared Layout Library, and where Album mode lists it: the Layouts tab of the Side pane. */
export interface AlbumLayouts {
  state: LayoutLibraryState;
  paneHost: HTMLElement | null;
}

export default function AlbumWorkspace({ root, ports = tauriAlbumPorts, photoPorts = tauriPhotoPorts, fontPorts = tauriFontPorts, onBusyChange, onAlbumChange, document, suspended = false, bar = {}, active = true, layouts, photoMoves }: Props) {
  const { command, onEditableChange, onHistoryChange } = bar;
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ filename: string; album: Album } | null>(
    () => document ? { filename: document.path, album: fitTextSlots(document.album) } : null,
  );
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    if (command.name === "album-settings" && currentRef.current && !suspended) setSettingsOpen(true);
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
        pageCount: Number(form.get("pageCount")),
        bleedMm: Number(form.get("bleedMm")),
        safeZoneMm: Number(form.get("safeZoneMm")),
        dpi: Number(form.get("dpi")),
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
      {notice && (
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
          <label>Page Format<select name="pageFormat" disabled={busy}><option>A4 - landscape (297 x 210 mm)</option></select></label>
          <label>Bleed (mm)<input name="bleedMm" type="number" min="0" step="any" defaultValue="3" required disabled={busy} /></label>
          <label>Safe Zone (mm)<input name="safeZoneMm" type="number" min="0" max="104.99" step="any" defaultValue="5" required disabled={busy} /></label>
          <label>Export resolution (DPI)<input name="dpi" type="number" min="1" step="any" defaultValue="300" required disabled={busy} /></label>
          <label>Page count<input name="pageCount" type="number" min="2" max="10000" step="2" defaultValue="2" required disabled={busy} /></label>
          <div className="album-toolbar">
            <button type="submit" className="button-primary" disabled={busy}>Create Album</button>
            <button type="button" className="button-quiet" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      ) : current ? (
        <>
          {settingsOpen && (
            <ModalDialog label="Album settings" onClose={() => setSettingsOpen(false)}>
              <form id="album-settings" className="album-settings" aria-label="Album settings"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  changeAlbum((album) => ({ ...album, title: document ? String(form.get("title")) : album.title, pageFormat: {
                    ...album.pageFormat,
                    bleedMm: Number(form.get("bleedMm")),
                    safeZoneMm: Number(form.get("safeZoneMm")),
                    dpi: Number(form.get("dpi")),
                  } }));
                }}>
                <h2>Album settings</h2>
                {error && <p className="error-banner" role="alert">{error}</p>}
                <fieldset disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"}>
                  {document && <label>Title<textarea name="title" defaultValue={current.album.title} rows={2} /></label>}
                  <p className="album-details">Page Format: A4 landscape (297 x 210 mm)</p>
                  <label>Bleed (mm)<input name="bleedMm" type="number" min="0" step="any"
                    defaultValue={current.album.pageFormat.bleedMm} required /></label>
                  <label>Safe Zone (mm)<input name="safeZoneMm" type="number" min="0" max="104.99" step="any"
                    defaultValue={current.album.pageFormat.safeZoneMm} required /></label>
                  <label>Export resolution (DPI)<input name="dpi" type="number" min="1" step="any"
                    defaultValue={current.album.pageFormat.dpi} required /></label>
                </fieldset>
                <div className="album-toolbar">
                  <button type="submit" className="button-primary"
                    disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"}>Apply print settings</button>
                  <button type="button" className="button-quiet" onClick={() => setSettingsOpen(false)}>Close</button>
                </div>
              </form>
            </ModalDialog>
          )}
          <AlbumView key={current.filename} album={current.album} onChange={changeAlbum} history={history}
            root={root} photoPorts={photoPorts} fontPorts={fontPorts}
            bar={bar} active={active} layouts={layouts} onNotice={setNotice}
            onDuplicatePhoto={setDuplicateWarning}
            onCropPendingChange={setCropPending}
            textDisabled={suspended || busy || saveStatus === "error"}
            disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"} />
        </>
      ) : <p className="photo-empty">Open an Album or create a new one.</p>}
    </section>
  );
}
