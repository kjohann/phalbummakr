// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAlbum, serializeAlbum } from "../core";
import App, { type DocumentPorts } from "./App";

type MenuEntry = { id?: string; text: string; enabled?: boolean; checked?: boolean; action?: () => void; items?: MenuEntry[] };
const native = vi.hoisted(() => ({
  enabled: false, items: [] as MenuEntry[], menus: [] as MenuEntry[],     installed: vi.fn(), update: vi.fn(), released: vi.fn(), title: vi.fn(), inactiveMounts: 0,
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled, invoke: vi.fn() }));
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
  default: ({ document, suspended, active = true, onBusyChange, command, onSlotSelectedChange, onEditableChange }: {
    document: { album: { title: string } };
    suspended?: boolean;
    active?: boolean;
    onBusyChange: (busy: boolean) => void;
    command?: { name: string; serial: number };
    onSlotSelectedChange?: (selected: boolean) => void;
    onEditableChange?: (editable: boolean) => void;
  }) => {
    const [title, setTitle] = useState(document.album.title);
    useState(() => { if (!active) native.inactiveMounts++; });
    useEffect(() => onEditableChange?.(true), [onEditableChange]);
    return <><p>{title}</p>
      {command && <p>Command {command.name} {command.serial}</p>}
      <button type="button" disabled={suspended} onClick={() => setTitle("Edited Album")}>Edit mock Album</button>
      <button type="button" onClick={() => onBusyChange(true)}>Begin mock edit</button>
      <button type="button" onClick={() => onBusyChange(false)}>Finish mock save</button>
      <button type="button" onClick={() => onSlotSelectedChange?.(true)}>Select mock Slot</button>
      <button type="button" onClick={() => onEditableChange?.(false)}>Block mock edits</button>
      {!active && <p>Album workspace inactive</p>}
    </>;
  },
}));
vi.mock("./PhotoBrowser", () => ({
  default: ({ compact, onCompactChange }: { compact?: boolean; onCompactChange?: (compact: boolean) => void }) => <>
    <p>{compact ? "Compact Photo browser" : "Photo browser"}</p>
    <button type="button" onClick={() => onCompactChange?.(!compact)}>Toggle mock Compact</button>
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
});

it("opens Preferences from File and persists the Spread deletion setting", async () => {
  native.enabled = true;
  const setConfirmSpreadDeletion = vi.fn(async () => {});
  const setConfirmSlotDeletion = vi.fn(async () => {});
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: null, recentAlbums: [], confirmSpreadDeletion: false, confirmSlotDeletion: true }),
    exists: async () => false,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion,
    setConfirmSlotDeletion,
    setPhotoPane: vi.fn(),
    parent: async () => "",
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await waitFor(() => expect(native.items.some((entry) => entry.text === "Preferences…")).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "Preferences…")!.action!());
  const checkbox = screen.getByLabelText("Confirm Spread deletion") as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  expect(document.activeElement).toBe(checkbox);
  within(screen.getByRole("region", { name: "Open an Album" })).getByRole("button", { name: "New Album…" }).focus();
  expect(document.activeElement).toBe(checkbox);
  fireEvent.click(checkbox);
  await waitFor(() => expect(setConfirmSpreadDeletion).toHaveBeenCalledWith(true));
  await waitFor(() => expect((screen.getByLabelText("Confirm Slot deletion") as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText("Confirm Slot deletion"));
  await waitFor(() => expect(setConfirmSlotDeletion).toHaveBeenCalledWith(false));
  expect((screen.getByLabelText("Confirm Slot deletion") as HTMLInputElement).checked).toBe(false);
});

function openAlbumPorts(): DocumentPorts {
  const path = "D:\\Photos\\album.phalbum";
  return {
    settings: async () => ({ lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true, read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(), remember: vi.fn(), forget: vi.fn(), close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(async () => {}),
    parent: async () => "D:\\Photos", chooseNew: async () => null, chooseOpen: async () => null,
  };
}

const bar = () => within(screen.getByRole("toolbar", { name: "Commands" }));
const barButton = (name: string) => bar().getByRole("button", { name }) as HTMLButtonElement;

it("shows only New Album and Open Album in the command bar while no Album is open", async () => {
  const chooseNew = vi.fn(async () => null);
  const ports: DocumentPorts = { ...openAlbumPorts(), chooseNew,
    settings: async () => ({ lastAlbum: null, recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }) };
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

  fireEvent.click(screen.getByRole("button", { name: "Select mock Slot" }));
  expect(bar().queryByRole("button", { name: "Add Photo Slot" })).toBeNull();
  expect(barButton("Delete").getAttribute("aria-keyshortcuts")).toBe("Delete");
  fireEvent.click(barButton("Delete"));
  expect(screen.getByText("Command delete-slot 5")).toBeTruthy();
});

it("keeps Album commands enabled while an autosave is pending but not while edits are blocked", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  fireEvent.click(screen.getByRole("button", { name: "Select mock Slot" }));
  await waitFor(() => expect(barButton("Delete").disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Begin mock edit" }));
  expect(["Delete", "Add Spread", "Album Settings…"].map((name) => barButton(name).disabled)).toEqual([false, false, false]);
  fireEvent.click(screen.getByRole("button", { name: "Block mock edits" }));
  expect(["Delete", "Add Spread", "Album Settings…"].map((name) => barButton(name).disabled)).toEqual([true, true, true]);
});

const modeGroup = () => within(screen.getByRole("group", { name: "Mode" }));

it("switches between Album, Layouts and Sort modes from the Photo pane, keeping the Album's state", async () => {
  render(<App ports={openAlbumPorts()} />);
  await screen.findByText("Original");
  expect(bar().queryByRole("group", { name: "Mode" })).toBeNull();
  const pane = screen.getByRole("region", { name: "Photo pane" });
  const modes = within(within(pane).getByRole("group", { name: "Mode" }));
  expect(modes.getAllByRole("button").map((button) => [button.textContent, button.getAttribute("aria-pressed")]))
    .toEqual([["Album", "true"], ["Layouts", "false"], ["Sort", "false"]]);
  fireEvent.click(screen.getByRole("button", { name: "Edit mock Album" }));

  fireEvent.click(modes.getByRole("button", { name: "Layouts" }));
  expect(screen.getByRole("region", { name: "Layouts" }).textContent).toContain("010");
  expect(screen.getByText("Edited Album").closest("[hidden]")).not.toBeNull();
  expect(screen.getByText("Album workspace inactive")).toBeTruthy();
  expect(bar().queryByRole("button", { name: "Add Photo Slot" })).toBeNull();
  expect(barButton("Album Settings…")).toBeTruthy();
  expect(pane.hidden).toBe(false);

  fireEvent.click(modes.getByRole("button", { name: "Sort" }));
  expect(screen.getByRole("region", { name: "Sort" }).textContent).toContain("028");
  fireEvent.click(modes.getByRole("button", { name: "Album" }));
  expect(screen.queryByRole("region", { name: "Sort" })).toBeNull();
  expect(screen.getByText("Edited Album").closest("[hidden]")).toBeNull();
  expect(screen.queryByText("Album workspace inactive")).toBeNull();
  expect(barButton("Add Photo Slot")).toBeTruthy();
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

it("keeps the previous preference and shows an error when saving fails", async () => {
  native.enabled = true;
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: null, recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    setConfirmSpreadDeletion: vi.fn().mockRejectedValue(new Error("Disk full")), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
    exists: async () => false, read: vi.fn(), write: vi.fn(), remember: vi.fn(), forget: vi.fn(),
    close: vi.fn(), parent: async () => "", chooseNew: async () => null, chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await waitFor(() => expect(native.items.some((entry) => entry.text === "Preferences…")).toBe(true));
  await act(async () => native.items.find((entry) => entry.text === "Preferences…")!.action!());
  fireEvent.click(screen.getByLabelText("Confirm Spread deletion"));
  const dialog = screen.getByRole("dialog", { name: "Preferences" });
  await waitFor(() => expect(dialog.textContent).toContain("Disk full"));
  expect((screen.getByLabelText("Confirm Spread deletion") as HTMLInputElement).checked).toBe(true);
});

it("updates File menu availability without reinstalling the native menu during edits and autosaves", async () => {
  native.enabled = true;
  const path = "D:\\Photos\\album.phalbum";
  const settings = { lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true };
  const ports: DocumentPorts = {
    settings: async () => settings,
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    await waitFor(() => expect(native.items.filter((entry) => entry.text !== "Exit" && entry.text !== "Preferences…").map((entry) => entry.enabled))
      .toEqual([false, false, false, false]));
    expect(native.installed).toHaveBeenCalledTimes(installs);
    fireEvent.click(screen.getByRole("button", { name: "Finish mock save" }));
    await waitFor(() => expect(native.items.filter((entry) => entry.text !== "Exit" && entry.text !== "Preferences…").map((entry) => entry.enabled))
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
  const settings = { lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true };
  const ports: DocumentPorts = {
    settings: async () => settings,
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: async () => ({ lastAlbum: "D:\\Photos\\renamed.phalbum", recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true,
    read: async () => serializeAlbum(album),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: async () => ({ lastAlbum: current, recentAlbums: [broken], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true,
    read: async (path) => path === current ? serializeAlbum(valid)
      : JSON.stringify({ ...valid, pages: valid.pages.slice(0, 3) }),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: vi.fn().mockResolvedValueOnce({ lastAlbum: null, recentAlbums: [missing], confirmSpreadDeletion: true, confirmSlotDeletion: true })
      .mockResolvedValue({ lastAlbum: null, recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => false,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: vi.fn().mockResolvedValueOnce({ lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true })
      .mockResolvedValue({ lastAlbum: null, recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => false,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: async () => ({ lastAlbum: null, recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true,
    read: vi.fn(),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: async () => ({ lastAlbum: "D:\\Photos\\old.phalbum", recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: async () => ({ lastAlbum: "D:\\Photos\\old.phalbum", recentAlbums: [], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true,
    read: async (path) => path.endsWith("old.phalbum") ? serializeAlbum(createAlbum({ name: "Original" })) : pending,
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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
    settings: async () => ({ lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true,
    read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(),
    remember: vi.fn(),
    forget: vi.fn(),
    close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
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

function photoPanePorts(photoPane?: { width: number; collapsed: boolean; compact: boolean }) {
  const path = "D:\\Photos\\album.phalbum";
  return {
    settings: async () => ({ lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true, photoPane }),
    exists: async () => true, read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(), remember: vi.fn(), forget: vi.fn(), close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(async () => {}),
    parent: async () => "D:\\Photos", chooseNew: async () => null, chooseOpen: async () => null,
  } satisfies DocumentPorts;
}

it("collapses the Photo pane to a mode rail and expands it from the selected mode, another mode or Ctrl+B, and remembers it", async () => {
  const ports = photoPanePorts({ width: 300, collapsed: false, compact: false });
  render(<App ports={ports} />);
  await screen.findByText("Original");
  expect(bar().queryByRole("button", { name: "Toggle Photos" })).toBeNull();
  expect(bar().queryByRole("button", { name: "Compact Photos" })).toBeNull();
  const pane = screen.getByRole("region", { name: "Photo pane" });
  expect(pane.style.width).toBe("300px");
  expect(screen.queryByRole("navigation", { name: "Modes" })).toBeNull();
  const album = modeGroup().getByRole("button", { name: "Album" });
  expect(album.getAttribute("aria-expanded")).toBe("true");
  expect(album.getAttribute("aria-keyshortcuts")).toBe("Control+B");
  expect(album.title).toBe("Album · Hide the Photo pane (Ctrl+B)");
  expect(modeGroup().getByRole("button", { name: "Sort" }).title).toBe("Sort");

  fireEvent.click(album);
  expect(pane.hidden).toBe(true);
  expect(ports.setPhotoPane).toHaveBeenLastCalledWith({ width: 300, collapsed: true, compact: false });
  const rail = within(screen.getByRole("navigation", { name: "Modes" }));
  expect(document.activeElement).toBe(rail.getByRole("button", { name: "Album" }));
  expect(rail.getAllByRole("button").map((button) => [button.getAttribute("aria-label"), button.textContent, button.title]))
    .toEqual([["Album", "", "Album · Show the Photo pane (Ctrl+B)"], ["Layouts", "", "Layouts"], ["Sort", "", "Sort"]]);
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

  fireEvent.click(screen.getByRole("button", { name: "Toggle mock Compact" }));
  expect(screen.getByText("Compact Photo browser")).toBeTruthy();
  expect(ports.setPhotoPane).toHaveBeenLastCalledWith({ width: 300, collapsed: false, compact: true });
});

it("leaves Ctrl+B to text fields, Text Slots that handle it and open dialogs", async () => {
  native.enabled = true;
  const ports = photoPanePorts();
  render(<><App ports={ports} /><input aria-label="Some field" /></>);
  await screen.findByText("Original");
  const pane = screen.getByRole("region", { name: "Photo pane" });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Some field" }), { key: "b", ctrlKey: true });
  const handled = new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true });
  handled.preventDefault();
  fireEvent(screen.getByRole("button", { name: "Edit mock Album" }), handled);
  const item = (menu: string, text: string) =>
    native.menus.find((entry) => entry.text === menu)?.items?.find((entry) => entry.text === text);
  await waitFor(() => expect(item("File", "Preferences…")?.enabled).toBe(true));
  await act(async () => item("File", "Preferences…")!.action!());
  fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "b", ctrlKey: true });
  expect(pane.hidden).toBe(false);
  expect(modeGroup().getAllByRole("button").map((button) => (button as HTMLButtonElement).disabled)).toEqual([true, true, true]);
  expect(ports.setPhotoPane).not.toHaveBeenCalled();
});

it("resizes the Photo pane by dragging or with arrow keys within its limits and saves the width when done", async () => {
  vi.stubGlobal("innerWidth", 1600);
  const ports = photoPanePorts();
  render(<App ports={ports} />);
  await screen.findByText("Original");
  const pane = screen.getByRole("region", { name: "Photo pane" });
  const separator = screen.getByRole("separator", { name: "Resize Photos" });
  expect(pane.style.width).toBe("340px");
  fireEvent.mouseDown(separator, { button: 0, clientX: 340 });
  fireEvent.mouseMove(window, { clientX: 400 });
  expect(pane.style.width).toBe("400px");
  expect(separator.getAttribute("aria-valuenow")).toBe("400");
  expect(ports.setPhotoPane).not.toHaveBeenCalled();
  fireEvent.mouseUp(window, { clientX: 400 });
  expect(ports.setPhotoPane).toHaveBeenLastCalledWith({ width: 400, collapsed: false, compact: false });
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
  expect(ports.setPhotoPane).toHaveBeenLastCalledWith({ width: 216, collapsed: false, compact: false });
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  fireEvent.keyDown(separator, { key: "ArrowLeft" });
  expect(pane.style.width).toBe("200px");
});

it("limits the Photo pane to the room a narrow window leaves, so a drag acts at once", async () => {
  vi.stubGlobal("innerWidth", 800);
  const ports = photoPanePorts({ width: 640, collapsed: false, compact: false });
  render(<App ports={ports} />);
  await screen.findByText("Original");
  const pane = screen.getByRole("region", { name: "Photo pane" });
  const separator = screen.getByRole("separator", { name: "Resize Photos" });
  expect(pane.style.width).toBe("480px");
  expect(separator.getAttribute("aria-valuemax")).toBe("480");
  fireEvent.mouseDown(separator, { button: 0, clientX: 480 });
  fireEvent.mouseMove(window, { clientX: 440 });
  expect(pane.style.width).toBe("440px");
  fireEvent.mouseUp(window, { clientX: 440 });
  expect(ports.setPhotoPane).toHaveBeenLastCalledWith({ width: 440, collapsed: false, compact: false });
});
