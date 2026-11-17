import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { dirname } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createAlbum, deserializeAlbum, serializeAlbum, type Album } from "../core";
import AlbumWorkspace, { type AlbumCommand, type AlbumCommandName } from "./AlbumWorkspace";
import PhotoBrowser from "./PhotoBrowser";
import PhotoPane, { clampPaneWidth, DEFAULT_PHOTO_PANE, type PhotoPaneSettings } from "./PhotoPane";
import ModalDialog from "./ModalDialog";

interface Settings {
  lastAlbum: string | null;
  recentAlbums: string[];
  confirmSpreadDeletion: boolean;
  confirmSlotDeletion: boolean;
  photoPane?: PhotoPaneSettings;
}

export interface DocumentPorts {
  settings(): Promise<Settings>;
  setConfirmSpreadDeletion(value: boolean): Promise<void>;
  setConfirmSlotDeletion(value: boolean): Promise<void>;
  setPhotoPane(pane: PhotoPaneSettings): Promise<void>;
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
  setConfirmSpreadDeletion: (value) => invoke("set_confirm_spread_deletion", { value }),
  setConfirmSlotDeletion: (value) => invoke("set_confirm_slot_deletion", { value }),
  setPhotoPane: (pane) => invoke("set_photo_pane", { pane }),
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

interface DeletionPreferences {
  confirmSpreadDeletion: boolean;
  setConfirmSpreadDeletion: (value: boolean) => Promise<void>;
  confirmSlotDeletion: boolean;
  setConfirmSlotDeletion: (value: boolean) => Promise<void>;
}

function DocumentWorkspace({ document, onBusyChange, onTitleChange, hidden, suspended, command, onSlotSelectedChange, preferences, photoPane, onPhotoPaneChange }: {
  document: OpenDocument;
  onBusyChange: (busy: boolean) => void;
  onTitleChange: (album: Album | null) => void;
  hidden: boolean;
  suspended: boolean;
  command: AlbumCommand | undefined;
  onSlotSelectedChange: (selected: boolean) => void;
  preferences: DeletionPreferences;
  photoPane: PhotoPaneSettings;
  onPhotoPaneChange: (change: Partial<PhotoPaneSettings>) => void;
}) {
  const [album, setAlbum] = useState<Album | null>(document.album);
  const reportAlbum = useCallback((next: Album | null) => {
    setAlbum(next);
    onTitleChange(next);
  }, [onTitleChange]);
  return (
    <div className="library-workspace" style={{ display: hidden ? "none" : undefined }}>
      <PhotoPane settings={photoPane} onChange={onPhotoPaneChange}>
        <PhotoBrowser root={document.root} album={album} compact={photoPane.compact} />
      </PhotoPane>
      <AlbumWorkspace root={document.root} document={document} suspended={suspended} onBusyChange={onBusyChange} onAlbumChange={reportAlbum}
        command={command} onSlotSelectedChange={onSlotSelectedChange} {...preferences} />
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
  const [confirmSpreadDeletion, setConfirmSpreadDeletionState] = useState(true);
  const [confirmSlotDeletion, setConfirmSlotDeletionState] = useState(true);
  const [photoPane, setPhotoPaneState] = useState(DEFAULT_PHOTO_PANE);
  const photoPaneRef = useRef(DEFAULT_PHOTO_PANE);
  const [command, setCommand] = useState<AlbumCommand | undefined>();
  const [slotSelected, setSlotSelected] = useState(false);
  const commandSerial = useRef(0);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
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
  const setConfirmSpreadDeletion = useCallback(async (value: boolean) => {
    await ports.setConfirmSpreadDeletion(value);
    setConfirmSpreadDeletionState(value);
  }, [ports]);
  const setConfirmSlotDeletion = useCallback(async (value: boolean) => {
    await ports.setConfirmSlotDeletion(value);
    setConfirmSlotDeletionState(value);
  }, [ports]);
  const changePhotoPane = useCallback((change: Partial<PhotoPaneSettings>) => {
    const next = { ...photoPaneRef.current, ...change };
    photoPaneRef.current = next;
    setPhotoPaneState(next);
    ports.setPhotoPane(next).catch((cause: unknown) => setError(`Could not save the Photo pane layout: ${String(cause)}`));
  }, [ports]);

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
        setConfirmSpreadDeletionState(settings.confirmSpreadDeletion);
        setConfirmSlotDeletionState(settings.confirmSlotDeletion);
        const pane = { ...DEFAULT_PHOTO_PANE, ...settings.photoPane };
        photoPaneRef.current = { ...pane, width: clampPaneWidth(pane.width) };
        setPhotoPaneState(photoPaneRef.current);
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

  const actions = useRef<{ newAlbum: () => void; openAlbum: () => void; openRecent: (path: string) => void; closeAlbum: () => void; preferences: () => void; exit: () => void; albumCommand: (name: AlbumCommandName) => void; togglePhotos: () => void; compactPhotos: () => void }>(
    { newAlbum: () => {}, openAlbum: () => {}, openRecent: () => {}, closeAlbum: () => {}, preferences: () => {}, exit: () => {}, albumCommand: () => {}, togglePhotos: () => {}, compactPhotos: () => {} },
  );
  const photoPaneAvailable = document !== null && draft === null && !preferencesOpen;
  actions.current = {
    togglePhotos: () => {
      if (photoPaneAvailable) changePhotoPane({ collapsed: !photoPaneRef.current.collapsed });
    },
    compactPhotos: () => {
      if (photoPaneAvailable) changePhotoPane({ compact: !photoPaneRef.current.compact });
    },
    albumCommand: (name) => {
      if (document && !draft) setCommand({ name, serial: ++commandSerial.current });
    },
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
    preferences: () => { setPreferenceError(null); setPreferencesOpen(true); },
    exit: () => {
      if (isTauri()) void getCurrentWindow().close().catch((cause: unknown) => setError(`Could not close window: ${String(cause)}`));
    },
  };

  useEffect(() => {
    // Handled here rather than as a native accelerator so a Text Slot keeps Ctrl+B for Bold.
    const toggle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "b") return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
      if (window.document.querySelector("[aria-modal='true']")) return;
      event.preventDefault();
      actions.current.togglePhotos();
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);

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
      const fileEnabled = !busy && !restoring && !preferencesOpen;
      const albumEnabled = fileEnabled && document !== null && draft === null;
      const enabledByMenu: Record<string, Record<string, boolean>> = {
        file: {
          "new-album": fileEnabled,
          "open-album": fileEnabled,
          "open-recent": fileEnabled && recent.length > 0,
          "close-album": fileEnabled && (document !== null || draft !== null),
          "preferences": fileEnabled,
        },
        edit: { "delete": albumEnabled && slotSelected },
        album: { "album-settings": albumEnabled, "add-spread": albumEnabled },
        view: { "toggle-photos": photoPaneAvailable, "compact-photos": photoPaneAvailable },
      };
      const checkedByMenu: Record<string, Record<string, boolean>> = {
        view: { "compact-photos": photoPane.compact },
      };
      // Replacing a Windows menu briefly resizes the WebView.
      if (menuRef.current && menuRecent.current === recent) {
        for (const [menuId, enabledById] of Object.entries(enabledByMenu)) {
          const submenu = await menuRef.current.get(menuId);
          if (!submenu) throw new Error(`The ${menuId} menu is missing.`);
          try {
            if (!("get" in submenu)) throw new Error(`The ${menuId} menu is not a submenu.`);
            for (const [id, enabled] of Object.entries(enabledById)) {
              const item = await submenu.get(id);
              if (!item) throw new Error(`The ${menuId} menu item ${id} is missing.`);
              try {
                if (!("setEnabled" in item)) throw new Error(`The ${menuId} menu item ${id} cannot be enabled.`);
                await item.setEnabled(enabled);
                const checked = checkedByMenu[menuId]?.[id];
                if (checked !== undefined) {
                  if (!("setChecked" in item)) throw new Error(`The ${menuId} menu item ${id} cannot be checked.`);
                  await item.setChecked(checked);
                }
              } finally {
                await item.close();
              }
            }
          } finally {
            await submenu.close();
          }
        }
        return;
      }
      const { file, edit, album, view } = enabledByMenu;
      const menu = await Menu.new({ items: [{
        id: "file",
        text: "File",
        items: [
          { id: "new-album", text: "New Album…", enabled: file["new-album"], action: () => actions.current.newAlbum() },
          { id: "open-album", text: "Open Album…", enabled: file["open-album"], action: () => actions.current.openAlbum() },
          { id: "open-recent", text: "Open Recent", enabled: file["open-recent"], items: recent.map((path) => ({
            text: path.replaceAll("&", "&&"), action: () => actions.current.openRecent(path),
          })) },
          { id: "close-album", text: "Close Album", enabled: file["close-album"], action: () => actions.current.closeAlbum() },
          { id: "preferences", text: "Preferences…", enabled: file["preferences"], action: () => actions.current.preferences() },
          { text: "Exit", action: () => actions.current.exit() },
        ],
      }, {
        id: "edit",
        text: "Edit",
        // No accelerator: on Windows it would take the Delete key from text fields.
        items: [{ id: "delete", text: "Delete", enabled: edit["delete"], action: () => actions.current.albumCommand("delete-slot") }],
      }, {
        id: "album",
        text: "Album",
        items: [
          { id: "album-settings", text: "Album Settings…", enabled: album["album-settings"], action: () => actions.current.albumCommand("album-settings") },
          { id: "add-spread", text: "Add Spread", enabled: album["add-spread"], action: () => actions.current.albumCommand("add-spread") },
        ],
      }, {
        id: "view",
        text: "View",
        items: [
          // A tab shows the shortcut on Windows without a native accelerator, which would take Ctrl+B from Text Slots.
          { id: "toggle-photos", text: navigator.userAgent.includes("Windows") ? "Toggle Photos\tCtrl+B" : "Toggle Photos",
            enabled: view["toggle-photos"], action: () => actions.current.togglePhotos() },
          { id: "compact-photos", text: "Compact Photos", checked: photoPane.compact,
            enabled: view["compact-photos"], action: () => actions.current.compactPhotos() },
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
      if (active) setError(`Could not update menus: ${String(cause)}`);
    });
    return () => { active = false; };
  }, [recent, busy, restoring, document, draft, preferencesOpen, slotSelected, photoPaneAvailable, photoPane.compact]);

  useEffect(() => () => {
    menuQueue.current = menuQueue.current.then(async () => {
      await menuRef.current?.close();
      menuRef.current = null;
    }).catch((cause: unknown) => console.error("Could not release menus:", cause));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const album = createAlbum({
        name: String(form.get("title")),
        pageCount: Number(form.get("pageCount")),
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
      {preferencesOpen && <ModalDialog label="Preferences" closeDisabled={preferenceSaving} onClose={() => setPreferencesOpen(false)}>
          <h1>Preferences</h1>
          {([
            ["Confirm Spread deletion", confirmSpreadDeletion, setConfirmSpreadDeletion],
            ["Confirm Slot deletion", confirmSlotDeletion, setConfirmSlotDeletion],
          ] as const).map(([label, checked, save]) => (
            <label key={label}><input type="checkbox" checked={checked} disabled={preferenceSaving}
              onChange={(event) => {
                const value = event.target.checked;
                setPreferenceError(null);
                setPreferenceSaving(true);
                void save(value).catch((cause: unknown) => setPreferenceError(`Could not save preference: ${String(cause)}`))
                  .finally(() => setPreferenceSaving(false));
              }} /> {label}</label>
          ))}
          {preferenceError && <p className="error-banner" role="alert">{preferenceError}</p>}
          <button type="button" disabled={preferenceSaving} onClick={() => setPreferencesOpen(false)}>Close</button>
      </ModalDialog>}
      {draft ? (
        <form className="album-form new-album-form" role="dialog" aria-modal="true" onSubmit={(event) => void create(event)} aria-label="Album settings">
          <h1>Album settings</h1>
          <label>Title<textarea name="title" defaultValue="New Album" autoFocus disabled={busy} rows={2} /></label>
          <label>Page Format<select name="pageFormat" disabled={busy}><option>A4 - landscape (297 x 210 mm)</option></select></label>
          <label>Bleed (mm)<input name="bleedMm" type="number" min="0" step="any" defaultValue="3" required disabled={busy} /></label>
          <label>Safe Zone (mm)<input name="safeZoneMm" type="number" min="0" max="104.99" step="any" defaultValue="5" required disabled={busy} /></label>
          <label>Export resolution (DPI)<input name="dpi" type="number" min="1" step="any" defaultValue="300" required disabled={busy} /></label>
          <label>Page count<input name="pageCount" type="number" min="2" max="10000" step="2" defaultValue="2" required disabled={busy} /></label>
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
        onTitleChange={reportTitle} hidden={draft !== null} suspended={transitioning}
        command={command} onSlotSelectedChange={setSlotSelected}
        preferences={{ confirmSpreadDeletion, setConfirmSpreadDeletion, confirmSlotDeletion, setConfirmSlotDeletion }}
        photoPane={photoPane} onPhotoPaneChange={changePhotoPane} />}
    </main>
  );
}
