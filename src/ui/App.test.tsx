// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createAlbum, serializeAlbum } from "../core";
import App, { type DocumentPorts } from "./App";

vi.mock("./AlbumWorkspace", () => ({
  default: ({ document }: { document: { album: { title: string } } }) => <p>{document.album.title}</p>,
}));
vi.mock("./PhotoBrowser", () => ({ default: () => null }));

afterEach(cleanup);

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
