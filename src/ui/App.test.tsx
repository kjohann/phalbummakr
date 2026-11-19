// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAlbum, newLayout, serializeAlbum } from "../core";
import App, { type DocumentPorts } from "./App";
import type { LayoutLibraryState } from "./useLayoutLibrary";

type MenuEntry = { id?: string; text: string; enabled?: boolean; checked?: boolean; action?: () => void; items?: MenuEntry[] };
const native = vi.hoisted(() => ({
  enabled: false, items: [] as MenuEntry[], menus: [] as MenuEntry[],     installed: vi.fn(), update: vi.fn(), released: vi.fn(), title: vi.fn(), inactiveMounts: 0,
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled, invoke: vi.fn() }));
const layoutDisk = vi.hoisted(() => ({ json: null as string | null }));
vi.mock("./tauriLayoutPorts", () => ({
  tauriLayoutPorts: {
    read: async () => layoutDisk.json,
    write: async (_root: string, json: string) => { layoutDisk.json = json; },
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    setTitle: async (title: string) => { native.title(title); },
    close: async () => {},
  }),
}));
vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: async (menu: { items: MenuEntry[] }) => {
    native.menus = menu.items;
    native.items = menu.items[0].items ?? [];
    return {
      setAsAppMenu: async () => { native.installed(); return null; },
      get: async (id: string) => {
        const items = menu.items.find((entry) => entry.id === id)?.items;
        return items ? {
          get: async (itemId: string) => {
            const item = items.find((entry) => entry.id === itemId);
            return item ? {
              setEnabled: async (enabled: boolean) => { await native.update(); item.enabled = enabled; },
              setChecked: async (checked: boolean) => { await native.update(); item.checked = checked; },
              close: async () => { native.released(itemId); },
            } : null;
          },
          close: async () => { native.released(id); },
        } : null;
      },
      close: async () => {},
    };
  } },
}));
vi.mock("./AlbumWorkspace", () => ({
  default: ({ document, suspended, active = true, onBusyChange, layouts, bar: { command, onSlotSelectedChange, onEditableChange, onHistoryChange, toolsHost } = {} }: {
    document: { album: { title: string } };
    suspended?: boolean;
    active?: boolean;
    onBusyChange: (busy: boolean) => void;
    layouts?: { state: LayoutLibraryState; paneHost: HTMLElement | null };
    bar?: {
      command?: { name: string; serial: number };
      onSlotSelectedChange?: (selected: boolean) => void;
      onEditableChange?: (editable: boolean) => void;
      onHistoryChange?: (history: { canUndo: boolean; canRedo: boolean }) => void;
      toolsHost?: HTMLElement | null;
    };
  }) => {
    const [title, setTitle] = useState(document.album.title);
    const [selected, setSelected] = useState(false);
    useState(() => { if (!active) native.inactiveMounts++; });
    useEffect(() => onEditableChange?.(true), [onEditableChange]);
    useEffect(() => onSlotSelectedChange?.(selected), [selected, onSlotSelectedChange]);
    return <><p>{title}</p>
      {command && <p>Command {command.name} {command.serial}</p>}
      <button type="button" disabled={suspended} onClick={() => setTitle("Edited Album")}>Edit mock Album</button>
      <button type="button" onClick={() => onBusyChange(true)}>Begin mock edit</button>
      <button type="button" onClick={() => onBusyChange(false)}>Finish mock save</button>
      <button type="button" onClick={() => setSelected(true)}>Select mock Slot</button>
      <button type="button" onClick={() => setSelected(false)}>Clear mock Slot</button>
      <button type="button" onClick={() => onEditableChange?.(false)}>Block mock edits</button>
      <button type="button" onClick={() => onHistoryChange?.({ canUndo: true, canRedo: false })}>Make mock Album undoable</button>
      <textarea className="slot-text-editor" aria-label="Mock Text Slot editor" />
      {selected && active && toolsHost && createPortal(<button type="button">Mock Slot tool</button>, toolsHost)}
      {layouts?.paneHost && createPortal(<p>Album mode lists {layouts.state.library?.layouts.length ?? "no"} Layouts</p>, layouts.paneHost)}
      <button type="button" onClick={() => layouts?.state.change((library) => newLayout(library, 1.5).library)}>Save mock Layout</button>
      {!active && <p>Album workspace inactive</p>}
    </>;
  },
}));
vi.mock("./LayoutWorkspace", () => ({
  default: ({ paneHost, layouts, bar: { command, onStateChange } = {} }: {
    paneHost: HTMLElement | null;
    layouts: LayoutLibraryState;
    bar?: {
      command?: { name: string; serial: number };
      onStateChange?: (state: { editable: boolean; layoutSelected: boolean; slotSelected: boolean; canUndo: boolean; canRedo: boolean }) => void;
    };
  }) => {
    const [slotSelected, setSlotSelected] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    useEffect(() => onStateChange?.({ editable: true, layoutSelected: true, slotSelected, canUndo: false, canRedo }), [slotSelected, canRedo, onStateChange]);
    return <section aria-label="Layouts">
      {command && <p>Layout command {command.name} {command.serial}</p>}
      {paneHost && createPortal(<p>Mock Layout Library</p>, paneHost)}
      {layouts.library && <p>Layout mode has {layouts.library.layouts.length} Layouts</p>}
      <button type="button" onClick={() => setSlotSelected(true)}>Select mock Layout Slot</button>
      <button type="button" onClick={() => setCanRedo(true)}>Make mock Layout redoable</button>
      <button type="button" onClick={() => layouts.change((library) => newLayout(library, 1.5).library)}>Begin mock Layout edit</button>
    </section>;
  },
}));
vi.mock("./PhotoBrowser", () => ({
  default: ({ compact, onCompactChange, sort }: {
    compact?: boolean;
    onCompactChange?: (compact: boolean) => void;
    sort?: { host: HTMLElement | null; active: boolean; command?: { serial: number }; onChosenChange: (count: number) => void };
  }) => <>
    <p>{compact ? "Compact Photo browser" : "Photo browser"}</p>
    <button type="button" onClick={() => onCompactChange?.(!compact)}>Toggle mock Compact</button>
    <button type="button" onClick={() => sort?.onChosenChange(2)}>Choose two mock Photos</button>
    {sort?.command && <p>Send to Folder command {sort.command.serial}</p>}
    {sort?.host && createPortal(<p>Mock Sort view {sort.active ? "active" : "inactive"}</p>, sort.host)}
  </>,
}));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  native.enabled = false;
  native.items = [];
  native.menus = [];
  native.installed.mockClear();
  native.update.mockReset();
  native.released.mockClear();
  native.title.mockClear();
  native.inactiveMounts = 0;
  layoutDisk.json = null;
});

it("offers no Preferences in the File menu, as undo replaced the deletion questions", async () => {
  native.enabled = true;
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.items.map((entry) => entry.text))
    .toEqual(["New Album…", "Open Album…", "Open Recent", "Close Album", "Exit"]));
});

function openAlbumPorts(): DocumentPorts {
  const path = "D:\\Photos\\album.phalbum";
  return {
    settings: async () => ({ lastAlbum: path, recentAlbums: [path] }),
    exists: async () => true, read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(), remember: vi.fn(), forget: vi.fn(), close: vi.fn(),
    setSidePane: vi.fn(async () => {}),
    parent: async () => "D:\\Photos", chooseNew: async () => null, chooseOpen: async () => null,
  };
}

const bar = () => within(screen.getByRole("toolbar", { name: "Commands" }));
const barButton = (name: string) => bar().getByRole("button", { name }) as HTMLButtonElement;

it("shows only New Album and Open Album in the command bar while no Album is open", async () => {
  const chooseNew = vi.fn(async () => null);
  const ports: DocumentPorts = { ...openAlbumPorts(), chooseNew,
    settings: async () => ({ lastAlbum: null, recentAlbums: [] }) };
  render(<App ports={ports} />);
  await waitFor(() => expect(barButton("New Album…").disabled).toBe(false));
  expect(bar().getAllByRole("button").map((button) => button.textContent)).toEqual(["New Album…", "Open Album…"]);
  expect(bar().queryByRole("group", { name: "Mode" })).toBeNull();
  fireEvent.click(barButton("New Album…"));
  await waitFor(() => expect(chooseNew).toHaveBeenCalledOnce());
});

it("routes command bar commands to the open Album, keeping only the native File menu", async () => {
  native.enabled = true;
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  await waitFor(() => expect(barButton("Add Spread").disabled).toBe(false));
  expect(native.menus.map((menu) => menu.text)).toEqual(["File"]);
  expect(bar().queryByRole("button", { name: "Delete" })).toBeNull();
  fireEvent.click(barButton("Add Photo Slot"));
  expect(screen.getByText("Command add-photo-slot 1")).toBeTruthy();
  fireEvent.click(barButton("Add Text Slot"));
  expect(screen.getByText("Command add-text-slot 2")).toBeTruthy();
  fireEvent.click(barButton("Album Settings…"));
  expect(screen.getByText("Command album-settings 3")).toBeTruthy();
  fireEvent.click(barButton("Add Spread"));
  expect(screen.getByText("Command add-spread 4")).toBeTruthy();
});

it("shows the selected Slot's tools instead of the default commands in the middle of the bar", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  const middle = () => screen.getByRole("toolbar", { name: "Commands" }).querySelector(".command-context")!;
  fireEvent.click(screen.getByRole("button", { name: "Select mock Slot" }));
  expect(Array.from(middle().querySelectorAll("button"), (button) => button.textContent)).toEqual(["Mock Slot tool"]);
  expect(barButton("Album Settings…")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Clear mock Slot" }));
  expect(Array.from(middle().querySelectorAll("button"), (button) => button.textContent))
    .toEqual(["Add Photo Slot", "Add Text Slot", "Add Spread", "Save as Layout"]);
});

it("keeps Album commands enabled while an autosave is pending but not while edits are blocked", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  await waitFor(() => expect(barButton("Add Spread").disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Begin mock edit" }));
  expect(["Add Photo Slot", "Add Spread", "Album Settings…"].map((name) => barButton(name).disabled)).toEqual([false, false, false]);
  fireEvent.click(screen.getByRole("button", { name: "Block mock edits" }));
  expect(["Add Photo Slot", "Add Spread", "Album Settings…"].map((name) => barButton(name).disabled)).toEqual([true, true, true]);
});

const modeGroup = () => within(screen.getByRole("group", { name: "Mode" }));

it("switches between Album, Layouts and Sort modes from the Side pane, keeping the Album's state", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  expect(bar().queryByRole("group", { name: "Mode" })).toBeNull();
  const pane = screen.getByRole("region", { name: "Side pane" });
  const modes = within(within(pane).getByRole("group", { name: "Mode" }));
  expect(modes.getAllByRole("button").map((button) => [button.textContent, button.getAttribute("aria-pressed")]))
    .toEqual([["Album", "true"], ["Layouts", "false"], ["Sort", "false"]]);
  fireEvent.click(screen.getByRole("button", { name: "Edit mock Album" }));

  fireEvent.click(modes.getByRole("button", { name: "Layouts" }));
  expect(screen.getByRole("region", { name: "Layouts" })).toBeTruthy();
  expect(within(pane).getByText("Mock Layout Library")).toBeTruthy();
  expect(within(pane).getByText("Photo browser").closest("[hidden]")).not.toBeNull();
  expect(screen.getByText("Edited Album").closest("[hidden]")).not.toBeNull();
  expect(screen.getByText("Album workspace inactive")).toBeTruthy();
  expect(bar().queryByRole("button", { name: "Add Spread" })).toBeNull();
  expect(barButton("Album Settings…")).toBeTruthy();
  expect(pane.hidden).toBe(false);

  fireEvent.click(modes.getByRole("button", { name: "Sort" }));
  expect(screen.getByRole("region", { name: "Sort" }).textContent).toBe("Mock Sort view active");
  expect(within(pane).getByText("Photo browser").closest("[hidden]")).toBeNull();
  expect(within(pane).queryByRole("tablist")).toBeNull();
  expect(screen.getByRole("region", { name: "Layouts", hidden: true }).closest("[hidden]")).not.toBeNull();
  fireEvent.click(modes.getByRole("button", { name: "Album" }));
  expect(screen.queryByRole("region", { name: "Sort" })).toBeNull();
  expect(within(pane).getByText("Photo browser").closest("[hidden]")).toBeNull();
  expect(screen.getByText("Edited Album").closest("[hidden]")).toBeNull();
  expect(screen.queryByText("Album workspace inactive")).toBeNull();
  expect(barButton("Add Spread")).toBeTruthy();
});

it("offers Send to Folder… in Sort mode once a Photo is chosen, and sends it to the Photo grid", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  fireEvent.click(modeGroup().getByRole("button", { name: "Sort" }));
  expect(bar().queryByRole("button", { name: "Add Spread" })).toBeNull();
  expect(barButton("Send to Folder…").disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Choose two mock Photos" }));
  expect(barButton("Send to Folder…").disabled).toBe(false);
  fireEvent.click(barButton("Send to Folder…"));
  expect(screen.getByText("Send to Folder command 1")).toBeTruthy();
  fireEvent.click(modeGroup().getByRole("button", { name: "Album" }));
  expect(bar().queryByRole("button", { name: "Send to Folder…" })).toBeNull();
  expect(screen.getByText("Mock Sort view inactive")).toBeTruthy();
});

it("routes Layout commands to Layout mode, swapping Add Slot for the Slot tools when a Slot is selected", async () => {
  native.enabled = true;
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  fireEvent.click(modeGroup().getByRole("button", { name: "Layouts" }));
  const middle = () => Array.from(screen.getByRole("toolbar", { name: "Commands" }).querySelector(".command-context")!.querySelectorAll("button"),
    (button) => button.textContent);
  await waitFor(() => expect(barButton("New Layout").disabled).toBe(false));
  expect(middle()).toEqual(["Add Photo Slot", "Add Text Slot", "New Layout", "Duplicate Layout", "Delete Layout"]);
  fireEvent.click(barButton("Add Photo Slot"));
  expect(screen.getByText("Layout command add-photo-slot 1")).toBeTruthy();
  expect(screen.queryByText(/^Command add-photo-slot/)).toBeNull();
  for (const [label, name] of [["New Layout", "new-layout"], ["Duplicate Layout", "duplicate-layout"], ["Delete Layout", "delete-layout"]]) {
    fireEvent.click(barButton(label));
    expect(screen.getByText(new RegExp(`^Layout command ${name} \\d+$`))).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("button", { name: "Select mock Layout Slot" }));
  expect(middle()).toEqual(["New Layout", "Duplicate Layout", "Delete Layout"]);

  await waitFor(() => expect(native.items.find((entry) => entry.text === "Close Album")?.enabled).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Begin mock Layout edit" }));
  await waitFor(() => expect(native.items.find((entry) => entry.text === "Close Album")?.enabled).toBe(false));
});

it("offers a Photos | Layouts tab in Album mode's Side pane, sharing one Layout Library with Layout mode", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  const pane = within(screen.getByRole("region", { name: "Side pane" }));
  const tabs = within(pane.getByRole("tablist", { name: "Side pane content" }));
  expect(tabs.getAllByRole("tab").map((tab) => [tab.textContent, tab.getAttribute("aria-selected")]))
    .toEqual([["Photos", "true"], ["Layouts", "false"]]);
  expect(pane.getByText("Photo browser").closest("[hidden]")).toBeNull();
  expect(pane.getByText(/^Album mode lists/).closest("[hidden]")).not.toBeNull();

  fireEvent.click(tabs.getByRole("tab", { name: "Layouts" }));
  expect(tabs.getByRole("tab", { name: "Layouts" }).getAttribute("aria-selected")).toBe("true");
  expect(pane.getByText("Photo browser").closest("[hidden]")).not.toBeNull();
  await waitFor(() => expect(pane.getByText("Album mode lists 11 Layouts").closest("[hidden]")).toBeNull());
  fireEvent.keyDown(tabs.getByRole("tab", { name: "Layouts" }), { key: "ArrowLeft" });
  expect(tabs.getByRole("tab", { name: "Photos" }).getAttribute("aria-selected")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Save mock Layout" }));
  fireEvent.click(modeGroup().getByRole("button", { name: "Layouts" }));
  expect(screen.getByText("Layout mode has 12 Layouts")).toBeTruthy();
  expect(pane.queryByRole("tablist", { name: "Side pane content" })).toBeNull();
  await waitFor(() => expect(layoutDisk.json).not.toBeNull());
});

it("routes Save as Layout from the command bar to Album mode once the Layout Library is loaded", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  await waitFor(() => expect(barButton("Save as Layout").disabled).toBe(false));
  fireEvent.click(barButton("Save as Layout"));
  expect(screen.getByText(/^Command save-as-layout \d+$/)).toBeTruthy();
});

it("opens every Album in Album mode, whichever mode the previous Album was left in", async () => {
  native.enabled = true;
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  fireEvent.click(modeGroup().getByRole("button", { name: "Sort" }));
  await waitFor(() => expect(native.items.find((entry) => entry.text === "Close Album")?.enabled).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "Close Album")!.action!());
  fireEvent.click(await screen.findByRole("button", { name: "D:\\Photos\\album.phalbum" }));
  await screen.findByText("Original");
  expect(modeGroup().getByRole("button", { name: "Album" }).getAttribute("aria-pressed")).toBe("true");
  expect(native.inactiveMounts).toBe(0);
});

it("shows the Album title in the window title", async () => {
  native.enabled = true;
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.title).toHaveBeenLastCalledWith("Original — phalbummakr"));
});

it("updates File menu availability without reinstalling the native menu during edits and autosaves", async () => {
  native.enabled = true;
  const path = "D:\\Photos\\album.phalbum";
  const settings = { lastAlbum: path, recentAlbums: [path] };
  const ports: DocumentPorts = {
    settings: async () => settings,
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.items.find((entry) => entry.text === "Close Album")?.enabled).toBe(true));
  const installs = native.installed.mock.calls.length;
  for (let edit = 0; edit < 3; edit++) {
    fireEvent.click(screen.getByRole("button", { name: "Begin mock edit" }));
    await waitFor(() => expect(native.items.filter((entry) => entry.text !== "Exit").map((entry) => entry.enabled))
      .toEqual([false, false, false, false]));
    expect(native.installed).toHaveBeenCalledTimes(installs);
    fireEvent.click(screen.getByRole("button", { name: "Finish mock save" }));
    await waitFor(() => expect(native.items.filter((entry) => entry.text !== "Exit").map((entry) => entry.enabled))
      .toEqual([true, true, true, true]));
    expect(native.installed).toHaveBeenCalledTimes(installs);
  }
  for (const id of ["file", "new-album", "open-album", "open-recent", "close-album"]) {
    expect(native.released).toHaveBeenCalledWith(id);
  }
});

it("reports native menu update failures and releases the retrieved item and submenu handles", async () => {
  native.enabled = true;
  const path = "D:\\Photos\\album.phalbum";
  const settings = { lastAlbum: path, recentAlbums: [path] };
  const ports: DocumentPorts = {
    settings: async () => settings,
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.items.find((entry) => entry.text === "Close Album")?.enabled).toBe(true));
  const installs = native.installed.mock.calls.length;
  native.released.mockClear();
  native.update.mockRejectedValueOnce(new Error("Menu update denied"));
  fireEvent.click(screen.getByRole("button", { name: "Begin mock edit" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Menu update denied");
  expect(native.released.mock.calls).toEqual([["new-album"], ["file"]]);
  expect(native.installed).toHaveBeenCalledTimes(installs);
});

it("restores the last Album using its file's folder and stored title", async () => {
  const album = createAlbum({ name: "Family: / 2026" });
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: "D:\\Photos\\renamed.phalbum", recentAlbums: [] }),
    exists: async () => true,
    read: async () => serializeAlbum(album),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Family: / 2026");
  await waitFor(() => expect(ports.remember).toHaveBeenCalledWith("D:\\Photos\\renamed.phalbum"));
});

it("reports an odd Page count when opening an Album without replacing the current document", async () => {
  native.enabled = true;
  const current = "D:\\Photos\\current.phalbum";
  const broken = "D:\\Photos\\odd.phalbum";
  const valid = createAlbum({ name: "Original", pageCount: 4 });
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: current, recentAlbums: [broken] }),
    exists: async () => true,
    read: async (path) => path === current ? serializeAlbum(valid)
      : JSON.stringify({ ...valid, pages: valid.pages.slice(0, 3) }),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => broken,
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.items.some((entry) => entry.text === "Open Album…")).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "Open Album…")!.action!());
  expect((await screen.findByRole("alert")).textContent).toMatch(/even number between 2 and 10000/i);
  expect(screen.getByText("Original")).toBeTruthy();
  expect(ports.write).not.toHaveBeenCalled();
});

it("removes a missing recent Album when selected and reports it", async () => {
  const missing = "D:\\Photos\\missing.phalbum";
  const ports: DocumentPorts = {
    settings: vi.fn().mockResolvedValueOnce({ lastAlbum: null, recentAlbums: [missing] })
      .mockResolvedValue({ lastAlbum: null, recentAlbums: [] }),
    exists: async () => false,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: vi.fn(),
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: missing }));
  expect((await screen.findByRole("alert")).textContent).toContain("no longer exists");
  expect(ports.forget).toHaveBeenCalledWith(missing);
  expect(screen.queryByRole("button", { name: missing })).toBeNull();
  expect(ports.read).not.toHaveBeenCalled();
});

it("returns to the start screen when the last Album has disappeared", async () => {
  const path = "D:\\Photos\\missing.phalbum";
  const ports: DocumentPorts = {
    settings: vi.fn().mockResolvedValueOnce({ lastAlbum: path, recentAlbums: [path] })
      .mockResolvedValue({ lastAlbum: null, recentAlbums: [] }),
    exists: async () => false,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: vi.fn(),
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByRole("heading", { name: "Open an Album" });
  expect(screen.getByRole("alert").textContent).toContain(path);
  expect(ports.forget).toHaveBeenCalledWith(path);
  expect(ports.read).not.toHaveBeenCalled();
});

it("creates the chosen file with a title independent of its filename", async () => {
  const path = "D:\\Photos\\disk-name.phalbum";
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: null, recentAlbums: [] }),
    exists: async () => true,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => path,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "New Album…" }));
  await screen.findByRole("dialog", { name: "Album settings" });
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  expect((screen.getByLabelText("Page count") as HTMLInputElement).value).toBe("2");
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A: B / C" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Album" }));
  await screen.findByText("A: B / C");
  expect(ports.write).toHaveBeenCalledWith(path, expect.any(String), true);
  const json = vi.mocked(ports.write).mock.calls[0][1];
  expect(JSON.parse(json).title).toBe("A: B / C");
  expect(JSON.parse(json)).not.toHaveProperty("startingSide");
  expect(JSON.parse(json).pages).toHaveLength(2);
  expect(ports.remember).toHaveBeenCalledWith(path);
});

it("preserves the current editor when a new Album is cancelled", async () => {
  native.enabled = true;
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: "D:\\Photos\\old.phalbum", recentAlbums: [] }),
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => "D:\\Photos\\new.phalbum",
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  fireEvent.click(screen.getByRole("button", { name: "Edit mock Album" }));
  await waitFor(() => expect(native.items.some((entry) => entry.text === "New Album…")).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "New Album…")!.action!());
  await screen.findByRole("dialog", { name: "Album settings" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Edited Album")).toBeTruthy();
});

it("prevents editing the old Album while another file is opening", async () => {
  native.enabled = true;
  let finishRead: (json: string) => void = () => {};
  const pending = new Promise<string>((resolve) => { finishRead = resolve; });
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: "D:\\Photos\\old.phalbum", recentAlbums: [] }),
    exists: async () => true,
    read: async (path) => path.endsWith("old.phalbum") ? serializeAlbum(createAlbum({ name: "Original" })) : pending,
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => "D:\\Photos\\new.phalbum",
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.items.some((entry) => entry.text === "Open Album…")).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "Open Album…")!.action!());
  expect((screen.getByRole("button", { name: "Edit mock Album" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finishRead(serializeAlbum(createAlbum({ name: "Next" }))));
  await screen.findByText("Next");
});

it("closes the Album and returns to the start screen without forgetting recents", async () => {
  native.enabled = true;
  const path = "D:\\Photos\\album.phalbum";
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: path, recentAlbums: [path] }),
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setSidePane: vi.fn(),
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  await waitFor(() => expect(native.items.some((entry) => entry.text === "Close Album")).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "Close Album")!.action!());
  await screen.findByRole("heading", { name: "Open an Album" });
  expect(screen.getByRole("button", { name: path })).toBeTruthy();
  expect(ports.close).toHaveBeenCalledOnce();
  expect(ports.forget).not.toHaveBeenCalled();
});

function sidePanePorts(sidePane?: { width: number; collapsed: boolean; compact: boolean }) {
  const path = "D:\\Photos\\album.phalbum";
  return {
    settings: async () => ({ lastAlbum: path, recentAlbums: [path], sidePane }),
    exists: async () => true, read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(), remember: vi.fn(), forget: vi.fn(), close: vi.fn(),
    setSidePane: vi.fn(async () => {}),
    parent: async () => "D:\\Photos", chooseNew: async () => null, chooseOpen: async () => null,
  } satisfies DocumentPorts;
}

it("collapses the Side pane to a mode rail and expands it from the selected mode, another mode or Ctrl+B, and remembers it", async () => {
  const ports = sidePanePorts({ width: 300, collapsed: false, compact: false });
  render(<App ports={ports} />);
  await screen.findByText("Original");
  expect(bar().queryByRole("button", { name: "Toggle Photos" })).toBeNull();
  expect(bar().queryByRole("button", { name: "Compact Photos" })).toBeNull();
  const pane = screen.getByRole("region", { name: "Side pane" });
  expect(pane.style.width).toBe("300px");
  expect(screen.queryByRole("navigation", { name: "Modes" })).toBeNull();
  const album = modeGroup().getByRole("button", { name: "Album" });
  expect(album.getAttribute("aria-expanded")).toBe("true");
  expect(album.getAttribute("aria-keyshortcuts")).toBe("Control+B");
  expect(album.title).toBe("Album · Hide the Side pane (Ctrl+B)");
  expect(modeGroup().getByRole("button", { name: "Sort" }).title).toBe("Sort");

  fireEvent.click(album);
  expect(pane.hidden).toBe(true);
  expect(ports.setSidePane).toHaveBeenLastCalledWith({ width: 300, collapsed: true, compact: false });
  const rail = within(screen.getByRole("navigation", { name: "Modes" }));
  expect(document.activeElement).toBe(rail.getByRole("button", { name: "Album" }));
  expect(rail.getAllByRole("button").map((button) => [button.getAttribute("aria-label"), button.textContent, button.title]))
    .toEqual([["Album", "", "Album · Show the Side pane (Ctrl+B)"], ["Layouts", "", "Layouts"], ["Sort", "", "Sort"]]);
  expect(rail.getByRole("button", { name: "Album" }).getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(rail.getByRole("button", { name: "Album" }));
  expect(pane.hidden).toBe(false);
  expect(screen.queryByRole("navigation", { name: "Modes" })).toBeNull();

  fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  expect(pane.hidden).toBe(true);
  expect(screen.getByText("Photo browser")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Modes" })).getByRole("button", { name: "Layouts" }));
  expect(pane.hidden).toBe(false);
  expect(document.activeElement).toBe(modeGroup().getByRole("button", { name: "Layouts" }));
  expect(screen.getByRole("region", { name: "Layouts" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "B", ctrlKey: true });
  expect(pane.hidden).toBe(true);
  fireEvent.keyDown(window, { key: "B", ctrlKey: true });
  expect(pane.hidden).toBe(false);

  // Compact belongs to the Photo browser, which only Album mode shows in the pane.
  fireEvent.click(modeGroup().getByRole("button", { name: "Album" }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle mock Compact" }));
  expect(screen.getByText("Compact Photo browser")).toBeTruthy();
  expect(ports.setSidePane).toHaveBeenLastCalledWith({ width: 300, collapsed: false, compact: true });
});

it("stops Ctrl+Plus and Ctrl+Minus zooming the page in Album and Layout mode, even with no Album open", async () => {
  const ports = sidePanePorts();
  render(<App ports={{ ...ports, settings: async () => ({ lastAlbum: null, recentAlbums: [] }) }} />);
  await screen.findByRole("heading", { name: "Open an Album" });
  for (const init of [{ key: "+" }, { key: "=" }, { key: "-" }, { key: "+", code: "NumpadAdd" }]) {
    const event = new KeyboardEvent("keydown", { ctrlKey: true, bubbles: true, cancelable: true, ...init });
    fireEvent(document.body, event);
    expect(event.defaultPrevented).toBe(true);
  }
  const plain = new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true });
  fireEvent(document.body, plain);
  expect(plain.defaultPrevented).toBe(false);
});

it("leaves Ctrl+B to text fields, Text Slots that handle it and open dialogs", async () => {
  native.enabled = true;
  const ports = sidePanePorts();
  render(<><App ports={ports} /><input aria-label="Some field" /></>);
  await screen.findByText("Original");
  const pane = screen.getByRole("region", { name: "Side pane" });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Some field" }), { key: "b", ctrlKey: true });
  const handled = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
  handled.preventDefault();
  fireEvent(screen.getByRole("button", { name: "Edit mock Album" }), handled);
  const { unmount } = render(<div role="dialog" aria-modal="true" aria-label="Some dialog"><button type="button">Close</button></div>);
  fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "b", ctrlKey: true });
  expect(pane.hidden).toBe(false);
  unmount();
  expect(ports.setSidePane).not.toHaveBeenCalled();
});

it("resizes the Side pane by dragging or with arrow keys within its limits and saves the width when done", async () => {
  vi.stubGlobal("innerWidth", 1600);
  const ports = sidePanePorts();
  render(<App ports={ports} />);
  await screen.findByText("Original");
  const pane = screen.getByRole("region", { name: "Side pane" });
  const separator = screen.getByRole("separator", { name: "Resize the Side pane" });
  expect(pane.style.width).toBe("340px");
  fireEvent.mouseDown(separator, { button: 0, clientX: 340 });
  fireEvent.mouseMove(window, { clientX: 400 });
  expect(pane.style.width).toBe("400px");
  expect(separator.getAttribute("aria-valuenow")).toBe("400");
  expect(ports.setSidePane).not.toHaveBeenCalled();
  fireEvent.mouseUp(window, { clientX: 400 });
  expect(ports.setSidePane).toHaveBeenLastCalledWith({ width: 400, collapsed: false, compact: false });
  fireEvent.mouseDown(separator, { button: 0, clientX: 400 });
  fireEvent.mouseMove(window, { clientX: 5000 });
  fireEvent.mouseUp(window, { clientX: 5000 });
  expect(pane.style.width).toBe("640px");
  fireEvent.mouseDown(separator, { button: 0, clientX: 640 });
  fireEvent.mouseMove(window, { clientX: -100 });
  fireEvent.mouseUp(window, { clientX: -100 });
  expect(pane.style.width).toBe("200px");
  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(pane.style.width).toBe("216px");
  expect(ports.setSidePane).toHaveBeenLastCalledWith({ width: 216, collapsed: false, compact: false });
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(pane.style.width).toBe("200px");
});

it("limits the Side pane to the room a narrow window leaves, so a drag acts at once", async () => {
  vi.stubGlobal("innerWidth", 800);
  const ports = sidePanePorts({ width: 640, collapsed: false, compact: false });
  render(<App ports={ports} />);
  await screen.findByText("Original");
  const pane = screen.getByRole("region", { name: "Side pane" });
  const separator = screen.getByRole("separator", { name: "Resize the Side pane" });
  expect(pane.style.width).toBe("480px");
  expect(separator.getAttribute("aria-valuemax")).toBe("480");
  fireEvent.mouseDown(separator, { button: 0, clientX: 480 });
  fireEvent.mouseMove(window, { clientX: 440 });
  expect(pane.style.width).toBe("440px");
  fireEvent.mouseUp(window, { clientX: 440 });
  expect(ports.setSidePane).toHaveBeenLastCalledWith({ width: 440, collapsed: false, compact: false });
});

it("offers Undo and Redo in the right-hand group, enabled like their shortcuts, and sends them to the current mode", async () => {
  render(<><App ports={openAlbumPorts()} /><input aria-label="Some field" /></>);
  await screen.findByText("Original");
  const right = within(screen.getByRole("toolbar", { name: "Commands" }).querySelector<HTMLElement>(".command-document")!);
  expect(right.getAllByRole("button").map((button) => button.textContent)).toEqual(["Undo", "Redo", "Album Settings…", "Export Pages…"]);
  expect(barButton("Undo").title).toBe("Undo (Ctrl+Z)");
  expect(barButton("Redo").title).toBe("Redo (Ctrl+Y)");
  expect([barButton("Undo").disabled, barButton("Redo").disabled]).toEqual([true, true]);
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(screen.queryByText(/^Command undo/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Make mock Album undoable" }));
  expect([barButton("Undo").disabled, barButton("Redo").disabled]).toEqual([false, true]);
  fireEvent.click(barButton("Undo"));
  expect(screen.getByText("Command undo 1")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Mock Text Slot editor" }), { key: "z", ctrlKey: true });
  expect(screen.getByText("Command undo 2")).toBeTruthy();
  fireEvent.keyDown(window, { key: "y", ctrlKey: true });
  fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
  expect(screen.getByText("Command undo 2")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Some field" }), { key: "z", ctrlKey: true });
  expect(screen.getByText("Command undo 2")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Block mock edits" }));
  expect(barButton("Undo").disabled).toBe(true);
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(screen.getByText("Command undo 2")).toBeTruthy();

  fireEvent.click(modeGroup().getByRole("button", { name: "Layouts" }));
  await waitFor(() => expect(barButton("New Layout").disabled).toBe(false));
  expect([barButton("Undo").disabled, barButton("Redo").disabled]).toEqual([true, true]);
  fireEvent.click(screen.getByRole("button", { name: "Make mock Layout redoable" }));
  expect(barButton("Redo").disabled).toBe(false);
  fireEvent.keyDown(window, { key: "y", ctrlKey: true });
  const first = screen.getByText(/^Layout command redo \d+$/).textContent;
  fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
  expect(screen.getByText(/^Layout command redo \d+$/).textContent).not.toBe(first);
  expect(screen.queryByText(/^Command redo/)).toBeNull();
  fireEvent.click(modeGroup().getByRole("button", { name: "Sort" }));
  expect([barButton("Undo").disabled, barButton("Redo").disabled]).toEqual([true, true]);
});
