import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { dirname } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createAlbum, deserializeAlbum, serializeAlbum, type Album, type LayoutPorts } from "../core";
import AlbumWorkspace, { type AlbumCommand, type AlbumCommandName, type CommandBarLink } from "./AlbumWorkspace";
import CommandBar, { type BarCommand } from "./CommandBar";
import LayoutWorkspace, { type LayoutBarLink, type LayoutBarState, type LayoutCommand, type LayoutCommandName } from "./LayoutWorkspace";
import type { Mode } from "./modes";
import PhotoBrowser from "./PhotoBrowser";
import SidePane, { clampPaneWidth, DEFAULT_SIDE_PANE, type PaneModes, type SidePaneSettings } from "./SidePane";
import ModalDialog from "./ModalDialog";
import { useLayoutLibrary } from "./useLayoutLibrary";

interface Settings {
  lastAlbum: string | null;
  recentAlbums: string[];
  confirmSpreadDeletion: boolean;
  confirmSlotDeletion: boolean;
  sidePane?: SidePaneSettings;
}

export interface DocumentPorts {
  settings(): Promise<Settings>;
  setConfirmSpreadDeletion(value: boolean): Promise<void>;
  setConfirmSlotDeletion(value: boolean): Promise<void>;
  setSidePane(pane: SidePaneSettings): Promise<void>;
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
  setSidePane: (pane) => invoke("set_side_pane", { pane }),
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

const PANE_TABS = [{ id: "photos", label: "Photos" }, { id: "layouts", label: "Layouts" }] as const;
type PaneTab = typeof PANE_TABS[number]["id"];

/** Switches Album mode's Side pane between the Photo browser and the Layout Library. */
function PaneTabs({ current, onChange }: { current: PaneTab; onChange: (tab: PaneTab) => void }) {
  return (
    <div className="pane-tabs" role="tablist" aria-label="Side pane content">
      {PANE_TABS.map(({ id, label }, index) => (
        <button key={id} type="button" role="tab" className="pane-tab" id={`pane-tab-${id}`} aria-controls={`pane-panel-${id}`}
          aria-selected={current === id} tabIndex={current === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = PANE_TABS[(index + step + PANE_TABS.length) % PANE_TABS.length].id;
            onChange(next);
            window.document.getElementById(`pane-tab-${next}`)?.focus();
          }}>{label}</button>
      ))}
    </div>
  );
}

function DocumentWorkspace({ document, onBusyChange, onTitleChange, hidden, suspended, modes, bar, layoutBar, layoutPorts, preferences, sidePane, onSidePaneChange, onLayoutLibraryReadyChange }: {
  document: OpenDocument;
  onBusyChange: (busy: boolean) => void;
  onTitleChange: (album: Album | null) => void;
  hidden: boolean;
  suspended: boolean;
  modes: PaneModes;
  bar: CommandBarLink;
  layoutBar: LayoutBarLink;
  layoutPorts?: LayoutPorts;
  preferences: DeletionPreferences;
  sidePane: SidePaneSettings;
  onSidePaneChange: (change: Partial<SidePaneSettings>) => void;
  /** Whether the shared Layout Library can take a new Layout, for Save as Layout. */
  onLayoutLibraryReadyChange: (ready: boolean) => void;
}) {
  const [album, setAlbum] = useState<Album | null>(document.album);
  const reportAlbum = useCallback((next: Album | null) => {
    setAlbum(next);
    onTitleChange(next);
  }, [onTitleChange]);
  const mode = modes.current;
  // Layout mode mounts the first time it opens, then is kept, like Album mode's state.
  const [layoutsOpened, setLayoutsOpened] = useState(false);
  if (mode === "layouts" && !layoutsOpened) setLayoutsOpened(true);
  const [layoutPaneHost, setLayoutPaneHost] = useState<HTMLElement | null>(null);
  const [albumLayoutsHost, setAlbumLayoutsHost] = useState<HTMLElement | null>(null);
  const [paneTab, setPaneTab] = useState<PaneTab>("photos");
  const busy = useRef({ album: false, layouts: false });
  const reportAlbumBusy = useCallback((value: boolean) => {
    busy.current.album = value;
    onBusyChange(busy.current.album || busy.current.layouts);
  }, [onBusyChange]);
  const reportLayoutsBusy = useCallback((value: boolean) => {
    busy.current.layouts = value;
    onBusyChange(busy.current.album || busy.current.layouts);
  }, [onBusyChange]);
  const format = (album ?? document.album).pageFormat;
  // Loaded with the Album, as both Album mode and Layout mode use it.
  const layouts = useLayoutLibrary({ root: document.root, format, ports: layoutPorts, onBusyChange: reportLayoutsBusy });
  const layoutLibraryReady = !layouts.disabled;
  useEffect(() => onLayoutLibraryReadyChange(layoutLibraryReady), [layoutLibraryReady, onLayoutLibraryReadyChange]);
  useEffect(() => () => onLayoutLibraryReadyChange(false), [onLayoutLibraryReadyChange]);
  return (
    <div className="library-workspace" style={{ display: hidden ? "none" : undefined }}>
      <SidePane modes={modes} settings={sidePane} onChange={onSidePaneChange}>
        <div className="pane-view pane-view--stacked" hidden={mode === "layouts"}>
          {mode === "album" && <PaneTabs current={paneTab} onChange={setPaneTab} />}
          <div className="pane-view" hidden={mode === "album" && paneTab !== "photos"}
            {...mode === "album" ? { role: "tabpanel", id: "pane-panel-photos", "aria-labelledby": "pane-tab-photos" } : {}}>
            <PhotoBrowser root={document.root} album={album} compact={sidePane.compact}
              onCompactChange={(compact) => onSidePaneChange({ compact })} />
          </div>
          <div className="pane-view" hidden={mode !== "album" || paneTab !== "layouts"} ref={setAlbumLayoutsHost}
            role="tabpanel" id="pane-panel-layouts" aria-labelledby="pane-tab-layouts" />
        </div>
        {layoutsOpened && <div className="pane-view" hidden={mode !== "layouts"} ref={setLayoutPaneHost} />}
      </SidePane>
      {/* Hidden rather than unmounted, so Album mode keeps its Spread and Slot selection. */}
      <div className="mode-view" hidden={mode !== "album"}>
        <AlbumWorkspace root={document.root} document={document} suspended={suspended} active={mode === "album" && !hidden}
          onBusyChange={reportAlbumBusy} onAlbumChange={reportAlbum} bar={bar} {...preferences}
          layouts={{ state: layouts, paneHost: albumLayoutsHost }} />
      </div>
      {layoutsOpened && <div className="mode-view" hidden={mode !== "layouts"}>
        <LayoutWorkspace format={format} layouts={layouts}
          paneHost={layoutPaneHost} active={mode === "layouts" && !hidden && !suspended} bar={layoutBar}
          confirmSlotDeletion={preferences.confirmSlotDeletion}
          setConfirmSlotDeletion={preferences.setConfirmSlotDeletion} />
      </div>}
      {mode === "sort" && <section className="workspace mode-placeholder" aria-label="Sort">
        <h2>Sort</h2><p>Sorting Photos into Folders arrives with issue 028.</p>
      </section>}
    </div>
  );
}

export default function App({ ports = desktopPorts, layoutPorts }: { ports?: DocumentPorts; layoutPorts?: LayoutPorts }) {
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
  const [sidePane, setSidePaneState] = useState(DEFAULT_SIDE_PANE);
  const sidePaneRef = useRef(DEFAULT_SIDE_PANE);
  const [command, setCommand] = useState<AlbumCommand | undefined>();
  const [slotSelected, setSlotSelected] = useState(false);
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const [albumEditable, setAlbumEditable] = useState(false);
  const [layoutLibraryReady, setLayoutLibraryReady] = useState(false);
  const [layoutCommand, setLayoutCommand] = useState<LayoutCommand | undefined>();
  const [layoutState, setLayoutState] = useState<LayoutBarState>({ editable: false, layoutSelected: false, slotSelected: false });
  const [modeState, setModeState] = useState<{ documentId: number | undefined; mode: Mode }>({ documentId: undefined, mode: "album" });
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
  const changeSidePane = useCallback((change: Partial<SidePaneSettings>) => {
    const next = { ...sidePaneRef.current, ...change };
    sidePaneRef.current = next;
    setSidePaneState(next);
    ports.setSidePane(next).catch((cause: unknown) => setError(`Could not save the Side pane layout: ${String(cause)}`));
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
        const pane = { ...DEFAULT_SIDE_PANE, ...settings.sidePane };
        sidePaneRef.current = { ...pane, width: clampPaneWidth(pane.width) };
        setSidePaneState(sidePaneRef.current);
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

  const actions = useRef<{ newAlbum: () => void; openAlbum: () => void; openRecent: (path: string) => void; closeAlbum: () => void; preferences: () => void; exit: () => void;   albumCommand: (name: AlbumCommandName) => void; layoutCommand: (name: LayoutCommandName) => void; togglePhotos: () => void }>(
      { newAlbum: () => {}, openAlbum: () => {}, openRecent: () => {}, closeAlbum: () => {}, preferences: () => {}, exit: () => {}, albumCommand: () => {}, layoutCommand: () => {}, togglePhotos: () => {} },
  );
  const sidePaneAvailable = document !== null && draft === null && !preferencesOpen;
  const fileEnabled = !busy && !restoring && !preferencesOpen;
  // Keyed by document, so every newly opened Album starts in Album mode.
  const mode = modeState.documentId === document?.id ? modeState.mode : "album";
  const setMode = (next: Mode) => setModeState({ documentId: document?.id, mode: next });
  actions.current = {
    togglePhotos: () => {
      if (sidePaneAvailable) changeSidePane({ collapsed: !sidePaneRef.current.collapsed });
    },
    albumCommand: (name) => {
      if (document && !draft) setCommand({ name, serial: ++commandSerial.current });
    },
    layoutCommand: (name) => {
      if (document && !draft) setLayoutCommand({ name, serial: ++commandSerial.current });
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
      const enabledByMenu: Record<string, Record<string, boolean>> = {
        file: {
          "new-album": fileEnabled,
          "open-album": fileEnabled,
          "open-recent": fileEnabled && recent.length > 0,
          "close-album": fileEnabled && (document !== null || draft !== null),
          "preferences": fileEnabled,
        },
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
      const { file } = enabledByMenu;
      // Edit, Album and View commands live in the command bar.
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
  }, [recent, fileEnabled, document, draft]);

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

  const albumOpen = document !== null && draft === null;
  // Unlike File commands, these stay enabled while an autosave is pending, so the bar doesn't flicker after each edit.
  const commandsAvailable = albumOpen && !transitioning && !restoring && !preferencesOpen;
  const albumCommandsEnabled = commandsAvailable && albumEditable;
  const albumCommand = (name: AlbumCommandName, label: string, extra: Partial<BarCommand> = {}): BarCommand =>
    ({ id: name, label, disabled: !albumCommandsEnabled, run: () => actions.current.albumCommand(name), ...extra });
  const layoutBarCommand = (name: LayoutCommandName, label: string, extra: Partial<BarCommand> = {}): BarCommand => ({
    id: name, label, run: () => actions.current.layoutCommand(name), ...extra,
    disabled: !(commandsAvailable && layoutState.editable) || extra.disabled,
  });
  const layoutCommands = (): BarCommand[] => [
    ...(layoutState.slotSelected ? [] : [
      layoutBarCommand("add-photo-slot", "Add Photo Slot", { disabled: !layoutState.layoutSelected }),
      layoutBarCommand("add-text-slot", "Add Text Slot", { disabled: !layoutState.layoutSelected }),
    ]),
    layoutBarCommand("new-layout", "New Layout", { overflow: 1 }),
    layoutBarCommand("duplicate-layout", "Duplicate Layout", { disabled: !layoutState.layoutSelected, overflow: 3 }),
    layoutBarCommand("delete-layout", "Delete Layout", { disabled: !layoutState.layoutSelected, overflow: 2 }),
  ];
  const contextCommands: BarCommand[] = albumOpen && mode === "album" && !slotSelected ? [
    albumCommand("add-photo-slot", "Add Photo Slot"),
    albumCommand("add-text-slot", "Add Text Slot"),
    albumCommand("add-spread", "Add Spread", { overflow: 1 }),
    albumCommand("save-as-layout", "Save as Layout", { overflow: 2, disabled: !(albumCommandsEnabled && layoutLibraryReady) }),
  ] : albumOpen && mode === "layouts" ? layoutCommands() : [];
  const documentCommands: BarCommand[] = albumOpen ? [
    albumCommand("album-settings", "Album Settings…", { overflow: 2 }),
  ] : [
    { id: "new-album", label: "New Album…", disabled: !fileEnabled, run: () => actions.current.newAlbum() },
    { id: "open-album", label: "Open Album…", disabled: !fileEnabled, run: () => actions.current.openAlbum() },
  ];

  return (
    <main className="app-shell">
      <CommandBar context={contextCommands} document={documentCommands} toolsRef={setToolsHost} />
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
        modes={{ current: mode, onChange: setMode, disabled: preferencesOpen }}
        bar={{ command, toolsHost, onSlotSelectedChange: setSlotSelected, onEditableChange: setAlbumEditable }}
        layoutBar={{ command: layoutCommand, toolsHost, onStateChange: setLayoutState }} layoutPorts={layoutPorts}
        preferences={{ confirmSpreadDeletion, setConfirmSpreadDeletion, confirmSlotDeletion, setConfirmSlotDeletion }}
        sidePane={sidePane} onSidePaneChange={changeSidePane} onLayoutLibraryReadyChange={setLayoutLibraryReady} />}
    </main>
  );
}
