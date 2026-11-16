// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createAlbum, serializeAlbum } from "../core";
import App, { type DocumentPorts } from "./App";

type MenuEntry = { text: string; action?: () => void; items?: MenuEntry[] };
const native = vi.hoisted(() => ({ enabled: false, items: [] as MenuEntry[] }));
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
    native.items = menu.items[0].items ?? [];
    return { setAsAppMenu: async () => null, close: async () => {} };
  } },
}));
vi.mock("./AlbumWorkspace", () => ({
  default: ({ document, suspended }: { document: { album: { title: string } }; suspended?: boolean }) => {
    const [title, setTitle] = useState(document.album.title);
    return <><p>{title}</p><button type="button" disabled={suspended} onClick={() => setTitle("Edited Album")}>Edit mock Album</button></>;
  },
}));
vi.mock("./PhotoBrowser", () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  native.enabled = false;
  native.items = [];
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
    parent: async () => "D:\\Photos",
    chooseNew: async () => null,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  await screen.findByText("Family: / 2026");
  await waitFor(() => expect(ports.remember).toHaveBeenCalledWith("D:\\Photos\\renamed.phalbum"));
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
    parent: async () => "D:\\Photos",
    chooseNew: async () => path,
    chooseOpen: async () => null,
  };
  render(<App ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "New Album…" }));
  await screen.findByRole("dialog", { name: "Album settings" });
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A: B / C" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Album" }));
  await screen.findByText("A: B / C");
  expect(ports.write).toHaveBeenCalledWith(path, expect.any(String), true);
  const json = vi.mocked(ports.write).mock.calls[0][1];
  expect(JSON.parse(json).title).toBe("A: B / C");
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
