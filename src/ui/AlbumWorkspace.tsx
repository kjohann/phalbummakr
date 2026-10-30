import { useEffect, useRef, useState, type FormEvent } from "react";
import { createAlbum, deserializeAlbum, serializeAlbum, type Album, type AlbumPorts } from "../core";
import AlbumView from "./AlbumView";
import { tauriAlbumPorts } from "./tauriAlbumPorts";

interface Props {
  root: string;
  ports?: AlbumPorts;
  onBusyChange?: (busy: boolean) => void;
}

export default function AlbumWorkspace({ root, ports = tauriAlbumPorts, onBusyChange }: Props) {
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<{ filename: string; album: Album } | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [retry, setRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [listing, setListing] = useState(true);
  const savedJson = useRef<string | null>(null);
  const locked = busy || listing || saveStatus !== "saved";

  useEffect(() => {
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
  }, [root, ports, refresh]);

  useEffect(() => {
    onBusyChange?.(locked);
  }, [locked, onBusyChange]);

  useEffect(() => {
    if (!current) return;
    const json = serializeAlbum(current.album);
    if (json === savedJson.current) {
      setSaveStatus("saved");
      return;
    }
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      ports.write(root, current.filename, json, false).then(() => {
        savedJson.current = json;
        setSaveStatus("saved");
      }).catch((cause: unknown) => {
        setError(`Could not save Album: ${String(cause)}`);
        setSaveStatus("error");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [current, root, ports, retry]);

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
      savedJson.current = serializeAlbum(album);
      setSaveStatus("saved");
      setCurrent({ filename: name, album });
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
        startingSide: form.get("startingSide") === "left" ? "left" : "right",
        bleedMm: Number(form.get("bleedMm")),
        safeZoneMm: Number(form.get("safeZoneMm")),
        dpi: Number(form.get("dpi")),
      });
      await ports.write(root, album.name, serializeAlbum(album), true);
      savedJson.current = serializeAlbum(album);
      setSaveStatus("saved");
      setNames((previous) => [...new Set([...previous, album.name])].sort());
      setCurrent({ filename: album.name, album });
      setCreating(false);
      setSettingsOpen(false);
    } catch (cause) {
      setError(`Could not create Album: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  function changeAlbum(update: (album: Album) => Album) {
    if (!current) return;
    try {
      const album = update(current.album);
      serializeAlbum(album);
      setError(null);
      setSaveStatus("pending");
      setCurrent({ ...current, album });
    } catch (cause) {
      setError(`Could not update Album: ${String(cause)}`);
    }
  }

  return (
    <section className="workspace album-workspace" aria-label="Album workspace">
      <div className="album-toolbar">
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
      </nav>
      {error && <p className="error-banner" role="alert">{error}</p>}
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
          <label>Page 1 side<select name="startingSide" defaultValue="right" disabled={busy}><option value="right">Right</option><option value="left">Left</option></select></label>
          <label>Page count<input name="pageCount" type="number" min="1" max="10000" step="1" defaultValue="24" required disabled={busy} /></label>
          <div className="album-toolbar">
            <button type="submit" className="button-primary" disabled={busy}>Create Album</button>
            <button type="button" className="button-quiet" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      ) : current ? (
        <>
          <div className="album-toolbar"><h2>{current.album.name}</h2><span>{current.album.pages.length} Pages</span></div>
          <p className="album-details">A4 landscape - 297 x 210 mm - {current.album.pageFormat.dpi} DPI</p>
          <div className="album-toolbar">
            <div className="album-settings-wrapper">
              <button type="button" className="button-quiet" aria-expanded={settingsOpen}
                aria-controls="album-settings" onClick={() => setSettingsOpen(!settingsOpen)}>Album settings</button>
              {settingsOpen && (
                <form id="album-settings" className="album-form album-settings" aria-label="Album settings"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    changeAlbum((album) => ({ ...album, pageFormat: {
                      ...album.pageFormat,
                      bleedMm: Number(form.get("bleedMm")),
                      safeZoneMm: Number(form.get("safeZoneMm")),
                      dpi: Number(form.get("dpi")),
                    } }));
                  }}>
                  <h3>Album settings</h3>
                  <fieldset disabled={busy || saveStatus === "saving" || saveStatus === "error"}>
                    <label>Page 1 side
                      <select value={current.album.startingSide} onChange={(event) => {
                        const startingSide = event.target.value === "left" ? "left" : "right";
                        changeAlbum((album) => ({ ...album, startingSide }));
                      }}>
                        <option value="right">Right</option><option value="left">Left</option>
                      </select>
                    </label>
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
            <span role="status">{saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Not saved" : "Saving..."}</span>
          </div>
          <AlbumView key={current.filename} album={current.album} onChange={changeAlbum}
            disabled={busy || saveStatus === "saving" || saveStatus === "error"} />
        </>
      ) : <p className="photo-empty">Open an Album or create a new one.</p>}
    </section>
  );
}
