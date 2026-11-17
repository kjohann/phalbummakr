import { useEffect, useRef, useState, type FormEvent } from "react";
import { createAlbum, deserializeAlbum, serializeAlbum, type Album, type AlbumPorts, type PhotoPreviewPorts } from "../core";
import AlbumView from "./AlbumView";
import { tauriAlbumPorts } from "./tauriAlbumPorts";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { tauriFontPorts, type FontPorts } from "./tauriFontPorts";
import { fitTextSlots } from "./textLayout";

interface Props {
  root: string;
  ports?: AlbumPorts;
  photoPorts?: PhotoPreviewPorts;
  fontPorts?: FontPorts;
  onBusyChange?: (busy: boolean) => void;
  onAlbumChange?: (album: Album | null) => void;
  document?: { path: string; album: Album };
  suspended?: boolean;
  confirmSpreadDeletion?: boolean;
  setConfirmSpreadDeletion?: (value: boolean) => Promise<void>;
}

export default function AlbumWorkspace({ root, ports = tauriAlbumPorts, photoPorts = tauriPhotoPorts, fontPorts = tauriFontPorts, onBusyChange, onAlbumChange, document, suspended = false, confirmSpreadDeletion = true, setConfirmSpreadDeletion }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ filename: string; album: Album } | null>(
    () => document ? { filename: document.path, album: fitTextSlots(document.album) } : null,
  );
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
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
  const saveInFlight = useRef(false);
  const locked = busy || listing || saveStatus !== "saved" || cropPending;

  function setCurrentAlbum(next: typeof current) {
    currentRef.current = next;
    setCurrent(next);
  }

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

  useEffect(() => {
    onAlbumChange?.(current?.album ?? null);
  }, [current?.album, onAlbumChange]);

  useEffect(() => {
    if (!current || cropPending || saveInFlight.current || saveStatus === "error") return;
    const json = serializeAlbum(current.album);
    if (json === savedJson.current) {
      setSaveStatus("saved");
      return;
    }
    const timer = window.setTimeout(() => {
      saveInFlight.current = true;
      setSaveStatus("saving");
      ports.write(root, current.filename, json, false).then(() => {
        saveInFlight.current = false;
        savedJson.current = json;
        const latest = currentRef.current;
        setSaveStatus(latest?.filename === current.filename && serializeAlbum(latest.album) === json ? "saved" : "pending");
      }).catch((cause: unknown) => {
        saveInFlight.current = false;
        setError(`Could not save Album: ${String(cause)}`);
        setSaveStatus("error");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [current, root, ports, retry, cropPending, saveStatus]);

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

  function changeAlbum(update: (album: Album) => Album) {
    if (suspended) return;
    const previous = currentRef.current;
    if (!previous) return;
    try {
      const album = update(previous.album);
      serializeAlbum(album);
      setError(null);
      setSaveStatus(saveInFlight.current ? "saving" : "pending");
      setCurrentAlbum({ ...previous, album });
    } catch (cause) {
      setError(`Could not update Album: ${String(cause)}`);
    }
  }

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
      {error && <p className="error-banner" role="alert">{error}</p>}
      {duplicateWarning && (
        <div className="usage-warning" role="status">
          <span>{duplicateWarning} is already used in this Album.</span>
          <button type="button" className="button-quiet" onClick={() => setDuplicateWarning(null)}>Dismiss</button>
        </div>
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
          <div className="album-toolbar"><h2>{current.album.title}</h2><span>{current.album.pages.length} Pages</span></div>
          <p className="album-details">A4 landscape - 297 x 210 mm - {current.album.pageFormat.dpi} DPI</p>
          <div className="album-toolbar">
            <div className="album-settings-wrapper">
              <button type="button" className="button-quiet" disabled={suspended} aria-expanded={settingsOpen}
                aria-controls="album-settings" onClick={() => setSettingsOpen(!settingsOpen)}>Album settings</button>
              {settingsOpen && (
                <form id="album-settings" className="album-form album-settings" aria-label="Album settings"
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
                  <h3>Album settings</h3>
                  <fieldset disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"}>
                    {document && <label>Title<textarea name="title" defaultValue={current.album.title} rows={2} /></label>}
                    <p className="album-details">Page Format: A4 landscape (297 x 210 mm)</p>
                    <label>Bleed (mm)<input name="bleedMm" type="number" min="0" step="any"
                      defaultValue={current.album.pageFormat.bleedMm} required /></label>
                    <label>Safe Zone (mm)<input name="safeZoneMm" type="number" min="0" max="104.99" step="any"
                      defaultValue={current.album.pageFormat.safeZoneMm} required /></label>
                    <label>Export resolution (DPI)<input name="dpi" type="number" min="1" step="any"
                      defaultValue={current.album.pageFormat.dpi} required /></label>
                    <button type="submit" className="button-primary">Apply print settings</button>
                  </fieldset>
                </form>
              )}
            </div>
          </div>
          <AlbumView key={current.filename} album={current.album} onChange={changeAlbum}
            root={root} photoPorts={photoPorts} fontPorts={fontPorts}
            confirmSpreadDeletion={confirmSpreadDeletion} setConfirmSpreadDeletion={setConfirmSpreadDeletion}
            onDuplicatePhoto={setDuplicateWarning}
            onCropPendingChange={setCropPending}
            textDisabled={suspended || busy || saveStatus === "error"}
            disabled={suspended || busy || saveStatus === "saving" || saveStatus === "error"} />
        </>
      ) : <p className="photo-empty">Open an Album or create a new one.</p>}
    </section>
  );
}
