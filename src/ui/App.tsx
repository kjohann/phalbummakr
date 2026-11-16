import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { dirname } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createAlbum, deserializeAlbum, serializeAlbum, type Album } from "../core";
import AlbumWorkspace from "./AlbumWorkspace";
import PhotoBrowser from "./PhotoBrowser";

interface Settings {
  lastAlbum: string | null;
  recentAlbums: string[];
}

export interface DocumentPorts {
  settings(): Promise<Settings>;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, json: string, create: boolean): Promise<void>;
  remember(path: string): Promise<void>;
  forget(path: string): Promise<void>;
  close(): Promise<void>;
  parent(path: string): Promise<string>;
  chooseNew(): Promise<string | null>;
  chooseOpen(): Promise<string | null>;
}

const filters = [{ name: "Album", extensions: ["phalbum"] }];
const desktopPorts: DocumentPorts = {
  settings: () => invoke("album_settings"),
  exists: (path) => invoke("album_exists", { path }),
  read: (path) => invoke("read_album_file", { path }),
  write: (path, json, create) => invoke("write_album_file", { path, json, create }),
  remember: (path) => invoke("remember_album", { path }),
  forget: (path) => invoke("forget_album", { path }),
  close: () => invoke("close_album"),
  parent: dirname,
  chooseNew: () => save({ defaultPath: "New Album.phalbum", filters }),
  chooseOpen: () => open({ multiple: false, directory: false, filters }),
};

interface OpenDocument {
  id: number;
  path: string;
  root: string;
  album: Album;
}

function DocumentWorkspace({ document, onBusyChange, onTitleChange, hidden, suspended }: {
  document: OpenDocument;
  onBusyChange: (busy: boolean) => void;
  onTitleChange: (album: Album | null) => void;
  hidden: boolean;
  suspended: boolean;
}) {
  const [album, setAlbum] = useState<Album | null>(document.album);
  const reportAlbum = useCallback((next: Album | null) => {
    setAlbum(next);
    onTitleChange(next);
  }, [onTitleChange]);
  return (
    <div className="library-workspace" style={{ display: hidden ? "none" : undefined }}>
      <PhotoBrowser root={document.root} album={album} />
      <AlbumWorkspace root={document.root} document={document} suspended={suspended} onBusyChange={onBusyChange} onAlbumChange={reportAlbum} />
    </div>
  );
}

export default function App({ ports = desktopPorts }: { ports?: DocumentPorts }) {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const operationRef = useRef(false);
  const documentId = useRef(0);
  const menuRef = useRef<Menu | null>(null);
  const menuRecent = useRef<string[] | null>(null);
  const menuQueue = useRef<Promise<void>>(Promise.resolve());

  const reportBusy = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value || operationRef.current);
  }, []);
  const reportTitle = useCallback((album: Album | null) => setTitle(album?.title ?? null), []);

  async function refreshRecent() {
    setRecent((await ports.settings()).recentAlbums);
  }

  async function load(path: string) {
    if (!(await ports.exists(path))) {
      await ports.forget(path);
      await refreshRecent();
      setError(`Album file no longer exists: ${path}`);
      return;
    }
    const album = deserializeAlbum(await ports.read(path));
    const root = await ports.parent(path);
    if (busyRef.current) throw new Error("The current Album has unsaved changes; retry after saving.");
    setDocument({ id: ++documentId.current, path, root, album });
    setTitle(album.title);
    setDraft(null);
    await ports.remember(path);
    await refreshRecent();
  }

  async function run(action: () => Promise<void>, label: string) {
    if (busyRef.current || operationRef.current) {
      setError("Please wait for the Album operation to finish, or retry its failed save.");
      return;
    }
    operationRef.current = true;
    setTransitioning(true);
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(`${label}: ${String(cause)}`);
    } finally {
      operationRef.current = false;
      setTransitioning(false);
      setBusy(busyRef.current);
    }
  }

  useEffect(() => {
    let active = true;
    operationRef.current = true;
    async function restore() {
      try {
        const settings = await ports.settings();
        if (!active) return;
        setRecent(settings.recentAlbums);
        const path = settings.lastAlbum;
        if (!path) return;
        if (!(await ports.exists(path))) {
          if (!active) return;
          await ports.forget(path);
          if (active) {
            setRecent((await ports.settings()).recentAlbums);
            setError(`Last Album file no longer exists: ${path}`);
          }
          return;
        }
        const album = deserializeAlbum(await ports.read(path));
        const root = await ports.parent(path);
        if (!active) return;
        setDocument({ id: ++documentId.current, path, root, album });
        setTitle(album.title);
        await ports.remember(path);
        if (active) setRecent((await ports.settings()).recentAlbums);
      } catch (cause) {
        if (active) setError(`Could not restore Album: ${String(cause)}`);
      } finally {
        if (active) {
          operationRef.current = false;
          setBusy(busyRef.current);
          setRestoring(false);
        }
      }
    }
    void restore();
    return () => { active = false; };
  }, [ports]);

  const actions = useRef<{ newAlbum: () => void; openAlbum: () => void; openRecent: (path: string) => void; closeAlbum: () => void; exit: () => void }>(
    { newAlbum: () => {}, openAlbum: () => {}, openRecent: () => {}, closeAlbum: () => {}, exit: () => {} },
  );
  actions.current = {
    newAlbum: () => void run(async () => {
      const path = await ports.chooseNew();
      if (path) setDraft(path);
    }, "Could not create Album"),
    openAlbum: () => void run(async () => {
      const path = await ports.chooseOpen();
      if (path) await load(path);
    }, "Could not open Album"),
    openRecent: (path) => void run(() => load(path), "Could not open Album"),
    closeAlbum: () => void run(async () => {
      await ports.close();
      setDocument(null);
      setTitle(null);
      setDraft(null);
    }, "Could not close Album"),
    exit: () => {
      if (isTauri()) void getCurrentWindow().close().catch((cause: unknown) => setError(`Could not close window: ${String(cause)}`));
    },
  };

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onCloseRequested((event) => {
      if (busyRef.current || operationRef.current) {
        event.preventDefault();
        setError("Please wait for the Album operation to finish, or retry its failed save, before closing.");
      }
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch((cause: unknown) => {
      if (active) setError(`Could not protect unsaved Albums on close: ${String(cause)}`);
    });
    return () => { active = false; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    getCurrentWindow().setTitle(title === null ? "phalbummakr" : `${title} — phalbummakr`)
      .catch((cause: unknown) => setError(`Could not set window title: ${String(cause)}`));
  }, [title]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    menuQueue.current = menuQueue.current.then(async () => {
      if (!active) return;
      // Replacing a Windows menu briefly resizes the WebView.
      if (menuRef.current && menuRecent.current === recent) {
        const file = await menuRef.current.get("file");
        if (!file) throw new Error("The File menu is missing.");
        try {
          if (!("get" in file)) throw new Error("The File menu is not a submenu.");
          const enabledById = {
            "new-album": !busy && !restoring,
            "open-album": !busy && !restoring,
            "open-recent": !busy && !restoring && recent.length > 0,
            "close-album": !busy && !restoring && (document !== null || draft !== null),
          };
          for (const [id, enabled] of Object.entries(enabledById)) {
            const item = await file.get(id);
            if (!item) throw new Error(`The File menu item ${id} is missing.`);
            try {
              if (!("setEnabled" in item)) throw new Error(`The File menu item ${id} cannot be enabled.`);
              await item.setEnabled(enabled);
            } finally {
              await item.close();
            }
          }
        } finally {
          await file.close();
        }
        return;
      }
      const menu = await Menu.new({ items: [{
        id: "file",
        text: "File",
        items: [
          { id: "new-album", text: "New Album…", enabled: !busy && !restoring, action: () => actions.current.newAlbum() },
          { id: "open-album", text: "Open Album…", enabled: !busy && !restoring, action: () => actions.current.openAlbum() },
          { id: "open-recent", text: "Open Recent", enabled: !busy && !restoring && recent.length > 0, items: recent.map((path) => ({
            text: path.replaceAll("&", "&&"), action: () => actions.current.openRecent(path),
          })) },
          { id: "close-album", text: "Close Album", enabled: !busy && !restoring && (document !== null || draft !== null), action: () => actions.current.closeAlbum() },
          { text: "Exit", action: () => actions.current.exit() },
        ],
      }] });
      if (!active) { await menu.close(); return; }
      try {
        const previous = await menu.setAsAppMenu();
        const previousOwned = menuRef.current;
        menuRef.current = menu;
        menuRecent.current = recent;
        await previous?.close();
        await previousOwned?.close();
      } catch (cause) {
        if (menuRef.current !== menu) await menu.close();
        throw cause;
      }
    }).catch((cause: unknown) => {
      if (active) setError(`Could not update File menu: ${String(cause)}`);
    });
    return () => { active = false; };
  }, [recent, busy, restoring, document, draft]);

  useEffect(() => () => {
    menuQueue.current = menuQueue.current.then(async () => {
      await menuRef.current?.close();
      menuRef.current = null;
    }).catch((cause: unknown) => console.error("Could not release File menu:", cause));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const album = createAlbum({
        name: String(form.get("title")),
        pageCount: Number(form.get("pageCount")),
        startingSide: form.get("startingSide") === "left" ? "left" : "right",
        bleedMm: Number(form.get("bleedMm")),
        safeZoneMm: Number(form.get("safeZoneMm")),
        dpi: Number(form.get("dpi")),
      });
      await ports.write(draft, serializeAlbum(album), true);
      const root = await ports.parent(draft);
      if (busyRef.current) throw new Error("The previous Album has unsaved changes; retry after saving.");
      setDocument({ id: ++documentId.current, path: draft, root, album });
      setTitle(album.title);
      setDraft(null);
      await ports.remember(draft);
      await refreshRecent();
    }, "Could not create Album");
  }

  return (
    <main className="app-shell">
      {error && <p className="error-banner" role="alert">{error}</p>}
      {draft ? (
        <form className="album-form new-album-form" role="dialog" aria-modal="true" onSubmit={(event) => void create(event)} aria-label="Album settings">
          <h1>Album settings</h1>
          <label>Title<textarea name="title" defaultValue="New Album" autoFocus disabled={busy} rows={2} /></label>
          <label>Page Format<select name="pageFormat" disabled={busy}><option>A4 - landscape (297 x 210 mm)</option></select></label>
          <label>Bleed (mm)<input name="bleedMm" type="number" min="0" step="any" defaultValue="3" required disabled={busy} /></label>
          <label>Safe Zone (mm)<input name="safeZoneMm" type="number" min="0" max="104.99" step="any" defaultValue="5" required disabled={busy} /></label>
          <label>Export resolution (DPI)<input name="dpi" type="number" min="1" step="any" defaultValue="300" required disabled={busy} /></label>
          <label>Page 1 side<select name="startingSide" defaultValue="right" disabled={busy}><option value="right">Right</option><option value="left">Left</option></select></label>
          <label>Page count<input name="pageCount" type="number" min="1" max="10000" step="1" defaultValue="24" required disabled={busy} /></label>
          <div className="album-toolbar">
            <button type="submit" className="button-primary" disabled={busy}>Create Album</button>
            <button type="button" className="button-quiet" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      ) : !document && !restoring && (
        <section className="welcome" aria-label="Open an Album">
          <h1>Open an Album</h1>
          <button type="button" className="button-primary" onClick={actions.current.newAlbum} disabled={busy}>New Album…</button>
          <button type="button" className="button-quiet" onClick={actions.current.openAlbum} disabled={busy}>Open Album…</button>
          {recent.length > 0 && <><h2>Recent Albums</h2><ul>{recent.map((path) => (
            <li key={path}><button type="button" className="button-quiet" disabled={busy}
              onClick={() => actions.current.openRecent(path)}>{path}</button></li>
          ))}</ul></>}
        </section>
      )}
      {document && <DocumentWorkspace key={document.id} document={document} onBusyChange={reportBusy}
        onTitleChange={reportTitle} hidden={draft !== null} suspended={transitioning} />}
    </main>
  );
}
