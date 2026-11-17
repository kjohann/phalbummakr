// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createAlbum, serializeAlbum } from "../core";
import App, { type DocumentPorts } from "./App";

type MenuEntry = { id?: string; text: string; enabled?: boolean; checked?: boolean; action?: () => void; items?: MenuEntry[] };
const native = vi.hoisted(() => ({
  enabled: false, items: [] as MenuEntry[], menus: [] as MenuEntry[], installed: vi.fn(), update: vi.fn(), released: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.enabled, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    setTitle: async () => {},
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
  default: ({ document, suspended, onBusyChange, command, onSlotSelectedChange }: {
    document: { album: { title: string } };
    suspended?: boolean;
    onBusyChange: (busy: boolean) => void;
    command?: { name: string; serial: number };
    onSlotSelectedChange?: (selected: boolean) => void;
  }) => {
    const [title, setTitle] = useState(document.album.title);
    return <><p>{title}</p>
      {command && <p>Command {command.name} {command.serial}</p>}
      <button type="button" disabled={suspended} onClick={() => setTitle("Edited Album")}>Edit mock Album</button>
      <button type="button" onClick={() => onBusyChange(true)}>Begin mock edit</button>
      <button type="button" onClick={() => onBusyChange(false)}>Finish mock save</button>
      <button type="button" onClick={() => onSlotSelectedChange?.(true)}>Select mock Slot</button>
    </>;
  },
}));
vi.mock("./PhotoBrowser", () => ({
  default: ({ compact }: { compact?: boolean }) => <p>{compact ? "Compact Photo browser" : "Photo browser"}</p>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  native.enabled = false;
  native.items = [];
  native.menus = [];
  native.installed.mockClear();
  native.update.mockReset();
  native.released.mockClear();
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
  screen.getByRole("button", { name: "New Album…" }).focus();
  expect(document.activeElement).toBe(checkbox);
  fireEvent.click(checkbox);
  await waitFor(() => expect(setConfirmSpreadDeletion).toHaveBeenCalledWith(true));
  await waitFor(() => expect((screen.getByLabelText("Confirm Slot deletion") as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText("Confirm Slot deletion"));
  await waitFor(() => expect(setConfirmSlotDeletion).toHaveBeenCalledWith(false));
  expect((screen.getByLabelText("Confirm Slot deletion") as HTMLInputElement).checked).toBe(false);
});

it("routes the native Edit and Album menus to the open Album", async () => {
  native.enabled = true;
  const path = "D:\\Photos\\album.phalbum";
  const ports: DocumentPorts = {
    settings: async () => ({ lastAlbum: path, recentAlbums: [path], confirmSpreadDeletion: true, confirmSlotDeletion: true }),
    exists: async () => true, read: async () => serializeAlbum(createAlbum({ name: "Original" })),
    write: vi.fn(), remember: vi.fn(), forget: vi.fn(), close: vi.fn(),
    setConfirmSpreadDeletion: vi.fn(), setConfirmSlotDeletion: vi.fn(), setPhotoPane: vi.fn(),
    parent: async () => "D:\\Photos", chooseNew: async () => null, chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Original");
  const item = (menu: string, text: string) =>
    native.menus.find((entry) => entry.text === menu)?.items?.find((entry) => entry.text === text);
  await waitFor(() => expect(item("Album", "Add Spread")?.enabled).toBe(true));
  expect(item("Edit", "Delete")?.enabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Select mock Slot" }));
  await waitFor(() => expect(item("Edit", "Delete")?.enabled).toBe(true));
  await act(async () => item("Edit", "Delete")!.action!());
  expect(screen.getByText("Command delete-slot 1")).toBeTruthy();
  await act(async () => item("Album", "Album Settings…")!.action!());
  expect(screen.getByText("Command album-settings 2")).toBeTruthy();
  await act(async () => item("Album", "Add Spread")!.action!());
  expect(screen.getByText("Command add-spread 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Begin mock edit" }));
  await waitFor(() => expect([item("Edit", "Delete")?.enabled, item("Album", "Add Spread")?.enabled]).toEqual([false, false]));
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

it("collapses, reopens and compacts the Photo pane from the View menu, Ctrl+B and its edge buttons, and remembers it", async () => {
  native.enabled = true;
  const ports = photoPanePorts({ width: 300, collapsed: false, compact: false });
  render(<App ports={ports} />);
  await screen.findByText("Original");
  const item = (text: string) =>
    native.menus.find((entry) => entry.text === "View")?.items?.find((entry) => entry.text.split("\t")[0] === text);
  await waitFor(() => expect(item("Toggle Photos")?.enabled).toBe(true));
  const pane = screen.getByRole("region", { name: "Photo pane" });
  expect(pane.style.width).toBe("300px");
  expect(screen.queryByRole("button", { name: "Show Photos" })).toBeNull();

  await act(async () => item("Toggle Photos")!.action!());
  expect(pane.hidden).toBe(true);
  expect(ports.setPhotoPane).toHaveBeenLastCalledWith({ width: 300, collapsed: true, compact: false });
  fireEvent.click(screen.getByRole("button", { name: "Show Photos" }));
  expect(pane.hidden).toBe(false);
  fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  expect(pane.hidden).toBe(true);
  fireEvent.keyDown(window, { key: "B", ctrlKey: true });
  expect(pane.hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Hide Photos" }));
  expect(pane.hidden).toBe(true);
  expect(screen.getByText("Photo browser")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Show Photos" }));

  expect(item("Compact Photos")?.checked).toBe(false);
  await act(async () => item("Compact Photos")!.action!());
  expect(screen.getByText("Compact Photo browser")).toBeTruthy();
  await waitFor(() => expect(item("Compact Photos")?.checked).toBe(true));
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
    native.menus.find((entry) => entry.text === menu)?.items?.find((entry) => entry.text.split("\t")[0] === text);
  await waitFor(() => expect(item("View", "Toggle Photos")?.enabled).toBe(true));
  await act(async () => item("File", "Preferences…")!.action!());
  fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "b", ctrlKey: true });
  await waitFor(() => expect(item("View", "Toggle Photos")?.enabled).toBe(false));
  expect(pane.hidden).toBe(false);
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
