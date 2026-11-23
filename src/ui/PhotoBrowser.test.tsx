// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { addPhotoSlot, createAlbum, duplicatePage, placePhoto, type Album, type ContentIndexBatch, type PhotoMove } from "../core";
import PhotoBrowser, { type SortCommandName } from "./PhotoBrowser";
import { hasPhotoDrag, readPhotoDrag } from "./photoDrag";
import { tauriPhotoPorts } from "./tauriPhotoPorts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("DragEvent", MouseEvent);
  vi.spyOn(tauriPhotoPorts, "index").mockImplementation(async (_root, paths) => ({
    identities: paths.map((path) => ({ path, status: "ready", hash: path })),
    hashedFiles: 0, hashedBytes: 0, cacheHits: paths.length, elapsedMs: 0,
  }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{
          target,
          contentRect: new DOMRectReadOnly(0, 0, 340, 600),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        }],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function photo(index: number) {
  return {
    path: `photo-${index}.jpg`,
    captureDate: 1_577_934_245_000 + index * 1000,
    width: 4000,
    height: 3000,
    orientation: 1,
    revision: `revision-${index}`,
  };
}

function photoTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "none", dropEffect: "none",
    get types() { return [...data.keys()]; },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
}

/** What `read_photos` returns for Photos moved to `paths`: the same Photos, found by file name, at their new paths. */
function movedRecords(photos: ReturnType<typeof photo>[], paths: string[]) {
  const name = (path: string) => path.split("/").pop();
  return paths.map((path) => ({ ...photos.find((scanned) => name(scanned.path) === name(path))!, path, revision: `moved:${path}` }));
}

it("updates Usage badges and the unused filter as the current Album changes", async () => {
  const first = photo(0);
  const second = photo(1);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [first, second], folders: ["folder"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  const { rerender } = render(<PhotoBrowser root="D:\\Photos" />);
  await screen.findByText(first.path);
  expect(screen.queryByText(/Capture date/)).toBeNull();
  const filter = screen.getByRole("switch", { name: "All" }) as HTMLButtonElement;
  expect(filter.title).toBe("Only Photos not used in this Album");
  expect(filter.getAttribute("aria-checked")).toBe("false");
  expect(filter.disabled).toBe(true);
  let album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1");
  album = placePhoto(album, "page-1", "slot-1", first);
  rerender(<PhotoBrowser root="D:\\Photos" album={album} />);
  expect(screen.getByLabelText("Used 1 time in this Album").textContent).toBe("1");
  album = duplicatePage(album, "page-1");
  rerender(<PhotoBrowser root="D:\\Photos" album={album} />);
  expect(screen.getByLabelText("Used 2 times in this Album").textContent).toBe("2");
  fireEvent.click(filter);
  expect(filter.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("switch", { name: "Unused" })).toBe(filter);
  expect(screen.queryByText(first.path)).toBeNull();
  expect(screen.getByText(second.path)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open folder folder" })).toBeTruthy();
  album = placePhoto(album, "page-1", "slot-1", second);
  rerender(<PhotoBrowser root="D:\\Photos" album={album} />);
  expect(screen.queryByText(second.path)).toBeNull();
  expect(screen.getByText("No unused Photos in this folder.")).toBeTruthy();
  fireEvent.click(filter);
  expect(screen.getAllByLabelText("Used 1 time in this Album")).toHaveLength(2);
});

it("shows shared Usage for Identical Photos and excludes both from the unused filter", async () => {
  const first = photo(0);
  const copy = photo(1);
  vi.mocked(tauriPhotoPorts.index).mockImplementation(async (_root, paths) => ({
    identities: paths.map((path) => ({ path, status: "ready", hash: "same" })),
    hashedFiles: 2, hashedBytes: 100, cacheHits: 0, elapsedMs: 1,
  }));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [first, copy], folders: [], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test" }), "page-1"), "page-1", "slot-1", first);
  render(<PhotoBrowser root="D:\\Photos" album={album} />);
  await waitFor(() => expect(screen.getAllByLabelText("Used 1 time in this Album")).toHaveLength(2));
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  expect(screen.queryByText(first.path)).toBeNull();
  expect(screen.queryByText(copy.path)).toBeNull();
});

it("excludes pending and failed checks from Unused, keeps browsing available and offers retry", async () => {
  const first = photo(0);
  const second = photo(1);
  const batches: { paths: string[]; finish: (batch: ContentIndexBatch) => void }[] = [];
  vi.mocked(tauriPhotoPorts.index).mockImplementation((_root, paths) =>
    new Promise((finish) => batches.push({ paths, finish })));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [first, second], folders: ["holiday"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root="D:\\Photos" album={createAlbum({ name: "Test" })} />);
  await screen.findByText(first.path);
  expect(screen.getAllByText("Checking...")).toHaveLength(2);
  expect((screen.getByRole("button", { name: "Open folder holiday" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  expect(screen.queryByText(first.path)).toBeNull();
  expect(screen.queryByText(second.path)).toBeNull();
  expect(screen.getByText(/Unresolved Photos are excluded/)).toBeTruthy();
  expect(screen.queryByText("No unused Photos in this folder.")).toBeNull();
  batches[0].finish({
    identities: [{ path: first.path, status: "ready", hash: "a" }, { path: second.path, status: "error", message: "Access denied" }],
    hashedFiles: 1, hashedBytes: 10, cacheHits: 0, elapsedMs: 1,
  });
  await screen.findByText(/Access denied/);
  expect(screen.getByText(first.path)).toBeTruthy();
  expect(screen.queryByText(second.path)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry Usage check" }));
  await waitFor(() => expect(batches).toHaveLength(2));
  batches[1].finish({
    identities: batches[1].paths.map((path) => ({ path, status: "ready", hash: path })),
    hashedFiles: 1, hashedBytes: 10, cacheHits: 1, elapsedMs: 1,
  });
  expect(await screen.findByText(second.path)).toBeTruthy();
  expect(screen.queryByText("Photo Usage check failed.")).toBeNull();
});

it("retains alias Usage and Unused after a case-only rescan and reopening", async () => {
  const original = { ...photo(0), path: "Photo.jpg" };
  let scanned = original;
  vi.mocked(tauriPhotoPorts.index).mockImplementation(async (_root, paths) => ({
    identities: paths.map((path) => ({ path, status: "ready", hash: "same-file" })),
    hashedFiles: 0, hashedBytes: 0, cacheHits: paths.length, elapsedMs: 0,
  }));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [scanned], folders: [], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });

  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test" }), "page-1"), "page-1", "slot-1", original);
  const first = render(<PhotoBrowser root="D:\\Photos" album={album} />);
  await screen.findByLabelText("Used 1 time in this Album");
  scanned = { ...original, path: "photo.jpg" };
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText("photo.jpg");
  await screen.findByLabelText("Used 1 time in this Album");
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  expect(screen.queryByText("photo.jpg")).toBeNull();
  first.unmount();
  render(<PhotoBrowser root="D:\\Photos" album={album} />);
  await screen.findByText("photo.jpg");
  await screen.findByLabelText("Used 1 time in this Album");
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  expect(screen.queryByText("photo.jpg")).toBeNull();
});
it("switches Folder copy feedback live but chooses the operation from Alt at drop", async () => {
  vi.stubGlobal("DragEvent", MouseEvent);
  const original = photo(0);
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "scan_photos") return { photos: [original], folders: ["kids"], warnings: [] };
    if (command === "read_photos") return [{ ...original, path: (args as { paths: string[] }).paths[0] }];
    if (command === "read_sort_progress") return null;
    return "data:image/png;base64,dGVzdA==";
  });
  const onCopyPhotos = vi.fn(async () => [{ from: original.path, to: `kids/${original.path}` }]);
  const onSendPhotos = vi.fn(async () => []);
  render(<PhotoBrowser root="D:\\Photos" onCopyPhotos={onCopyPhotos} onSendPhotos={onSendPhotos} />);
  const tile = (await screen.findByText(original.path)).closest("figure")!;
  const target = screen.getByRole("button", { name: "Open folder kids" });
  const transfer = photoTransfer();
  fireEvent.dragStart(tile, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer, altKey: false, clientX: 320, clientY: 240 });
  expect(transfer.dropEffect).toBe("move");
  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  const badge = screen.getByText("Copy 1 Photo");
  expect(badge.classList.contains("photo-drag-count")).toBe(true);
  expect(badge.style.left).toBe("332px");
  expect(target.classList.contains("drop-target-copy")).toBe(true);
  fireEvent.dragOver(target, { dataTransfer: transfer, altKey: true, clientX: 620, clientY: 390 });
  expect(badge.style.left).toBe("632px");
  expect(transfer.dropEffect).toBe("copy");
  fireEvent.keyUp(window, { key: "Alt", altKey: false });
  expect(screen.getByText("Move 1 Photo")).toBeTruthy();
  expect(target.classList.contains("drop-target-copy")).toBe(false);
  fireEvent.dragOver(target, { dataTransfer: transfer, altKey: false });
  fireEvent.drop(target, { dataTransfer: transfer, altKey: true });
  await screen.findByText(`Copied "${original.path}" to kids.`);
  expect(onCopyPhotos).toHaveBeenCalledWith([original.path], "kids");
  expect(onSendPhotos).not.toHaveBeenCalled();
  expect(screen.getByText(original.path)).toBeTruthy();
  expect(screen.queryByText("Copy 1 Photo")).toBeNull();
  expect(screen.queryByText("Content index statistics")).toBeNull();
  fireEvent.dragStart(tile, { dataTransfer: transfer, altKey: true });
  fireEvent.dragOver(target, { dataTransfer: transfer, altKey: true });
  fireEvent.drop(target, { dataTransfer: transfer, altKey: false });
  await waitFor(() => expect(onSendPhotos).toHaveBeenCalledWith([original.path], "kids"));
  expect(onCopyPhotos).toHaveBeenCalledTimes(1);
});

it("uses the chosen drag default with live temporary Alt inversion and leaves explicit menu actions unchanged", async () => {
  const original = photo(0);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [original], folders: ["kids"], warnings: [] };
    if (command === "read_sort_progress") return null;
    return "data:image/png;base64,dGVzdA==";
  });
  const onCopyPhotos = vi.fn(async () => []);
  const onSendPhotos = vi.fn(async () => []);
  function Browser() {
    const [copyByDefault, setCopyByDefault] = useState(false);
    return <PhotoBrowser root="D:\\Photos" copyByDefault={copyByDefault} onCopyByDefaultChange={setCopyByDefault}
      onCopyPhotos={onCopyPhotos} onSendPhotos={onSendPhotos} />;
  }
  render(<Browser />);
  const tile = (await screen.findByText(original.path)).closest("figure")!;
  const toggle = within(screen.getByRole("group", { name: "Photo drag action" }));
  expect(toggle.getByRole("button", { name: "Move" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(toggle.getByRole("button", { name: "Copy" }));
  const target = screen.getByRole("button", { name: "Open folder kids" });
  const transfer = photoTransfer();
  fireEvent.dragStart(tile, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  expect(screen.getByText("Copy 1 Photo")).toBeTruthy();
  expect(transfer.dropEffect).toBe("copy");
  expect(target.classList.contains("drop-target-copy")).toBe(true);
  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  expect(screen.getByText("Move 1 Photo")).toBeTruthy();
  expect(target.classList.contains("drop-target-copy")).toBe(false);
  expect(toggle.getByRole("button", { name: "Copy" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.dragOver(target, { dataTransfer: transfer, altKey: true });
  expect(transfer.dropEffect).toBe("move");
  fireEvent.keyUp(window, { key: "Alt", altKey: false });
  expect(screen.getByText("Copy 1 Photo")).toBeTruthy();
  // The drop's modifier state overrides the preceding feedback.
  fireEvent.drop(target, { dataTransfer: transfer, altKey: true });
  await waitFor(() => expect(onSendPhotos).toHaveBeenCalledWith([original.path], "kids"));
  expect(onCopyPhotos).not.toHaveBeenCalled();
  fireEvent.dragStart(tile, { dataTransfer: transfer, altKey: true });
  fireEvent.dragOver(target, { dataTransfer: transfer, altKey: true });
  fireEvent.drop(target, { dataTransfer: transfer, altKey: false });
  await waitFor(() => expect(onCopyPhotos).toHaveBeenCalledWith([original.path], "kids"));
  expect(screen.queryByText("Copy 1 Photo")).toBeNull();
  fireEvent.contextMenu(tile);
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
  await waitFor(() => expect(onSendPhotos).toHaveBeenCalledTimes(2));
  fireEvent.click(toggle.getByRole("button", { name: "Move" }));
  fireEvent.contextMenu(tile);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "kids" }));
  await waitFor(() => expect(onCopyPhotos).toHaveBeenCalledTimes(2));
});

it.each(["operation", "refresh"] as const)("reports copy %s failures without removing the original Photo", async (failure) => {
  const original = photo(0);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [original], folders: ["kids"], warnings: [] };
    if (command === "read_photos") throw new Error("Read access denied");
    if (command === "read_sort_progress") return null;
    return "data:image/png;base64,dGVzdA==";
  });
  const onCopyPhotos = vi.fn(async () => {
    if (failure === "operation") throw new Error("Disk full. Could not remove the copy kids/a.jpg.");
    return [{ from: original.path, to: `kids/${original.path}` }];
  });
  render(<PhotoBrowser root="D:\\Photos" onCopyPhotos={onCopyPhotos} />);
  fireEvent.contextMenu((await screen.findByText(original.path)).closest("figure")!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "kids" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain(failure === "operation" ? "Could not remove the copy" : "Read access denied");
  expect(screen.getByText(original.path)).toBeTruthy();
});

it("refreshes shared Usage after copying without reopening and derives subsequent Placement counts for both files", async () => {
  const original = photo(0);
  const copy = { ...original, path: `kids/${original.path}`, revision: "copy" };
  vi.mocked(tauriPhotoPorts.index).mockImplementation(async (_root, paths) => ({
    identities: paths.map((path) => ({ path, status: "ready", hash: "same-bytes" })),
    hashedFiles: 0, hashedBytes: 0, cacheHits: paths.length, elapsedMs: 0,
  }));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [original], folders: ["kids"], warnings: [] };
    if (command === "read_photos") return [copy];
    if (command === "read_sort_progress") return null;
    return "data:image/png;base64,dGVzdA==";
  });
  let album = createAlbum({ name: "Test" });
  for (let index = 1; index <= 3; index++) {
    album = placePhoto(addPhotoSlot(album, "page-1"), "page-1", `slot-${index}`, original);
  }
  const onCopyPhotos = vi.fn(async () => [{ from: original.path, to: copy.path }]);
  const view = render(<PhotoBrowser root="D:\\Photos" album={album} onCopyPhotos={onCopyPhotos} />);
  await screen.findByLabelText("Used 3 times in this Album");
  fireEvent.contextMenu(screen.getByText(original.path).closest("figure")!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "kids" }));
  await screen.findByText(`Copied "${original.path}" to kids.`);
  fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
  await screen.findByLabelText("Used 3 times in this Album");
  album = placePhoto(addPhotoSlot(album, "page-1"), "page-1", "slot-4", copy);
  view.rerender(<PhotoBrowser root="D:\\Photos" album={album} onCopyPhotos={onCopyPhotos} />);
  await screen.findByLabelText("Used 4 times in this Album");
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  expect(screen.queryByText(original.path)).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Unused" }));
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  await screen.findByLabelText("Used 4 times in this Album");
});

it("offers copy destinations in Album mode, excludes protected/own Folders and creates a new Folder for copies", async () => {
  const original = photo(0);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [original], folders: ["kids", ".hidden", "Exports"], warnings: [] };
    if (command === "read_photos") return [{ ...original, path: `best/${original.path}` }];
    if (command === "read_sort_progress") return null;
    return "data:image/png;base64,dGVzdA==";
  });
  const onCopyPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
  const onCreateFolder = vi.fn(async (_parent: string, name: string) => name);
  render(<PhotoBrowser root="D:\\Photos" onCopyPhotos={onCopyPhotos} onCreateFolder={onCreateFolder} />);
  fireEvent.contextMenu((await screen.findByText(original.path)).closest("figure")!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
  const destinations = within(screen.getByRole("menu", { name: "Copy to Folder..." }));
  expect(destinations.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Library", "kids", "New Folder…"]);
  expect(destinations.getByRole("menuitem", { name: "Library" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(destinations.getByRole("menuitem", { name: "New Folder…" }));
  const dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
  expect(dialog.getByText(/copies 1 Photo/)).toBeTruthy();
  fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "best" } });
  fireEvent.click(dialog.getByRole("button", { name: "Create and Copy" }));
  await screen.findByText(`Copied "${original.path}" to best.`);
  expect(onCreateFolder).toHaveBeenCalledWith("", "best");
  expect(onCopyPhotos).toHaveBeenCalledWith([original.path], "best");
  expect(screen.getByText(original.path)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open folder best" })).toBeTruthy();
});

it("shows compact tiles without file names but keeps Usage badges and folder names", async () => {
  const first = photo(0);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [first, photo(1)], folders: ["holiday"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  const onCompactChange = vi.fn();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1"), "page-1", "slot-1", first);
  const { rerender } = render(<PhotoBrowser root="D:\\Photos" album={album} onCompactChange={onCompactChange} />);
  const toggle = screen.getByRole("switch", { name: "Compact" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(onCompactChange).toHaveBeenLastCalledWith(true);
  rerender(<PhotoBrowser root="D:\\Photos" album={album} compact onCompactChange={onCompactChange} />);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(toggle);
  expect(onCompactChange).toHaveBeenLastCalledWith(false);
  await screen.findByRole("button", { name: "Open folder holiday" });
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  expect(screen.queryByText(first.path)).toBeNull();
  expect(screen.getByLabelText("Used 1 time in this Album").textContent).toBe("1");
  expect(screen.getByText("holiday")).toBeTruthy();
  expect(within(screen.getByRole("list", { name: "Photos" })).getAllByRole("listitem").map((item) => item.style.height)).toEqual(["68px", "68px"]);
  // The Folder area is compact too, and at most two rows high.
  expect(screen.getByRole("list", { name: "Folders" }).style.maxHeight).toBe("136px");
  rerender(<PhotoBrowser root="D:\\Photos" album={album} onCompactChange={onCompactChange} />);
  expect(screen.getByRole("list", { name: "Folders" }).style.maxHeight).toBe("192px");
});

it.each([
  ["album", false], ["album", true], ["sort", false], ["sort", true],
] as const)("shows Folder Photo counts in %s mode (compact: %s)", async (mode, compact) => {
  const first = { ...photo(0), path: "holiday/a.jpg" };
  const identical = { ...photo(1), path: "holiday/beach/copy.jpg" };
  const extra = { ...photo(2), path: "holiday-extra/b.jpg" };
  vi.mocked(tauriPhotoPorts.index).mockImplementation(async (_root, paths) => ({
    identities: paths.map((path) => ({ path, status: "ready", hash: path === extra.path ? "extra" : "identical" })),
    hashedFiles: 0, hashedBytes: 0, cacheHits: paths.length, elapsedMs: 0,
  }));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return {
      photos: [first, identical, extra], folders: ["empty", "holiday", "holiday/beach", "holiday-extra"],
      warnings: ["bad.png: invalid PNG"],
    };
    if (command === "read_sort_progress") return JSON.stringify({ reviewed: [first.path], folders: {} });
    if (command === "write_sort_progress") return undefined;
    return "data:image/png;base64,dGVzdA==";
  });
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test" }), "page-1"), "page-1", "slot-1", first);
  const sort = mode === "sort" ? { host: null, active: true, onComparisonChange: vi.fn() } : undefined;
  render(<PhotoBrowser root="D:\\Photos" album={album} mode={mode} compact={compact} sort={sort} />);

  const count = (name: string, value: number) => {
    const tile = screen.getByRole("button", {
      name: `Open folder ${name}`, description: `${value} Photos in this Folder and its subfolders`,
    });
    const badge = within(tile).getByTitle("Photos in this Folder and its subfolders");
    expect(badge.firstChild?.textContent).toBe(String(value));
  };
  await screen.findByRole("button", { name: "Open folder holiday" });
  count("empty", 0);
  count("holiday", 2);
  count("holiday-extra", 1);
  expect(screen.getByText("bad.png: invalid PNG")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Checking Photo Usage...", { exact: false })).toBeNull());
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  count("holiday", 2);
  fireEvent.click(screen.getByRole("button", { name: "Open folder holiday" }));
  count("beach", 1);
  expect(screen.queryByText("a.jpg")).toBeNull();
  expect(within(screen.getByRole("navigation", { name: "Photo folders" }))
    .queryByTitle("Photos in this Folder and its subfolders")).toBeNull();
});

it("updates affected Folder counts after moves, copies and a Rescan", async () => {
  const first = { ...photo(0), path: "source/a.jpg" };
  const nested = { ...photo(1), path: "source/nested/b.jpg" };
  const existing = { ...photo(2), path: "target/deep/c.jpg" };
  const moved = { ...first, path: "target/a.jpg" };
  const added = { ...photo(3), path: "target/deep/outside.jpg" };
  let scans = 0;
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "scan_photos") return {
      photos: ++scans === 1 ? [first, nested, existing] : [moved, existing, added],
      folders: ["source", "source/nested", "target", "target/deep"], warnings: ["bad.png: invalid PNG"],
    };
    if (command === "read_photos") return (args as { paths: string[] }).paths.map((path) => ({ ...first, path }));
    return "data:image/png;base64,dGVzdA==";
  });
  const onSendPhotos = vi.fn(async () => [{ from: first.path, to: moved.path }]);
  const onCopyPhotos = vi.fn(async () => [{ from: moved.path, to: first.path }]);
  render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} onCopyPhotos={onCopyPhotos} />);
  const folder = (name: string, count: number) => screen.getByRole("button", {
    name: `Open folder ${name}`, description: `${count} Photos in this Folder and its subfolders`,
  });
  const library = () => within(screen.getByRole("navigation", { name: "Photo folders" })).getByRole("button", { name: "Library" });

  await screen.findByRole("button", { name: "Open folder source" });
  fireEvent.click(folder("source", 2));
  fireEvent.contextMenu((await screen.findByText("a.jpg")).closest("figure")!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "target" }));
  await screen.findByText('Moved "a.jpg" to target.');
  fireEvent.click(library());
  folder("source", 1);
  fireEvent.click(folder("target", 2));
  fireEvent.contextMenu((await screen.findByText("a.jpg")).closest("figure")!);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "source" }));
  await screen.findByText('Copied "a.jpg" to source.');
  fireEvent.click(library());
  folder("source", 2);
  folder("target", 2);
  expect(scans).toBe(1);

  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await waitFor(() => folder("source", 0));
  folder("target", 3);
  expect(screen.getByText("bad.png: invalid PNG")).toBeTruthy();
  expect(onSendPhotos).toHaveBeenCalledWith([first.path], "target");
  expect(onCopyPhotos).toHaveBeenCalledWith([moved.path], "source");
});

it("browses immediate folders and Photos, including empty folders, with breadcrumbs back to the Library", async () => {
  const photos = [
    { ...photo(0), path: "root.jpg" },
    { ...photo(1), path: "holiday/same.jpg" },
    { ...photo(2), path: "holiday/beach/same.jpg" },
    { ...photo(3), path: "holiday-extra/other.jpg" },
  ];
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return {
      photos, folders: ["empty", "holiday", "holiday/beach", "holiday-extra"], warnings: [],
    };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);

  await screen.findByText("root.jpg");
  expect(screen.queryByText("same.jpg")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open folder beach" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open folder holiday" }));
  await screen.findByText("same.jpg");
  expect(screen.queryByText("root.jpg")).toBeNull();
  expect(screen.queryByText("other.jpg")).toBeNull();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Open folder beach" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("photo_thumbnail", {
    root: "D:\\Photos", path: "holiday/beach/same.jpg", revision: photos[2].revision,
  }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  const breadcrumbs = screen.getByRole("navigation", { name: "Photo folders" });
  expect(within(breadcrumbs).getByText("beach").getAttribute("aria-current")).toBe("page");
  fireEvent.click(within(breadcrumbs).getByRole("button", { name: "holiday" }));
  expect(screen.getByRole("button", { name: "Open folder beach" })).toBeTruthy();
  fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Library" }));
  fireEvent.click(screen.getByRole("button", { name: "Open folder empty" }));
  expect(screen.getByText("No Photos in this folder.")).toBeTruthy();
  expect(screen.queryByRole("listitem")).toBeNull();
  fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Library" }));
  await screen.findByText("root.jpg");
});

it("shows the current Folder's subfolders in a Folder area apart from the Photo grid, only when it has any", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return {
      photos: [photo(0), { ...photo(1), path: "trips/kids/a.jpg" }], folders: ["pets", "trips", "trips/kids"], warnings: [],
    };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root="D:\\Photos" />);
  const folders = within(await screen.findByRole("list", { name: "Folders" }));
  expect(folders.getAllByRole("button").map((item) => item.getAttribute("aria-label"))).toEqual(["Open folder pets", "Open folder trips"]);
  const grid = within(await screen.findByRole("list", { name: "Photos" }));
  await grid.findByText(photo(0).path);
  expect(grid.getAllByRole("listitem")).toHaveLength(1);
  expect(grid.queryByRole("button", { name: /Open folder/ })).toBeNull();

  fireEvent.click(folders.getByRole("button", { name: "Open folder trips" }));
  fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
  await screen.findByText("a.jpg");
  expect(screen.queryByRole("list", { name: "Folders" })).toBeNull();
});

it("keeps the current folder on rescan and returns to a surviving ancestor with a notice if it disappears", async () => {
  const scans = [
    { photos: [{ ...photo(0), path: "holiday/beach/first.jpg" }], folders: ["holiday", "holiday/beach"], warnings: [] },
    { photos: [{ ...photo(1), path: "holiday/beach/added.jpg" }], folders: ["holiday", "holiday/beach"], warnings: [] },
    { photos: [{ ...photo(2), path: "holiday/parent.jpg" }], folders: ["holiday"], warnings: [] },
    { photos: [{ ...photo(3), path: "root.jpg" }], folders: [], warnings: [] },
  ];
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return scans.shift();
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open folder holiday" }));
  fireEvent.click(screen.getByRole("button", { name: "Open folder beach" }));
  await screen.findByText("first.jpg");
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText("added.jpg");
  expect(screen.queryByText("first.jpg")).toBeNull();
  expect(within(screen.getByRole("navigation")).getByText("beach").getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText("parent.jpg");
  expect(screen.getByText(/holiday\/beach.*no longer available/)).toBeTruthy();
  expect(within(screen.getByRole("navigation")).getByText("holiday").getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText("root.jpg");
  expect(screen.getByText(/holiday.*no longer available/)).toBeTruthy();
  expect(within(screen.getByRole("navigation")).getByText("Library").getAttribute("aria-current")).toBe("page");
});

it("renders only a small window of 2,500 Photos and lazily loads thumbnails as the user scrolls", async () => {
  const photos = Array.from({ length: 2500 }, (_, index) => ({
    ...photo(index), path: `holiday/photo-${index}.jpg`,
  }));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos, folders: ["holiday"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);

  fireEvent.click(await screen.findByRole("button", { name: "Open folder holiday" }));
  await screen.findByText("2,500 Photos");
  await waitFor(() => expect(screen.getAllByRole("img").length).toBeGreaterThan(0));
  expect(screen.getAllByRole("listitem").length).toBeLessThan(30);
  expect(invoke).toHaveBeenCalledWith("scan_photos", { root: "D:\\Photos" });
  expect(invoke).not.toHaveBeenCalledWith("photo_thumbnail", expect.objectContaining({ path: photos[2499].path }));

  fireEvent.scroll(screen.getByLabelText("Photo grid"), { target: { scrollTop: 199_400 } });
  await screen.findByText("photo-2499.jpg");
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("photo_thumbnail", {
    root: "D:\\Photos", path: photos[2499].path, revision: photos[2499].revision,
  }));
  expect(screen.queryByText("photo-0.jpg")).toBeNull();
  expect(screen.getAllByRole("listitem").length).toBeLessThan(30);

  fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Library" }));
  fireEvent.click(screen.getByRole("button", { name: "Open folder holiday" }));
  await screen.findByText("photo-0.jpg");
  expect(screen.queryByText("photo-2499.jpg")).toBeNull();
  expect(screen.getByLabelText("Photo grid").scrollTop).toBe(0);
});

it("rescans added and removed Photos, reports warnings, and keeps the grid when a rescan fails", async () => {
  let scanned = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command !== "scan_photos") return "data:image/png;base64,dGVzdA==";
    scanned++;
    if (scanned === 3) throw new Error("Library disconnected");
    return {
      photos: [{ ...photo(scanned === 1 ? 0 : 1), path: `holiday/photo-${scanned === 1 ? 0 : 1}.jpg` }],
      folders: ["holiday"],
      warnings: scanned === 1 ? [] : ["bad.jpg: invalid JPEG"],
    };
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open folder holiday" }));
  await screen.findByText("photo-0.jpg");
  await waitFor(() => expect(screen.getByRole("button", { name: "Rescan" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText("photo-1.jpg");
  expect(screen.queryByText("photo-0.jpg")).toBeNull();
  expect(screen.getByText("bad.jpg: invalid JPEG")).toBeTruthy();

  await waitFor(() => expect(screen.getByRole("button", { name: "Rescan" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText(/Could not scan the Library:.*Library disconnected/);
  expect(screen.getByText("photo-1.jpg")).toBeTruthy();
  expect(within(screen.getByRole("navigation")).getByText("holiday").getAttribute("aria-current")).toBe("page");
});

it("keeps the grid and its scroll position on rescan, retrying only failed thumbnails", async () => {
  const photos = Array.from({ length: 200 }, (_, index) => photo(index));
  const failing = new Set([photos[150].path]);
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "scan_photos") return { photos: photos.map((scanned) => ({ ...scanned })), folders: [], warnings: [] };
    if (failing.has((args as { path: string }).path)) throw new Error("Photo is locked");
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root="D:\\Photos" />);
  const grid = await screen.findByLabelText("Photo grid");
  fireEvent.scroll(grid, { target: { scrollTop: 12_000 } });
  await screen.findByText("Thumbnail unavailable. Rescan to retry.");
  const thumbnails = (path: string) => vi.mocked(invoke).mock.calls.filter(([command, args]) =>
    command === "photo_thumbnail" && (args as { path: string }).path === path).length;
  await waitFor(() => expect(thumbnails(photos[151].path)).toBe(1));
  const list = screen.getByRole("list", { name: "Photos" });

  failing.clear();
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await waitFor(() => expect(thumbnails(photos[150].path)).toBe(2));
  await waitFor(() => expect(screen.queryByText("Thumbnail unavailable. Rescan to retry.")).toBeNull());
  expect(screen.getByRole("list", { name: "Photos" })).toBe(list);
  expect(screen.getByLabelText("Photo grid").scrollTop).toBe(12_000);
  expect(thumbnails(photos[151].path)).toBe(1);
});

it("cancels queued thumbnails when leaving a folder", async () => {
  const photos = Array.from({ length: 100 }, (_, index) => ({
    ...photo(index), path: `holiday/photo-${index}.jpg`,
  }));
  const release: (() => void)[] = [];
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos, folders: ["holiday"], warnings: [] };
    await new Promise<void>((resolve) => release.push(resolve));
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open folder holiday" }));
  await waitFor(() => expect(release).toHaveLength(4));
  fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Library" }));
  release.forEach((resolve) => resolve());
  await screen.findByText("No Photos in this folder.");
  await waitFor(() => expect(screen.queryByText("photo-0.jpg")).toBeNull());
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_thumbnail")).toHaveLength(4);
});

it("caps thumbnail work at four requests and cancels queued work after scrolling away", async () => {
  const photos = Array.from({ length: 2500 }, (_, index) => photo(index));
  const release: (() => void)[] = [];
  let paused = true;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos, folders: [], warnings: [] };
    if (paused) await new Promise<void>((resolve) => release.push(resolve));
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
  await waitFor(() => expect(release.length).toBe(4));
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_thumbnail")).toHaveLength(4);
  fireEvent.scroll(screen.getByLabelText("Photo grid"), { target: { scrollTop: 199_400 } });
  paused = false;
  release.forEach((resolve) => resolve());
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("photo_thumbnail", expect.objectContaining({ path: photos[2499].path })));
  expect(invoke).not.toHaveBeenCalledWith("photo_thumbnail", expect.objectContaining({ path: photos[4].path }));
});

it("keeps thumbnail state during a pending rescan and reports thumbnail failures explicitly", async () => {
  let finishScan: (result: { photos: ReturnType<typeof photo>[]; folders: string[]; warnings: string[] }) => void = () => {};
  let scans = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") {
      if (++scans === 1) return { photos: [photo(0)], folders: [], warnings: [] };
      return new Promise((resolve) => { finishScan = resolve; });
    }
    throw new Error("Photo was deleted");
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
  await screen.findByText("Thumbnail unavailable. Rescan to retry.");
  fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await screen.findByText("Scanning Library...");
  expect(screen.getByText("photo-0.jpg")).toBeTruthy();
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_thumbnail")).toHaveLength(1);
  finishScan({ photos: [], folders: [], warnings: [] });
  await screen.findByText(/No Photos yet/);
});

it("lets a Photo tile be dragged with the Photo as its payload", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [{ ...photo(0), path: "holiday/tree.jpg", orientation: 6 }], folders: ["holiday"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open folder holiday" }));
  const tile = (await screen.findByText("tree.jpg")).closest("figure")!;
  await screen.findByRole("img", { name: "tree.jpg" });
  expect(tile.getAttribute("draggable")).toBe("true");
  const data = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    get types() { return [...data.keys()]; },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
  fireEvent.dragStart(tile, { dataTransfer });
  expect(dataTransfer.effectAllowed).toBe("copyMove");
  expect(hasPhotoDrag(dataTransfer as unknown as DataTransfer)).toBe(true);
  expect(readPhotoDrag(dataTransfer as unknown as DataTransfer)).toEqual({
    path: "holiday/tree.jpg", width: 4000, height: 3000, orientation: 6,
    thumbnail: "data:image/png;base64,dGVzdA==",
  });
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_preview")).toHaveLength(1);
  const secondDataTransfer = { ...dataTransfer, setData: (type: string, value: string) => data.set(type, value) };
  fireEvent.dragStart(tile, { dataTransfer: secondDataTransfer });
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_preview")).toHaveLength(1);
  expect(readPhotoDrag({ types: [], getData: () => "" } as unknown as DataTransfer)).toBeNull();
  const incompleteTransfer = { getData: () => "" } as unknown as DataTransfer;
  expect(hasPhotoDrag(incompleteTransfer)).toBe(false);
  expect(readPhotoDrag(incompleteTransfer)).toBeNull();
});

it("reuses completed previews only when the current Photo revision is known", async () => {
  vi.mocked(invoke).mockResolvedValue("data:image/jpeg;base64,preview");
  const root = "D:\\Photos";
  const original = { ...photo(0), path: "preview-cache-regression.jpg" };

  await tauriPhotoPorts.prewarmPreview(root, original);
  await tauriPhotoPorts.prewarmPreview(root, original);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_preview")).toHaveLength(1);

  await tauriPhotoPorts.prewarmPreview(root, { ...original, revision: "changed-revision" });
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_preview")).toHaveLength(2);

  await tauriPhotoPorts.preview(root, original.path);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "photo_preview")).toHaveLength(3);
});

describe("sending Photos to a Folder by dragging", () => {

  async function browseTrips(onSendPhotos: (photos: string[], target: string) => Promise<PhotoMove[]>) {
    let scans = 0;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "scan_photos") {
        scans++;
        return { photos: [{ ...photo(0), path: "trips/a.jpg" }], folders: ["trips", "trips/kids"], warnings: [] };
      }
      if (command === "read_photos") return (args as { paths: string[] }).paths.map((path) => ({ ...photo(0), path, revision: `moved:${path}` }));
      return "data:image/png;base64,dGVzdA==";
    });
    render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open folder trips" }));
    const tile = (await screen.findByText("a.jpg")).closest("figure")!;
    const folder = screen.getByRole("button", { name: "Open folder kids" });
    const breadcrumbs = within(screen.getByRole("navigation", { name: "Photo folders" }));
    return { tile, folder, library: breadcrumbs.getByRole("button", { name: "Library" }), current: breadcrumbs.getByRole("button", { name: "trips" }), scans: () => scans };
  }

  it("outlines the Folders a dragged Photo can go to and sends it to the one it is dropped on", async () => {
    let finish!: (moves: PhotoMove[]) => void;
    const onSendPhotos = vi.fn(() => new Promise<PhotoMove[]>((resolve) => { finish = resolve; }));
    const { tile, folder, library, current, scans } = await browseTrips(onSendPhotos);
    for (const target of [folder, library, current]) expect(target.classList.contains("drop-target")).toBe(false);

    const transfer = photoTransfer();
    fireEvent.dragStart(tile, { dataTransfer: transfer });
    expect(folder.classList.contains("drop-target")).toBe(true);
    expect(library.classList.contains("drop-target")).toBe(true);
    expect(current.classList.contains("drop-target")).toBe(false);
    expect(fireEvent.dragOver(current, { dataTransfer: transfer })).toBe(true);
    expect(fireEvent.dragOver(folder, { dataTransfer: transfer })).toBe(false);
    expect(transfer.dropEffect).toBe("move");
    expect(folder.classList.contains("drop-target-over")).toBe(true);
    expect(library.classList.contains("drop-target-over")).toBe(false);
    fireEvent.dragLeave(folder, { dataTransfer: transfer });
    expect(folder.classList.contains("drop-target-over")).toBe(false);

    fireEvent.dragOver(folder, { dataTransfer: transfer });
    fireEvent.drop(folder, { dataTransfer: transfer });
    expect(onSendPhotos).toHaveBeenCalledWith(["trips/a.jpg"], "trips/kids");
    expect(screen.getByLabelText("Photo grid").style.overflowY).toBe("");
    expect(folder.classList.contains("drop-target")).toBe(false);
    finish([{ from: "trips/a.jpg", to: "trips/kids/a (2).jpg" }]);
    expect(await screen.findByText('Moved "a.jpg" to kids as "a (2).jpg".')).toBeTruthy();
    await screen.findByText("No Photos in this folder.");
    expect(scans()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    expect(await screen.findByText("a (2).jpg")).toBeTruthy();
  });

  it("sends a Photo to the Library root from a breadcrumb and reports a failed move", async () => {
    const onSendPhotos = vi.fn(async () => { throw new Error("Album locked"); });
    const { tile, library } = await browseTrips(onSendPhotos);
    const transfer = photoTransfer();
    fireEvent.dragStart(tile, { dataTransfer: transfer });
    fireEvent.dragOver(library, { dataTransfer: transfer });
    fireEvent.drop(library, { dataTransfer: transfer });
    expect(onSendPhotos).toHaveBeenCalledWith(["trips/a.jpg"], "");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not move "a.jpg".*Album locked/);
    expect(screen.getByText("a.jpg")).toBeTruthy();
  });

  it("ignores Photos not dragged from the grid, such as Placements from a Page", async () => {
    const onSendPhotos = vi.fn(async () => []);
    const { folder } = await browseTrips(onSendPhotos);
    const transfer = photoTransfer();
    transfer.setData("application/x-phalbummakr-photo", JSON.stringify({ path: "trips/a.jpg", width: 1, height: 1, orientation: 1 }));
    expect(fireEvent.dragOver(folder, { dataTransfer: transfer })).toBe(true);
    fireEvent.drop(folder, { dataTransfer: transfer });
    expect(folder.classList.contains("drop-target")).toBe(false);
    expect(onSendPhotos).not.toHaveBeenCalled();
  });
  it("keeps the grid still during a Photo drag while the Folder area still scrolls at its edges", async () => {
    // jsdom has no DragEvent, so dragover would lose its pointer position.
    vi.stubGlobal("DragEvent", MouseEvent);
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "scan_photos") return { photos: Array.from({ length: 40 }, (_, index) => photo(index)), folders: ["a", "b", "c", "d", "e"], warnings: [] };
      return "data:image/png;base64,dGVzdA==";
    });
    render(<PhotoBrowser root="D:\\Photos" onSendPhotos={vi.fn(async () => [])} />);
    const tile = (await screen.findByText(photo(0).path)).closest("figure")!;
    const transfer = photoTransfer();
    const placed = (element: HTMLElement, top: number, bottom: number) => {
      element.getBoundingClientRect = () => new DOMRect(0, top, 340, bottom - top);
      return element;
    };
    const area = placed(screen.getByRole("list", { name: "Folders" }), 100, 260);
    const grid = placed(screen.getByLabelText("Photo grid"), 270, 870);
    const hover = (element: HTMLElement, clientY: number) => fireEvent.dragOver(element, { dataTransfer: transfer, clientY });

    fireEvent.scroll(grid, { target: { scrollTop: 160 } });
    expect(grid.style.overflowY).toBe("");
    fireEvent.dragStart(tile, { dataTransfer: transfer });
    expect(grid.style.overflowY).toBe("hidden");
    hover(area, 180);
    expect(area.scrollTop).toBe(0);
    hover(tile, 868);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(grid.scrollTop).toBe(160);
    hover(grid, 272);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(grid.scrollTop).toBe(160);
    hover(screen.getByRole("button", { name: "Open folder e" }), 258);
    expect(area.scrollTop).toBeGreaterThan(0);
    const scrolled = area.scrollTop;
    hover(area, 102);
    await waitFor(() => expect(area.scrollTop).toBeLessThan(scrolled));
    fireEvent.dragEnd(tile, { dataTransfer: transfer });
    expect(grid.style.overflowY).toBe("");
    fireEvent.scroll(grid, { target: { scrollTop: 320 } });
    expect(grid.scrollTop).toBe(320);
  });
});

it("forgets a grid drag whose tile disappeared before the drag ended, and only takes Photo drags", async () => {
  const onSendPhotos = vi.fn(async () => []);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [photo(0)], folders: ["kids"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} />);
  const tile = (await screen.findByText(photo(0).path)).closest("figure")!;
  const folder = screen.getByRole("button", { name: "Open folder kids" });
  fireEvent.dragStart(tile, { dataTransfer: { effectAllowed: "none", setData: () => {} } });
  expect(screen.getByLabelText("Photo grid").style.overflowY).toBe("hidden");
  expect(folder.classList.contains("drop-target")).toBe(true);
  const layoutDrag = { types: ["application/x-phalbummakr-layout"], getData: () => "layout-1", dropEffect: "none" };
  expect(fireEvent.dragOver(folder, { dataTransfer: layoutDrag })).toBe(true);
  fireEvent.drop(folder, { dataTransfer: layoutDrag });
  expect(onSendPhotos).not.toHaveBeenCalled();
  // Browsers send no mouse moves during a drag, so the first one means it ended.
  fireEvent.mouseMove(window);
  expect(folder.classList.contains("drop-target")).toBe(false);
  expect(screen.getByLabelText("Photo grid").style.overflowY).toBe("");
});

describe("Sort mode", () => {
  const hosts: HTMLElement[] = [];
  afterEach(() => hosts.splice(0).forEach((host) => host.remove()));

  function sortHost() {
    const host = document.createElement("section");
    document.body.append(host);
    hosts.push(host);
    return host;
  }

  async function browseSort({ photos = [0, 1, 2].map(photo), folders = ["kids", "kids/small", ".hidden"], album = null as Album | null,
    saved = null as string | null, warnings = [] as string[],
    onSendPhotos = vi.fn(async (): Promise<PhotoMove[]> => []), onCopyPhotos = vi.fn(async (): Promise<PhotoMove[]> => []), copyByDefault = false,
    onCreateFolder = vi.fn(async (parent: string, name: string) => parent ? `${parent}/${name}` : name),
    zoom = 1, onZoomChange = vi.fn() as (change: (zoom: number) => number) => void } = {}) {
    const writes: Array<{ reviewed: string[]; folders: Record<string, { scrollTop: number; shown: string | null }> }> = [];
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "scan_photos") return { photos, folders, warnings };
      if (command === "read_photos") return movedRecords(photos, (args as { paths: string[] }).paths);
      if (command === "read_sort_progress") return saved;
      if (command === "write_sort_progress") {
        writes.push(JSON.parse((args as { json: string }).json));
        return undefined;
      }
      return `data:image/png;base64,${String(command)}`;
    });
    const host = sortHost();
    const onComparisonChange = vi.fn();
    const props = { root: "D:\\Photos", album, onSendPhotos, onCopyPhotos, onCreateFolder, copyByDefault };
    const view = render(<PhotoBrowser {...props} sort={{ host, active: true, onComparisonChange, zoom, onZoomChange }} />);
    // A remembered scroll position may open the grid away from the first Photo.
    await within(await screen.findByRole("list", { name: "Photos" })).findAllByRole("listitem");
    const tile = (path: string) => within(screen.getByRole("list", { name: "Photos" })).getByText(path).closest("figure")!;
    const rerunCommand = (serial: number, name: SortCommandName) =>
      view.rerender(<PhotoBrowser {...props} sort={{ host, active: true, onComparisonChange, zoom, onZoomChange, command: { name, serial } }} />);
    const leaveSort = () => view.rerender(<PhotoBrowser {...props} sort={{ host, active: false, onComparisonChange, zoom, onZoomChange }} />);
    const lastWrite = () => writes.at(-1);
    return { host, work: within(host), tile, onComparisonChange, onSendPhotos, onCreateFolder, rerunCommand, leaveSort, lastWrite, view };
  }

  it("keeps the grid still at both edges while dragging a Photo from the work area", async () => {
    vi.stubGlobal("DragEvent", MouseEvent);
    const { work, tile } = await browseSort({ photos: Array.from({ length: 40 }, (_, index) => photo(index)) });
    fireEvent.click(tile(photo(0).path));
    const source = (await work.findByRole("img", { name: photo(0).path })).closest("figure")!;
    const grid = screen.getByLabelText("Photo grid");
    grid.getBoundingClientRect = () => new DOMRect(0, 270, 340, 600);
    fireEvent.scroll(grid, { target: { scrollTop: 160 } });
    const transfer = photoTransfer();
    fireEvent.dragStart(source, { dataTransfer: transfer });
    expect(grid.style.overflowY).toBe("hidden");
    for (const clientY of [272, 868]) {
      fireEvent.dragOver(grid, { dataTransfer: transfer, clientY });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(grid.scrollTop).toBe(160);
    }
    fireEvent.dragEnd(source, { dataTransfer: transfer });
    expect(grid.style.overflowY).toBe("");
  });

  it("shows a clicked Photo large with its Usage badge, and steps through the grid with the arrow keys", async () => {
    const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1"), "page-1", "slot-1", photo(1));
    const { work, tile, onComparisonChange, leaveSort } = await browseSort({ album });
    expect(work.getByText(/Click a Photo/)).toBeTruthy();
    expect(onComparisonChange).toHaveBeenLastCalledWith({ shown: 0 });
    fireEvent.click(tile(photo(0).path));
    expect(await work.findByRole("img", { name: photo(0).path })).toBeTruthy();
    expect(work.queryByLabelText(/Used/)).toBeNull();
    expect(onComparisonChange).toHaveBeenLastCalledWith({ shown: 1 });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await work.findByRole("img", { name: photo(1).path })).toBeTruthy();
    expect(work.getByLabelText("Used 1 time in this Album").textContent).toBe("1");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await work.findByRole("img", { name: photo(2).path })).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(await work.findByRole("img", { name: photo(1).path })).toBeTruthy();
    expect(work.getAllByRole("img")).toHaveLength(1);
    expect(tile(photo(1).path).classList.contains("photo-tile--shown")).toBe(true);
    // Outside Sort mode, clicks and arrows do nothing and the grid doesn't mark what Sort mode shows.
    leaveSort();
    expect(tile(photo(1).path).classList.contains("photo-tile--shown")).toBe(false);
    fireEvent.click(tile(photo(0).path));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(work.getByRole("img", { name: photo(1).path })).toBeTruthy();
  });

  it("compares any number of Ctrl-clicked Photos in a grid that fits them, unselected, and selects and unselects them by clicking", async () => {
    const { work, tile, onComparisonChange } = await browseSort({ photos: [0, 1, 2, 3, 4, 5, 6].map(photo) });
    fireEvent.click(tile(photo(0).path));
    fireEvent.click(tile(photo(1).path), { ctrlKey: true });
    const comparison = work.getByRole("group", { name: "Comparison" });
    // Ctrl-click doesn't select, and the Photo that was shown on its own no longer counts as selected.
    expect(onComparisonChange).toHaveBeenLastCalledWith({ shown: 2 });
    expect(work.getByRole("button", { name: `Select ${photo(0).path}` }).getAttribute("aria-pressed")).toBe("false");
    expect(work.queryByText("Selected")).toBeNull();
    fireEvent.click(work.getByRole("button", { name: `Select ${photo(1).path}` }));
    expect(work.getByRole("button", { name: `Unselect ${photo(1).path}` }).getAttribute("aria-pressed")).toBe("true");
    expect(work.getByText("Selected")).toBeTruthy();
    const grid = () => [comparison.style.getPropertyValue("--columns"), comparison.style.getPropertyValue("--rows")];
    expect(grid()).toEqual(["2", "1"]);
    for (const index of [2, 3, 4, 5, 6]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    expect(work.getByRole("button", { name: `Select ${photo(6).path}` })).toBeTruthy();
    // The grid marks the Photos in the Comparison alike, selected or not.
    expect(tile(photo(1).path).className).toBe(tile(photo(6).path).className);
    expect(work.getByRole("button", { name: `Unselect ${photo(1).path}` })).toBeTruthy();
    expect(grid()).toEqual(["3", "3"]);
    fireEvent.click(tile(photo(0).path), { ctrlKey: true });
    expect(work.queryByRole("button", { name: /photo-0\.jpg/ })).toBeNull();
    expect(grid()).toEqual(["3", "2"]);
    expect(onComparisonChange).toHaveBeenLastCalledWith({ shown: 6 });
    fireEvent.click(tile(photo(4).path));
    expect(work.queryByRole("group", { name: "Comparison" })).toBeNull();
    expect(await work.findByRole("img", { name: photo(4).path })).toBeTruthy();
  });

  it("clears the Comparison and its Selected Photos from the command bar", async () => {
    const { work, tile, onComparisonChange, rerunCommand } = await browseSort();
    fireEvent.click(tile(photo(0).path));
    for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    fireEvent.click(work.getByRole("button", { name: `Select ${photo(1).path}` }));
    rerunCommand(1, "clear-comparison");
    expect(work.queryByRole("group", { name: "Comparison" })).toBeNull();
    expect(work.getByText(/Click a Photo/)).toBeTruthy();
    expect(onComparisonChange).toHaveBeenLastCalledWith({ shown: 0 });
    expect(tile(photo(1).path).classList.contains("photo-tile--shown")).toBe(false);
    // The Selected Photos went with it: comparing the same Photos again starts afresh, unselected.
    fireEvent.click(tile(photo(0).path));
    fireEvent.click(tile(photo(1).path), { ctrlKey: true });
    expect(work.getByRole("button", { name: `Select ${photo(1).path}` })).toBeTruthy();
  });

  it("zooms the work area with Ctrl+wheel and pinching, and scrolls it with the plain wheel", async () => {
    const onZoomChange = vi.fn();
    const { work, tile } = await browseSort({ onZoomChange, zoom: 1.5 });
    fireEvent.click(tile(photo(0).path));
    fireEvent.click(tile(photo(1).path), { ctrlKey: true });
    const comparison = work.getByRole("group", { name: "Comparison" });
    expect(comparison.style.getPropertyValue("--zoom")).toBe("1.5");
    const view = comparison.closest(".sort-view")!;
    const wheel = (init: WheelEventInit) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
      fireEvent(comparison, event);
      return event.defaultPrevented;
    };
    expect(wheel({ deltaY: 100 })).toBe(false);
    expect(onZoomChange).not.toHaveBeenCalled();
    expect(wheel({ deltaY: -100, ctrlKey: true })).toBe(true);
    expect(onZoomChange.mock.calls[0][0](1)).toBeGreaterThan(1);
    expect(wheel({ deltaY: 100, ctrlKey: true })).toBe(true);
    expect(onZoomChange.mock.calls[1][0](1)).toBeLessThan(1);
    // Spreading two fingers apart to twice their distance doubles the zoom the pinch started at.
    const touches = (distance: number) => ({ touches: [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }] });
    fireEvent.touchStart(view, touches(100));
    fireEvent.touchMove(view, touches(200));
    expect(onZoomChange.mock.lastCall![0](0.5)).toBe(3);
    fireEvent.touchEnd(view, { touches: [] });
    fireEvent.touchMove(view, touches(400));
    expect(onZoomChange).toHaveBeenCalledTimes(3);
  });
  it("copies Selected Photos from the menu and the whole Comparison from the grid without changing selection", async () => {
    const onCopyPhotos = vi.fn(async (paths: string[], target: string) =>
      paths.map((from) => ({ from, to: `${target}/${from.replace(".jpg", " (2).jpg")}` })));
    const { work, tile, onSendPhotos } = await browseSort({ onCopyPhotos });
    fireEvent.click(tile(photo(0).path));
    for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    for (const index of [0, 1]) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
    const copyVia = (source: HTMLElement) => {
      fireEvent.contextMenu(source);
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "kids" }));
    };
    copyVia(work.getByRole("button", { name: `Unselect ${photo(1).path}` }));
    await screen.findByText(/Copied 2 Photos to kids.*photo-0 \(2\)\.jpg.*photo-1 \(2\)\.jpg/);
    expect(onCopyPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path], "kids");
    expect(work.getByRole("button", { name: `Unselect ${photo(0).path}` })).toBeTruthy();
    expect(work.getByRole("button", { name: `Unselect ${photo(1).path}` })).toBeTruthy();
    expect(work.getByRole("button", { name: `Select ${photo(2).path}` })).toBeTruthy();
    copyVia(tile(photo(2).path));
    await screen.findByText(/Copied 3 Photos to kids/);
    expect(onCopyPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path, photo(2).path], "kids");
    expect(tile(photo(0).path)).toBeTruthy();
    expect(onSendPhotos).not.toHaveBeenCalled();
  });

  it("starts app-created copies unreviewed and keeps original and copy states independent", async () => {
    vi.mocked(tauriPhotoPorts.index).mockImplementation(async (_root, paths) => ({
      identities: paths.map((path) => ({ path, status: "ready", hash: "identical" })),
      hashedFiles: 0, hashedBytes: 0, cacheHits: paths.length, elapsedMs: 0,
    }));
    const onCopyPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { tile } = await browseSort({ onCopyPhotos, saved: JSON.stringify({ reviewed: [photo(0).path], folders: {} }) });
    const copy = (path: string) => {
      fireEvent.contextMenu(tile(path));
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "kids" }));
    };
    await waitFor(() => expect(within(tile(photo(0).path)).getByLabelText("Reviewed")).toBeTruthy());
    expect(within(tile(photo(2).path)).queryByLabelText("Reviewed")).toBeNull();
    copy(photo(0).path);
    await screen.findByText(`Copied "${photo(0).path}" to kids.`);
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    await screen.findByText(photo(0).path);
    expect(within(tile(photo(0).path)).queryByLabelText("Reviewed")).toBeNull();
    fireEvent.contextMenu(tile(photo(0).path));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as reviewed" }));
    expect(within(tile(photo(0).path)).getByLabelText("Reviewed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(within(tile(photo(0).path)).getByLabelText("Reviewed")).toBeTruthy();
    copy(photo(1).path);
    await screen.findByText(`Copied "${photo(1).path}" to kids.`);
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    await screen.findByText(photo(1).path);
    expect(within(tile(photo(1).path)).queryByLabelText("Reviewed")).toBeNull();
  });

  it.each(([
    ["grid member", [0, 1, 2]],
    ["grid outsider", [3]],
    ["selected Comparison member", [0, 1]],
    ["unselected Comparison member", [2]],
  ] as const).flatMap(([source, indexes]) => [false, true].map((copyByDefault) => ({ source, indexes, copyByDefault }))))(
    "copies the same batch as moves for a $source (Copy default: $copyByDefault) while retaining the Comparison", async ({ source, indexes, copyByDefault }) => {
    vi.stubGlobal("DragEvent", MouseEvent);
    const onCopyPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile, onSendPhotos } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onCopyPhotos, copyByDefault });
    fireEvent.click(tile(photo(0).path));
    for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    for (const index of [0, 1]) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
    const element = source === "grid member" ? tile(photo(2).path)
      : source === "grid outsider" ? tile(photo(3).path)
        : work.getByRole("button", { name: `${source.startsWith("selected") ? "Unselect" : "Select"} ${photo(source.startsWith("selected") ? 1 : 2).path}` });
    const transfer = photoTransfer();
    const target = screen.getByRole("button", { name: "Open folder kids" });
    fireEvent.dragStart(element, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, altKey: !copyByDefault });
    expect(screen.getByText(`Copy ${indexes.length} ${indexes.length === 1 ? "Photo" : "Photos"}`)).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: transfer, altKey: !copyByDefault });
    await screen.findByText(/^Copied /);
    expect(onCopyPhotos).toHaveBeenCalledWith(indexes.map((index) => photo(index).path), "kids");
    expect(onSendPhotos).not.toHaveBeenCalled();
    expect(work.getByRole("button", { name: `Unselect ${photo(0).path}` })).toBeTruthy();
    expect(work.getByRole("button", { name: `Unselect ${photo(1).path}` })).toBeTruthy();
    expect(work.getByRole("button", { name: `Select ${photo(2).path}` })).toBeTruthy();
  });

  it("Alt-moves a Comparison Photo to a breadcrumb while Copy is the default", async () => {
    const nested = { ...photo(0), path: `kids/${photo(0).path}` };
    const onCopyPhotos = vi.fn(async () => []);
    const { work, tile, onSendPhotos } = await browseSort({ photos: [nested, photo(1)], copyByDefault: true, onCopyPhotos });
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    await screen.findByText(photo(0).path);
    fireEvent.click(tile(photo(0).path));
    const source = (await work.findByRole("img", { name: nested.path })).closest("figure")!;
    const target = screen.getByRole("button", { name: "Library" });
    const transfer = photoTransfer();
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, altKey: true });
    expect(transfer.dropEffect).toBe("move");
    expect(screen.getByText("Move 1 Photo")).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: transfer, altKey: true });
    await waitFor(() => expect(onSendPhotos).toHaveBeenCalledWith([nested.path], ""));
    expect(onCopyPhotos).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "copy", verb: "copies" },
    { operation: "move", verb: "moves" },
  ] as const)("$verb a mixed-source Comparison without changing a skipped Photo's mark", async ({ operation }) => {
    const nested = { ...photo(1), path: `kids/${photo(1).path}` };
    const transfer = vi.fn(async () => [{ from: photo(0).path, to: `kids/${photo(0).path}` }]);
    const { work, tile, lastWrite } = await browseSort({
      photos: [photo(0), nested], onCopyPhotos: transfer, onSendPhotos: transfer,
    });
    fireEvent.click(tile(photo(0).path));
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    fireEvent.click(await screen.findByText(photo(1).path), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.contextMenu(tile(photo(0).path));
    const menu = operation === "copy" ? "Copy to Folder..." : "Move to Folder...";
    fireEvent.click(screen.getByRole("menuitem", { name: menu }));
    fireEvent.click(within(screen.getByRole("menu", { name: menu })).getByRole("menuitem", { name: "kids" }));
    await screen.findByText(operation === "copy" ? /Copied.*Skipped 1 Photo\(s\) already in kids/ : /Moved.*to kids/);
    expect(transfer).toHaveBeenCalledWith([photo(0).path, nested.path], "kids");
    if (operation === "copy") expect(work.getByRole("button", { name: `Select ${photo(1).path}` }).title).toBe(nested.path);
    else expect(work.getByRole("figure", { name: nested.path })).toBeTruthy();
    await waitFor(() => expect(lastWrite()?.reviewed).toEqual(
      operation === "copy" ? [nested.path, photo(0).path].sort() : [nested.path],
    ));
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    expect(within(tile(photo(0).path)).queryByLabelText("Reviewed")).toBeNull();
    expect(within(tile(photo(1).path)).getByLabelText("Reviewed")).toBeTruthy();
  });

  it("offers Show and Comparison actions on right-click in the grid and in the Comparison", async () => {
    const { work, tile } = await browseSort({ photos: [0, 1, 2, 3, 4].map(photo) });
    const menuItems = () => within(screen.getByRole("menu", { name: "Photo actions" })).getAllByRole("menuitem");
    const item = (name: string) => within(screen.getByRole("menu", { name: "Photo actions" })).getByRole("menuitem", { name });

    fireEvent.contextMenu(tile(photo(0).path));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Show", "Add to Comparison", "Move to Folder...", "Copy to Folder...", "Mark as reviewed", "Mark all up to here as reviewed"]);
    expect(item("Move to Folder...").getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(item("Show"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(await work.findByRole("img", { name: photo(0).path })).toBeTruthy();

    fireEvent.contextMenu(tile(photo(1).path));
    fireEvent.click(item("Add to Comparison"));
    expect(work.getByRole("group", { name: "Comparison" })).toBeTruthy();
    fireEvent.contextMenu(tile(photo(1).path));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Show", "Remove from Comparison", "Move to Folder...", "Copy to Folder...", "Mark as unreviewed", "Mark all up to here as reviewed"]);
    fireEvent.keyDown(screen.getByRole("menu", { name: "Photo actions" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.contextMenu(work.getByRole("button", { name: `Select ${photo(1).path}` }));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Select", "Remove from Comparison", "Move to Folder...", "Copy to Folder...", "Mark as unreviewed"]);
    fireEvent.click(item("Select"));
    fireEvent.contextMenu(work.getByRole("button", { name: `Unselect ${photo(1).path}` }));
    fireEvent.click(item("Unselect"));
    fireEvent.contextMenu(work.getByRole("button", { name: `Select ${photo(1).path}` }));
    fireEvent.click(item("Remove from Comparison"));
    expect(work.queryByRole("group", { name: "Comparison" })).toBeNull();

    // A Photo shown on its own always counts as selected, so it can't be unselected.
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Remove from Comparison", "Move to Folder...", "Copy to Folder...", "Mark as unreviewed"]);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    for (const index of [1, 2, 3]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    fireEvent.contextMenu(tile(photo(4).path));
    expect((item("Add to Comparison") as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends a Photo to a nested Folder from the submenu, then shows the next Photo in the grid", async () => {
    const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile } = await browseSort({ onSendPhotos });
    fireEvent.click(tile(photo(0).path));
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
    const folders = within(screen.getByRole("menu", { name: "Move to Folder..." }));
    expect(folders.getAllByRole("menuitem").map((entry) => entry.textContent)).toEqual(["Library", "kids", "New Folder…"]);
    expect(folders.getByRole("menuitem", { name: "Library" }).hasAttribute("disabled")).toBe(true);
    fireEvent.mouseEnter(folders.getByRole("menuitem", { name: "kids" }).parentElement!);
    const kids = within(screen.getByRole("menu", { name: "kids" }));
    expect(kids.getAllByRole("menuitem").map((entry) => entry.textContent)).toEqual(["small", "New Folder…"]);
    fireEvent.click(kids.getByRole("menuitem", { name: "small" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSendPhotos).toHaveBeenCalledWith([photo(0).path], "kids/small");
    expect(await screen.findByText(`Moved "${photo(0).path}" to small.`)).toBeTruthy();
    expect(await work.findByRole("img", { name: photo(1).path })).toBeTruthy();
  });

  it("creates a New Folder from the submenu and moves the Photo into it, rejecting a taken name", async () => {
    const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile, onCreateFolder } = await browseSort({ onSendPhotos });
    fireEvent.click(tile(photo(1).path));
    fireEvent.click(tile(photo(2).path), { ctrlKey: true });
    fireEvent.click(work.getByRole("button", { name: `Select ${photo(2).path}` }));
    fireEvent.contextMenu(work.getByRole("button", { name: `Select ${photo(1).path}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "kids" }).parentElement!);
    fireEvent.click(within(screen.getByRole("menu", { name: "kids" })).getByRole("menuitem", { name: "New Folder…" }));
    const dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
    expect(dialog.getByText(/inside kids/)).toBeTruthy();
    const name = dialog.getByRole("textbox", { name: "Folder name" });
    fireEvent.change(name, { target: { value: "Small" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create and Move" }));
    expect(dialog.getByRole("alert").textContent).toMatch(/already there/);
    expect(onCreateFolder).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: "big" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create and Move" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCreateFolder).toHaveBeenCalledWith("kids", "big");
    expect(onSendPhotos).toHaveBeenCalledWith([photo(1).path], "kids/big");
    await waitFor(() => expect(work.queryByRole("group", { name: "Comparison" })).toBeNull());
    expect(await work.findByRole("img", { name: photo(2).path })).toBeTruthy();
  });

  it("sends the Selected Photos from the Comparison's right-click menu, and the whole Comparison from the grid's", async () => {
    const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile, onCreateFolder } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
    fireEvent.click(tile(photo(0).path));
    for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    for (const index of [0, 1]) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
    const sendVia = (target: HTMLElement, folder: string) => {
      fireEvent.contextMenu(target);
      fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: folder }));
    };
    // Wait for each move to finish, when its tiles leave the grid.
    const settled = (...paths: string[]) => waitFor(() => {
      const grid = within(screen.getByRole("list", { name: "Photos" }));
      for (const path of paths) expect(grid.queryByText(path)).toBeNull();
    });

    sendVia(work.getByRole("button", { name: `Unselect ${photo(1).path}` }), "New Folder…");
    const dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
    expect(dialog.getByText(/moves 2 Photos/)).toBeTruthy();
    fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "best" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create and Move" }));
    await waitFor(() => expect(onSendPhotos).toHaveBeenCalledWith([photo(0).path, photo(1).path], "best"));
    expect(onCreateFolder).toHaveBeenCalledWith("", "best");
    await waitFor(() => expect(work.queryByRole("button", { name: /photo-[01]\.jpg/ })).toBeNull());
    await settled(photo(0).path, photo(1).path);
    expect(screen.getByRole("button", { name: "Open folder best" })).toBeTruthy();

    // A grid Photo outside the Comparison goes on its own.
    sendVia(tile(photo(3).path), "kids");
    await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "kids"));
    await settled(photo(3).path);
    // A grid Photo in the Comparison takes the whole Comparison with it, selected or not.
    fireEvent.click(screen.getByRole("button", { name: "Open folder best" }));
    await screen.findByText(photo(0).path);
    fireEvent.click(tile(photo(0).path), { ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    sendVia(tile(photo(0).path), "kids");
    await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(2).path, `best/${photo(0).path}`], "kids"));
  });

  describe("dragging selected Photos", () => {
    function dragTo(source: HTMLElement, target: HTMLElement) {
      const transfer = photoTransfer();
      fireEvent.dragStart(source, { dataTransfer: transfer });
      fireEvent.dragOver(target, { dataTransfer: transfer });
      fireEvent.drop(target, { dataTransfer: transfer });
      fireEvent.dragEnd(source, { dataTransfer: transfer });
    }
    const settled = (...paths: string[]) => waitFor(() => {
      const grid = within(screen.getByRole("list", { name: "Photos" }));
      for (const path of paths) expect(grid.queryByText(path)).toBeNull();
    });
    const kids = () => screen.getByRole("button", { name: "Open folder kids" });
    /** Ctrl-clicks the first three Photos into a Comparison, then selects the ones at `indexes` there. */
    function compareSelecting(work: ReturnType<typeof within>, tile: (path: string) => HTMLElement, ...indexes: number[]) {
      fireEvent.click(tile(photo(0).path));
      for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
      for (const index of indexes) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
    }

    it("moves the whole Comparison when one of its Photos is dragged from the grid, and any other grid Photo by itself", async () => {
      const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
      const { work, tile } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
      compareSelecting(work, tile, 0);

      dragTo(tile(photo(3).path), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "kids"));
      await settled(photo(3).path);
      dragTo(tile(photo(1).path), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path, photo(2).path], "kids"));
    });

    it("moves the selected Photos when one is dragged from the Comparison, and a Photo shown on its own by itself", async () => {
      const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
      const { work, tile } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
      compareSelecting(work, tile, 0, 1);

      dragTo(work.getByRole("button", { name: `Select ${photo(2).path}` }), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(2).path], "kids"));
      await settled(photo(2).path);
      dragTo(work.getByRole("button", { name: `Unselect ${photo(1).path}` }), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path], "kids"));
      await settled(photo(0).path, photo(1).path);
      fireEvent.click(tile(photo(3).path));
      dragTo((await work.findByRole("img", { name: photo(3).path })).closest("figure")!, kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "kids"));
    });

    it("shows a live drag badge with the batch count for both single and multiple Photos", async () => {
      const { work, tile } = await browseSort();
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      const dragImage = (source: HTMLElement) => {
        fireEvent.dragStart(source, { dataTransfer: { ...photoTransfer(), setDragImage: vi.fn() } });
        const text = document.querySelector(".photo-drag-count")?.textContent;
        fireEvent.dragEnd(source);
        expect(document.querySelector(".photo-drag-count")).toBeNull();
        return text;
      };
      expect(dragImage(tile(photo(1).path))).toBe("2 Photos");
      expect(dragImage(work.getByRole("button", { name: `Select ${photo(0).path}` }))).toBe("1 Photo");
      for (const index of [0, 1]) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
      expect(dragImage(work.getByRole("button", { name: `Unselect ${photo(0).path}` }))).toBe("2 Photos");
      expect(dragImage(tile(photo(2).path))).toBe("1 Photo");
    });

    it("moves only the dragged Photo outside Sort mode, where the selected Photos aren't shown", async () => {
      const { work, tile, onSendPhotos, leaveSort } = await browseSort();
      compareSelecting(work, tile, 0, 1);
      leaveSort();
      const setDragImage = vi.fn();
      const transfer = Object.assign(photoTransfer(), { setDragImage });
      fireEvent.dragStart(tile(photo(1).path), { dataTransfer: transfer });
      expect(document.querySelector(".photo-drag-count")?.textContent).toBe("1 Photo");
      fireEvent.drop(kids(), { dataTransfer: transfer });
      expect(onSendPhotos).toHaveBeenCalledWith([photo(1).path], "kids");
    });

    it("only offers Folders that don't already hold every dragged Photo, including the current Folder", async () => {
      const kept = { ...photo(2), path: "kids/kept.jpg" };
      const { work, tile, onSendPhotos } = await browseSort({ photos: [photo(0), photo(1), kept], folders: ["kids"] });
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      for (const index of [0, 1]) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
      fireEvent.click(kids());
      await screen.findByText("kept.jpg");
      const breadcrumbs = within(screen.getByRole("navigation", { name: "Photo folders" }));
      const library = breadcrumbs.getByRole("button", { name: "Library" });
      const current = breadcrumbs.getByRole("button", { name: "kids" });

      const transfer = photoTransfer();
      const source = work.getByRole("button", { name: `Unselect ${photo(0).path}` });
      fireEvent.dragStart(source, { dataTransfer: transfer });
      expect(library.classList.contains("drop-target")).toBe(false);
      expect(fireEvent.dragOver(library, { dataTransfer: transfer })).toBe(true);
      expect(current.classList.contains("drop-target")).toBe(true);
      fireEvent.dragEnd(source, { dataTransfer: transfer });

      fireEvent.click(tile("kept.jpg"), { ctrlKey: true });
      dragTo(tile("kept.jpg"), library);
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path, kept.path], ""));
    });
  });

  it("updates the grid in place after a move: tiles are busy until it finishes, and the next Photo comes with the settled grid", async () => {
    let finish!: (moves: PhotoMove[]) => void;
    const onSendPhotos = vi.fn(() => new Promise<PhotoMove[]>((resolve) => { finish = resolve; }));
    const { work, tile } = await browseSort({ onSendPhotos });
    const grid = screen.getByRole("list", { name: "Photos" });
    fireEvent.click(tile(photo(0).path));
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));

    expect(tile(photo(0).path).classList.contains("photo-tile--busy")).toBe(true);
    expect(tile(photo(0).path).getAttribute("aria-busy")).toBe("true");
    expect(tile(photo(1).path).classList.contains("photo-tile--busy")).toBe(false);
    expect(work.getByRole("img", { name: photo(0).path }).closest(".sort-photo")!.classList.contains("sort-photo--leaving")).toBe(true);
    expect(work.queryByRole("img", { name: photo(1).path })).toBeNull();

    finish([{ from: photo(0).path, to: `kids/${photo(0).path}` }]);
    expect(await work.findByRole("img", { name: photo(1).path })).toBeTruthy();
    expect(within(grid).queryByText(photo(0).path)).toBeNull();
    expect(tile(photo(1).path).classList.contains("photo-tile--shown")).toBe(true);
    expect(screen.getByRole("list", { name: "Photos" })).toBe(grid);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "scan_photos")).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith("read_photos", { root: "D:\\Photos", paths: [`kids/${photo(0).path}`] });

    // The next move keeps the last message until it is done, so the grid below it doesn't jump.
    fireEvent.dragStart(tile(photo(1).path), { dataTransfer: { effectAllowed: "none", setData: () => {} } });
    fireEvent.contextMenu(tile(photo(1).path));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
    expect(tile(photo(1).path).classList.contains("photo-tile--busy")).toBe(true);
    expect(screen.getByText(`Moved "${photo(0).path}" to kids.`)).toBeTruthy();
    finish([{ from: photo(1).path, to: `kids/${photo(1).path}` }]);
    expect(await screen.findByText(`Moved "${photo(1).path}" to kids.`)).toBeTruthy();

    // The moved Photo is in its new Folder, under its new revision.
    fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
    expect(await screen.findByText(photo(0).path)).toBeTruthy();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("photo_thumbnail", expect.objectContaining({ revision: `moved:kids/${photo(0).path}` })));
  });

  it("puts the tiles and the work area back to normal and shows the error when a move fails", async () => {
    let fail!: (error: Error) => void;
    const onSendPhotos = vi.fn(() => new Promise<PhotoMove[]>((_, reject) => { fail = reject; }));
    const { work, tile } = await browseSort({ onSendPhotos });
    fireEvent.click(tile(photo(0).path));
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
    expect(tile(photo(0).path).classList.contains("photo-tile--busy")).toBe(true);

    fail(new Error("Album locked"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not move.*Album locked/);
    expect(tile(photo(0).path).classList.contains("photo-tile--busy")).toBe(false);
    expect(tile(photo(0).path).hasAttribute("aria-busy")).toBe(false);
    expect(work.getByRole("img", { name: photo(0).path }).closest(".sort-photo")!.classList.contains("sort-photo--leaving")).toBe(false);
  });

  it("doesn't let a scan that was running during a move bring the moved Photo back", async () => {
    const photos = [0, 1, 2].map(photo);
    const moved = { ...photo(0), path: `kids/${photo(0).path}`, revision: "moved" };
    let releaseStale!: () => void;
    let scans = 0;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "scan_photos") {
        scans++;
        if (scans === 2) await new Promise<void>((resolve) => { releaseStale = resolve; });
        return { photos: scans === 3 ? [moved, ...photos.slice(1)] : photos, folders: ["kids"], warnings: [] };
      }
      if (command === "read_photos") return [moved];
      return "data:image/png;base64,dGVzdA==";
    });
    const onSendPhotos = vi.fn(async (): Promise<PhotoMove[]> => [{ from: photo(0).path, to: moved.path }]);
    render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} sort={{ host: sortHost(), active: true, onComparisonChange: () => undefined }} />);
    const grid = within(await screen.findByRole("list", { name: "Photos" }));
    await grid.findByText(photo(0).path);
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await screen.findByText("Scanning Library...");

    fireEvent.contextMenu(grid.getByText(photo(0).path));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
    await screen.findByText(`Moved "${photo(0).path}" to kids.`);
    releaseStale();
    await waitFor(() => expect(scans).toBe(3));
    await waitFor(() => expect(screen.queryByText("Scanning Library...")).toBeNull());
    expect(grid.queryByText(photo(0).path)).toBeNull();
  });

  describe("Reviewed Photos and remembered position", () => {
    const reviewedMark = (tile: HTMLElement) => within(tile).queryByLabelText("Reviewed");
    const menuItems = () => within(screen.getByRole("menu", { name: "Photo actions" })).getAllByRole("menuitem").map((entry) => entry.textContent);
    const choose = (name: string) => fireEvent.click(within(screen.getByRole("menu", { name: "Photo actions" })).getByRole("menuitem", { name }));

    it("marks Photos shown alone or in a Comparison as reviewed, and only Sort mode shows the mark", async () => {
      const { tile, leaveSort, lastWrite } = await browseSort({ photos: [0, 1, 2, 3].map(photo) });
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      fireEvent.click(tile(photo(0).path));
      fireEvent.keyDown(window, { key: "ArrowRight" });
      fireEvent.click(tile(photo(3).path), { ctrlKey: true });
      for (const index of [0, 1, 3]) expect(reviewedMark(tile(photo(index).path))).toBeTruthy();
      expect(reviewedMark(tile(photo(2).path))).toBeNull();
      await waitFor(() => expect(lastWrite()?.reviewed).toEqual([photo(1).path, photo(3).path, photo(0).path].sort()));
      expect(lastWrite()?.folders[""].shown).toBe(photo(3).path);
      leaveSort();
      expect(reviewedMark(tile(photo(1).path))).toBeNull();
    });

    it("marks and unmarks the right-clicked Photo, or the Photos it takes with it in its pane", async () => {
      const { work, tile, lastWrite } = await browseSort({ photos: [0, 1, 2, 3].map(photo) });
      fireEvent.contextMenu(tile(photo(2).path));
      expect(menuItems()).toEqual(["Show", "Add to Comparison", "Move to Folder...", "Copy to Folder...", "Mark as reviewed", "Mark all up to here as reviewed"]);
      choose("Mark as reviewed");
      expect(reviewedMark(tile(photo(2).path))).toBeTruthy();
      fireEvent.contextMenu(tile(photo(2).path));
      choose("Mark as unreviewed");
      expect(reviewedMark(tile(photo(2).path))).toBeNull();

      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      for (const index of [0, 1]) fireEvent.click(work.getByRole("button", { name: `Select ${photo(index).path}` }));
      fireEvent.contextMenu(work.getByRole("button", { name: `Unselect ${photo(0).path}` }));
      expect(menuItems()).toEqual(["Unselect", "Remove from Comparison", "Move to Folder...", "Copy to Folder...", "Mark as unreviewed"]);
      choose("Mark as unreviewed");
      for (const index of [0, 1]) expect(reviewedMark(tile(photo(index).path))).toBeNull();
      // A Photo outside the Comparison acts alone, and the shown Photos stay unmarked until shown again.
      fireEvent.contextMenu(tile(photo(3).path));
      choose("Mark as reviewed");
      expect(reviewedMark(tile(photo(3).path))).toBeTruthy();
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      await waitFor(() => expect(lastWrite()?.reviewed).toEqual([photo(3).path]));
      // An unselected Photo in the Comparison acts alone there, but takes the whole Comparison with it in the grid.
      fireEvent.click(work.getByRole("button", { name: `Unselect ${photo(1).path}` }));
      fireEvent.contextMenu(work.getByRole("button", { name: `Select ${photo(1).path}` }));
      choose("Mark as reviewed");
      expect(reviewedMark(tile(photo(1).path))).toBeTruthy();
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      fireEvent.contextMenu(tile(photo(1).path));
      choose("Mark as reviewed");
      for (const index of [0, 1]) expect(reviewedMark(tile(photo(index).path))).toBeTruthy();
    });

    it("keeps manually unreviewed Comparison members unreviewed until explicitly shown again", async () => {
      const { tile, work } = await browseSort();
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      await waitFor(() => expect(reviewedMark(tile(photo(1).path))).toBeTruthy());
      fireEvent.contextMenu(tile(photo(0).path));
      choose("Mark as unreviewed");

      fireEvent.click(tile(photo(2).path), { ctrlKey: true });
      expect(work.getByRole("group", { name: "Comparison" })).toBeTruthy();
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      expect(reviewedMark(tile(photo(1).path))).toBeNull();
      expect(reviewedMark(tile(photo(2).path))).toBeTruthy();
      fireEvent.click(tile(photo(2).path), { ctrlKey: true });
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      expect(reviewedMark(tile(photo(1).path))).toBeNull();

      fireEvent.click(tile(photo(0).path));
      expect(reviewedMark(tile(photo(0).path))).toBeTruthy();
      expect(reviewedMark(tile(photo(1).path))).toBeNull();
    });

    it("confirms a Folder reset without changing the Comparison or remembered position", async () => {
      const { tile, work, lastWrite, leaveSort } = await browseSort();
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      await waitFor(() => expect(reviewedMark(tile(photo(1).path))).toBeTruthy());
      const grid = screen.getByLabelText("Photo grid");
      fireEvent.scroll(grid, { target: { scrollTop: 64 } });
      await waitFor(() => expect(lastWrite()?.folders[""]).toEqual({ scrollTop: 64, shown: photo(1).path }));

      fireEvent.click(screen.getByRole("button", { name: "Mark all unreviewed" }));
      let dialog = within(screen.getByRole("dialog", { name: "Mark all unreviewed" }));
      expect(dialog.getByText(/Library.*direct.*subfolders/i)).toBeTruthy();
      fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
      expect(reviewedMark(tile(photo(0).path))).toBeTruthy();
      expect(reviewedMark(tile(photo(1).path))).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Mark all unreviewed" }));
      dialog = within(screen.getByRole("dialog", { name: "Mark all unreviewed" }));
      fireEvent.click(dialog.getByRole("button", { name: "Mark all unreviewed" }));
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      expect(reviewedMark(tile(photo(1).path))).toBeNull();
      expect(work.getByRole("group", { name: "Comparison" })).toBeTruthy();
      expect(grid.scrollTop).toBe(64);
      await waitFor(() => expect(lastWrite()?.reviewed).toEqual([]));
      expect(lastWrite()?.folders[""]).toEqual({ scrollTop: 64, shown: photo(1).path });

      fireEvent.click(tile(photo(2).path), { ctrlKey: true });
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      expect(reviewedMark(tile(photo(1).path))).toBeNull();
      expect(reviewedMark(tile(photo(2).path))).toBeTruthy();
      fireEvent.click(tile(photo(2).path), { ctrlKey: true });
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
      leaveSort();
      expect(screen.queryByRole("button", { name: "Mark all unreviewed" })).toBeNull();
    });

    it("resets filtered and unreadable direct Photos while retaining subfolder marks", async () => {
      const used = photo(0);
      const unused = photo(1);
      const nested = { ...photo(2), path: "kids/nested.jpg" };
      const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1"), "page-1", "slot-1", used);
      const saved = JSON.stringify({ reviewed: [used.path, unused.path, "unreadable.jpg", nested.path], folders: {} });
      const { tile, lastWrite } = await browseSort({
        photos: [used, unused, nested], folders: ["kids"], album, saved, warnings: ["unreadable.jpg: could not read"],
      });
      await waitFor(() => expect(reviewedMark(tile(unused.path))).toBeTruthy());
      fireEvent.scroll(screen.getByLabelText("Photo grid"), { target: { scrollTop: 1 } });
      await waitFor(() => expect(lastWrite()?.reviewed).toEqual(["kids/nested.jpg", used.path, unused.path, "unreadable.jpg"].sort()));

      fireEvent.click(screen.getByRole("switch", { name: "All" }));
      expect(screen.queryByText(used.path)).toBeNull();
      expect(reviewedMark(tile(unused.path))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Mark all unreviewed" }));
      const dialog = within(screen.getByRole("dialog", { name: "Mark all unreviewed" }));
      expect(dialog.getByText(/hidden by filters or absent from the scan/i)).toBeTruthy();
      fireEvent.click(dialog.getByRole("button", { name: "Mark all unreviewed" }));
      await waitFor(() => expect(lastWrite()?.reviewed).toEqual(["kids/nested.jpg"]));
      expect(reviewedMark(tile(unused.path))).toBeNull();
      fireEvent.click(screen.getByRole("switch", { name: "Unused" }));
      expect(reviewedMark(tile(used.path))).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
      expect(reviewedMark(tile("nested.jpg"))).toBeTruthy();
      expect(screen.getByText("1 scan warning(s)")).toBeTruthy();
    });

    it.each(["load", "save"] as const)("keeps progress %s errors visible when resetting", async (failure) => {
      vi.mocked(invoke).mockImplementation(async (command) => {
        if (command === "scan_photos") return { photos: [photo(0)], folders: [], warnings: [] };
        if (command === "read_sort_progress") {
          if (failure === "load") throw new Error("Read denied");
          return JSON.stringify({ reviewed: [photo(0).path], folders: {} });
        }
        if (command === "write_sort_progress") throw new Error("Write denied");
        return "data:image/png;base64,dGVzdA==";
      });
      render(<PhotoBrowser root="D:\\Photos" sort={{ host: sortHost(), active: true, onComparisonChange: () => undefined }} />);
      await screen.findByText(photo(0).path);
      if (failure === "load") {
        expect((await screen.findByRole("alert")).textContent).toContain("Could not load which Photos are reviewed: Error: Read denied");
        expect((screen.getByRole("button", { name: "Mark all unreviewed" }) as HTMLButtonElement).disabled).toBe(true);
        expect(invoke).not.toHaveBeenCalledWith("write_sort_progress", expect.anything());
      } else {
        await waitFor(() => expect((screen.getByRole("button", { name: "Mark all unreviewed" }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Mark all unreviewed" }));
        fireEvent.click(within(screen.getByRole("dialog", { name: "Mark all unreviewed" })).getByRole("button", { name: "Mark all unreviewed" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Could not save which Photos are reviewed: Error: Write denied");
      }
    });

    it.each((["album", "sort"] as const).flatMap((mode) => ["move", "copy"].map((operation) => ({ mode, operation }))))(
      "preserves marks after failed $operation batches in $mode mode and reports rollback failures", async ({ mode, operation }) => {
        const writes: Array<{ reviewed: string[] }> = [];
        vi.mocked(invoke).mockImplementation(async (command, args) => {
          if (command === "scan_photos") return { photos: [photo(0)], folders: ["kids"], warnings: [] };
          if (command === "read_sort_progress") return JSON.stringify({ reviewed: [photo(0).path], folders: {} });
          if (command === "write_sort_progress") return void writes.push(JSON.parse((args as { json: string }).json));
          return "data:image/png;base64,dGVzdA==";
        });
        let attempts = 0;
        const transfer = vi.fn(async () => {
          throw new Error(++attempts === 1 ? "Transfer failed and was rolled back" : "Transfer failed; rollback failed to restore a Photo");
        });
        const host = sortHost();
        const onComparisonChange = () => undefined;
        const props = { root: "D:\\Photos", onSendPhotos: transfer, onCopyPhotos: transfer };
        const view = render(<PhotoBrowser {...props} mode={mode} sort={{ host, active: mode === "sort", onComparisonChange }} />);
        const tile = () => within(screen.getByRole("list", { name: "Photos" })).getByText(photo(0).path).closest("figure")!;
        await screen.findByText(photo(0).path);
        const menu = operation === "copy" ? "Copy to Folder..." : "Move to Folder...";
        for (const message of ["Transfer failed and was rolled back", "rollback failed to restore a Photo"]) {
          fireEvent.contextMenu(tile());
          fireEvent.click(screen.getByRole("menuitem", { name: menu }));
          fireEvent.click(within(screen.getByRole("menu", { name: menu })).getByRole("menuitem", { name: "kids" }));
          await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(message));
        }
        view.rerender(<PhotoBrowser {...props} mode="sort" sort={{ host, active: true, onComparisonChange }} />);
        await waitFor(() => expect(reviewedMark(tile())).toBeTruthy());
        fireEvent.scroll(screen.getByLabelText("Photo grid"), { target: { scrollTop: 1 } });
        await waitFor(() => expect(writes.at(-1)?.reviewed).toEqual([photo(0).path]));
      },
    );

    it("does not review a replacement Photo until it is shown in Sort mode", async () => {
      const photos = [photo(0), photo(1)];
      const writes: Array<{ reviewed: string[] }> = [];
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "scan_photos") return { photos, folders: ["kids"], warnings: [] };
        if (command === "read_photos") return movedRecords(photos, (args as { paths: string[] }).paths);
        if (command === "read_sort_progress") return null;
        if (command === "write_sort_progress") return void writes.push(JSON.parse((args as { json: string }).json));
        return "data:image/png;base64,dGVzdA==";
      });
      const onSendPhotos = vi.fn(async () => [{ from: photos[0].path, to: `kids/${photos[0].path}` }]);
      const host = sortHost();
      const onComparisonChange = () => undefined;
      const props = { root: "D:\\Photos", onSendPhotos };
      const view = render(<PhotoBrowser {...props} mode="sort" sort={{ host, active: true, onComparisonChange }} />);
      fireEvent.click((await screen.findByText(photos[0].path)).closest("figure")!);
      await within(host).findByRole("img", { name: photos[0].path });
      view.rerender(<PhotoBrowser {...props} mode="album" sort={{ host, active: false, onComparisonChange }} />);
      fireEvent.contextMenu(within(screen.getByRole("list", { name: "Photos" })).getByText(photos[0].path).closest("figure")!);
      fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
      await screen.findByText(`Moved "${photos[0].path}" to kids.`);
      await waitFor(() => expect(writes.at(-1)?.reviewed).toEqual([]));

      view.rerender(<PhotoBrowser {...props} mode="sort" sort={{ host, active: true, onComparisonChange }} />);
      await within(host).findByRole("img", { name: photos[1].path });
      await waitFor(() => expect(reviewedMark(within(screen.getByRole("list", { name: "Photos" }))
        .getByText(photos[1].path).closest("figure")!)).toBeTruthy());
    });

    it("marks a grid tile and every Photo before it", async () => {
      const { tile } = await browseSort({ photos: [0, 1, 2, 3].map(photo) });
      fireEvent.contextMenu(tile(photo(2).path));
      choose("Mark all up to here as reviewed");
      expect([0, 1, 2, 3].map((index) => reviewedMark(tile(photo(index).path)) !== null)).toEqual([true, true, true, false]);
    });

    it("starts a Photo moved to another Folder unreviewed", async () => {
      const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
      const { tile, lastWrite } = await browseSort({ onSendPhotos });
      fireEvent.click(tile(photo(0).path));
      fireEvent.contextMenu(tile(photo(0).path));
      fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
      await screen.findByText(`Moved "${photo(0).path}" to kids.`);
      await waitFor(() => expect(lastWrite()?.reviewed).toEqual([photo(1).path]));
      fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
      expect(reviewedMark(tile(photo(0).path))).toBeNull();
    });

    it("restores each Folder's scroll position and last shown Photo, keeping a Comparison", async () => {
      const photos = [...Array.from({ length: 60 }, (_, index) => photo(index)), { ...photo(60), path: "kids/a.jpg" }, { ...photo(61), path: "kids/b.jpg" }];
      const saved = JSON.stringify({
        reviewed: [photo(1).path],
        folders: { "": { scrollTop: 3200, shown: photo(41).path }, kids: { scrollTop: 0, shown: "kids/b.jpg" } },
      });
      const { work, tile, lastWrite } = await browseSort({ photos, folders: ["kids"], saved });
      const grid = screen.getByLabelText("Photo grid");
      expect(await work.findByRole("img", { name: photo(41).path })).toBeTruthy();
      expect(grid.scrollTop).toBe(3200);
      expect(tile(photo(41).path)).toBeTruthy();

      fireEvent.scroll(grid, { target: { scrollTop: 1600 } });
      fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
      expect(await work.findByRole("img", { name: "kids/b.jpg" })).toBeTruthy();
      fireEvent.click(tile("a.jpg"), { ctrlKey: true });
      fireEvent.click(screen.getByRole("button", { name: "Library" }));
      expect(screen.getByLabelText("Photo grid").scrollTop).toBe(1600);
      // A Comparison is kept rather than replaced by the Folder's last shown Photo.
      expect(work.getByRole("group", { name: "Comparison" })).toBeTruthy();
      await waitFor(() => expect(lastWrite()?.folders[""]).toEqual({ scrollTop: 1600, shown: photo(41).path }));
      expect(lastWrite()?.folders.kids.shown).toBe("kids/a.jpg");
    });

    it("marks a remembered Photo reviewed when reopening its Folder even if it is still shown", async () => {
      const nested = { ...photo(1), path: "kids/a.jpg" };
      const saved = JSON.stringify({ reviewed: [], folders: { kids: { scrollTop: 0, shown: nested.path } } });
      const { work, tile } = await browseSort({ photos: [photo(0), nested], folders: ["kids"], saved });
      fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
      await work.findByRole("img", { name: nested.path });
      expect(reviewedMark(tile("a.jpg"))).toBeTruthy();
      fireEvent.contextMenu(tile("a.jpg"));
      choose("Mark as unreviewed");
      expect(reviewedMark(tile("a.jpg"))).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Library" }));
      expect(work.getByRole("img", { name: nested.path })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Open folder kids" }));
      await waitFor(() => expect(reviewedMark(tile("a.jpg"))).toBeTruthy());
    });

    it.each([
      { renameMode: "sort", nestedShown: false },
      { renameMode: "album", nestedShown: false },
      { renameMode: "album", nestedShown: true },
    ] as const)("preserves marks and remembered positions when renaming in $renameMode mode (nested: $nestedShown)", async ({ renameMode, nestedShown }) => {
      const rootPhoto = photo(0);
      const first = { ...photo(1), path: "kids/a.jpg" };
      const nested = { ...photo(2), path: "kids/deep/b.jpg" };
      const saved = JSON.stringify({
        reviewed: [nested.path],
        folders: { kids: { scrollTop: 20, shown: first.path }, "kids/deep": { scrollTop: 90, shown: nested.path } },
      });
      const writes: Array<{ reviewed: string[]; folders: Record<string, { scrollTop: number; shown: string | null }> }> = [];
      let renamed = false;
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "scan_photos") return renamed
          ? { photos: [rootPhoto, { ...first, path: "children/a.jpg" }, { ...nested, path: "children/deep/b.jpg" }], folders: ["children", "children/deep"], warnings: [] }
          : { photos: [rootPhoto, first, nested], folders: ["kids", "kids/deep"], warnings: [] };
        if (command === "read_sort_progress") return saved;
        if (command === "write_sort_progress") return void writes.push(JSON.parse((args as { json: string }).json));
        return "data:image/png;base64,dGVzdA==";
      });
      const onRenameFolder = vi.fn(async () => { renamed = true; return "children"; });
      const host = sortHost();
      const onComparisonChange = () => undefined;
      const view = render(<PhotoBrowser root="D:\\Photos" mode="sort" onRenameFolder={onRenameFolder}
        sort={{ host, active: true, onComparisonChange }} />);
      fireEvent.click(await screen.findByRole("button", { name: "Open folder kids" }));
      if (nestedShown) fireEvent.click(await screen.findByRole("button", { name: "Open folder deep" }));
      const shownName = nestedShown ? "b.jpg" : "a.jpg";
      await within(host).findByRole("img", { name: nestedShown ? nested.path : first.path });
      fireEvent.contextMenu(within(screen.getByRole("list", { name: "Photos" })).getByText(shownName).closest("figure")!);
      choose("Mark as unreviewed");
      if (renameMode === "sort") fireEvent.click(screen.getByRole("button", { name: "Library" }));
      else view.rerender(<PhotoBrowser root="D:\\Photos" mode="album" onRenameFolder={onRenameFolder}
        sort={{ host, active: false, onComparisonChange }} />);

      fireEvent.contextMenu(screen.getByRole("button", { name: "Open folder kids" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
      const dialog = within(screen.getByRole("dialog", { name: "Rename Folder" }));
      fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "children" } });
      fireEvent.click(dialog.getByRole("button", { name: "Rename" }));
      fireEvent.click(dialog.getByRole("button", { name: "Rename" }));
      await within(host).findByRole("img", { name: nestedShown ? "children/deep/b.jpg" : "children/a.jpg" });
      if (renameMode === "album") {
        view.rerender(<PhotoBrowser root="D:\\Photos" mode="sort" onRenameFolder={onRenameFolder}
          sort={{ host, active: true, onComparisonChange }} />);
        expect(reviewedMark(within(screen.getByRole("list", { name: "Photos" })).getByText(shownName).closest("figure")!)).toBeNull();
      }
      await waitFor(() => expect(writes.at(-1)?.reviewed).toEqual([nestedShown ? "children/a.jpg" : "children/deep/b.jpg"]));
      expect(writes.at(-1)?.folders.children).toEqual({ scrollTop: 20, shown: "children/a.jpg" });
      expect(writes.at(-1)?.folders["children/deep"]).toEqual({ scrollTop: 90, shown: "children/deep/b.jpg" });
    });

    it("clears marks on Photos moved by dragging before Sort mode was first opened", async () => {
      const writes: string[] = [];
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "scan_photos") return { photos: [photo(0)], folders: ["kids"], warnings: [] };
        if (command === "read_photos") return movedRecords([photo(0)], (args as { paths: string[] }).paths);
        if (command === "read_sort_progress") return JSON.stringify({ reviewed: [photo(0).path], folders: {} });
        if (command === "write_sort_progress") return void writes.push((args as { json: string }).json);
        return "data:image/png;base64,dGVzdA==";
      });
      const onSendPhotos = vi.fn(async (): Promise<PhotoMove[]> => [{ from: photo(0).path, to: `kids/${photo(0).path}` }]);
      render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} />);
      const tile = (await screen.findByText(photo(0).path)).closest("figure")!;
      expect(invoke).not.toHaveBeenCalledWith("read_sort_progress", expect.anything());
      const transfer = photoTransfer();
      fireEvent.dragStart(tile, { dataTransfer: transfer });
      const folder = screen.getByRole("button", { name: "Open folder kids" });
      fireEvent.dragOver(folder, { dataTransfer: transfer });
      fireEvent.drop(folder, { dataTransfer: transfer });
      await waitFor(() => expect(writes.length).toBeGreaterThan(0));
      expect(JSON.parse(writes.at(-1)!).reviewed).toEqual([]);
    });

    it("starts a copy into a New Folder unreviewed before Sort mode was first opened", async () => {
      const original = photo(0);
      const copyPath = `best/${original.path}`;
      const writes: Array<{ reviewed: string[] }> = [];
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "scan_photos") return { photos: [original], folders: [], warnings: [] };
        if (command === "read_photos") return movedRecords([original], (args as { paths: string[] }).paths);
        if (command === "read_sort_progress") return JSON.stringify({ reviewed: [original.path, copyPath], folders: {} });
        if (command === "write_sort_progress") return void writes.push(JSON.parse((args as { json: string }).json));
        return "data:image/png;base64,dGVzdA==";
      });
      const onCreateFolder = vi.fn(async (_parent: string, name: string) => name);
      const onCopyPhotos = vi.fn(async () => [{ from: original.path, to: copyPath }]);
      const host = sortHost();
      const onComparisonChange = () => undefined;
      const props = { root: "D:\\Photos", onCreateFolder, onCopyPhotos };
      const view = render(<PhotoBrowser {...props} mode="album" sort={{ host, active: false, onComparisonChange }} />);
      fireEvent.contextMenu((await screen.findByText(original.path)).closest("figure")!);
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Copy to Folder..." })).getByRole("menuitem", { name: "New Folder…" }));
      const dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
      fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "best" } });
      fireEvent.click(dialog.getByRole("button", { name: "Create and Copy" }));
      await waitFor(() => expect(writes.at(-1)?.reviewed).toEqual([original.path]));

      view.rerender(<PhotoBrowser {...props} mode="sort" sort={{ host, active: true, onComparisonChange }} />);
      await waitFor(() => expect(reviewedMark(within(screen.getByRole("list", { name: "Photos" })).getByText(original.path).closest("figure")!)).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Open folder best" }));
      expect(reviewedMark(within(screen.getByRole("list", { name: "Photos" })).getByText(original.path).closest("figure")!)).toBeNull();
    });

    it("restores the new Library's last shown Photo after switching Library in Sort mode", async () => {
      const second = { ...photo(7), path: "other.jpg" };
      const [first, other] = ["D:\\Photos", "E:\\Other"];
      let finishScan!: () => void;
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        const root = (args as { root?: string } | undefined)?.root;
        if (command === "scan_photos") {
          if (root === first) return { photos: [photo(0)], folders: [], warnings: [] };
          await new Promise<void>((resolve) => { finishScan = resolve; });
          return { photos: [second], folders: [], warnings: [] };
        }
        if (command === "read_sort_progress") {
          return root === first ? null : JSON.stringify({ reviewed: [], folders: { "": { scrollTop: 0, shown: second.path } } });
        }
        return "data:image/png;base64,dGVzdA==";
      });
      const host = sortHost();
      const sort = { host, active: true, onComparisonChange: () => undefined };
      const view = render(<PhotoBrowser root={first} sort={sort} />);
      await screen.findByText(photo(0).path);
      view.rerender(<PhotoBrowser root={other} sort={sort} />);
      await waitFor(() => expect(invoke).toHaveBeenCalledWith("read_sort_progress", { root: other }));
      await waitFor(() => expect(finishScan).toBeDefined());
      finishScan();
      expect(await within(host).findByRole("img", { name: second.path })).toBeTruthy();
    });

    it("reviews a Photo shared by path with the previous Library only after the new scan", async () => {
      const [first, other] = ["D:\\Photos", "E:\\Other"];
      const shared = photo(0);
      const oldOnly = photo(1);
      const writes: Array<{ root: string; reviewed: string[] }> = [];
      let finishScan!: () => void;
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        const { root } = (args ?? {}) as { root: string };
        if (command === "scan_photos") {
          if (root === first) return { photos: [shared, oldOnly], folders: [], warnings: [] };
          await new Promise<void>((resolve) => { finishScan = resolve; });
          return { photos: [shared], folders: [], warnings: [] };
        }
        if (command === "read_sort_progress") return null;
        if (command === "write_sort_progress") {
          writes.push({ root, reviewed: JSON.parse((args as { json: string }).json).reviewed });
          return undefined;
        }
        return "data:image/png;base64,dGVzdA==";
      });
      const host = sortHost();
      const sort = { host, active: true, onComparisonChange: () => undefined };
      const view = render(<PhotoBrowser root={first} sort={sort} />);
      const grid = within(await screen.findByRole("list", { name: "Photos" }));
      fireEvent.click(await grid.findByText(shared.path));
      fireEvent.click(grid.getByText(oldOnly.path), { ctrlKey: true });
      expect(await within(host).findByRole("group", { name: "Comparison" })).toBeTruthy();
      view.rerender(<PhotoBrowser root={other} sort={sort} />);
      await waitFor(() => expect(invoke).toHaveBeenCalledWith("read_sort_progress", { root: other }));
      await waitFor(() => expect(finishScan).toBeDefined());
      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(writes.filter((write) => write.root === other)).toEqual([]);
      finishScan();
      expect(await within(host).findByRole("img", { name: shared.path })).toBeTruthy();
      await waitFor(() => expect(writes.filter((write) => write.root === other).at(-1)?.reviewed).toEqual([shared.path]));
    });

    it("keeps a moved Photo unreviewed when its new record can't be read until the next scan", async () => {
      const photos = [0, 1].map(photo);
      const moved = { ...photo(0), path: `kids/${photo(0).path}`, revision: "moved" };
      let scans = 0;
      const writes: string[] = [];
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "scan_photos") return { photos: ++scans > 1 ? [moved, photos[1]] : photos, folders: ["kids"], warnings: [] };
        if (command === "read_photos") throw new Error("Photo is locked");
        if (command === "read_sort_progress") return JSON.stringify({ reviewed: [photo(0).path], folders: {} });
        if (command === "write_sort_progress") return void writes.push((args as { json: string }).json);
        return "data:image/png;base64,dGVzdA==";
      });
      const onSendPhotos = vi.fn(async (): Promise<PhotoMove[]> => [{ from: photo(0).path, to: moved.path }]);
      render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} sort={{ host: sortHost(), active: true, onComparisonChange: () => undefined }} />);
      const grid = within(await screen.findByRole("list", { name: "Photos" }));
      fireEvent.contextMenu(await grid.findByText(photo(0).path));
      fireEvent.click(screen.getByRole("menuitem", { name: "Move to Folder..." }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Move to Folder..." })).getByRole("menuitem", { name: "kids" }));
      await screen.findByText(`Moved "${photo(0).path}" to kids.`);
      await waitFor(() => expect(scans).toBe(2));
      await waitFor(() => expect(screen.queryByText("Scanning Library...")).toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(JSON.parse(writes.at(-1)!).reviewed).toEqual([]);
    });
  });
});

describe("Folder history and Folder interactions", () => {
  const library = { photos: [{ ...photo(0), path: "trips/kids/a.jpg" }], folders: ["trips", "trips/kids", "pets", ".hidden"], warnings: [] };

  function mockLibrary(scans: (typeof library)[] = [library], exists: (folder: string) => boolean = () => true) {
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "scan_photos") return scans.length > 1 ? scans.shift() : scans[0];
      if (command === "folder_exists") return exists((args as { folder: string }).folder);
      return "data:image/png;base64,dGVzdA==";
    });
  }

  const nav = () => within(screen.getByRole("navigation", { name: "Photo folders" }));
  const current = () => nav().getAllByRole("button").find((button) => button.getAttribute("aria-current") === "page")!.textContent;
  const back = () => screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;
  const forward = () => screen.getByRole("button", { name: "Forward" }) as HTMLButtonElement;
  const open = async (name: string) => fireEvent.click(await screen.findByRole("button", { name: `Open folder ${name}` }));

  it("keeps a separate current Folder and back/forward history for Album mode and Sort mode", async () => {
    mockLibrary();
    const view = render(<PhotoBrowser root="D:\\Photos" mode="album" />);
    await screen.findByRole("button", { name: "Open folder trips" });
    expect(back().disabled).toBe(true);
    expect(forward().disabled).toBe(true);
    await open("trips");
    await open("kids");
    fireEvent.click(nav().getByRole("button", { name: "kids" }));
    fireEvent.click(back());
    expect(current()).toBe("trips");
    expect(forward().disabled).toBe(false);

    view.rerender(<PhotoBrowser root="D:\\Photos" mode="sort" />);
    expect(current()).toBe("Library");
    expect(back().disabled).toBe(true);
    await open("pets");
    expect(back().disabled).toBe(false);

    view.rerender(<PhotoBrowser root="D:\\Photos" mode="album" />);
    expect(current()).toBe("trips");
    fireEvent.click(forward());
    expect(current()).toBe("kids");
    fireEvent.click(back());
    fireEvent.click(back());
    expect(current()).toBe("Library");
    expect(back().disabled).toBe(true);
  });

  it("goes back and forward with Alt+arrows and the mouse buttons only while the Photo pane is visible", async () => {
    mockLibrary();
    const view = render(<PhotoBrowser root="D:\\Photos" />);
    await open("trips");
    await open("kids");
    expect(fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true })).toBe(false);
    expect(current()).toBe("trips");
    expect(fireEvent.mouseUp(window, { button: 3 })).toBe(false);
    expect(current()).toBe("Library");
    expect(fireEvent.mouseUp(window, { button: 4 })).toBe(false);
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    expect(current()).toBe("kids");

    view.rerender(<PhotoBrowser root="D:\\Photos" visible={false} />);
    fireEvent.mouseUp(window, { button: 3 });
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    expect(current()).toBe("kids");
  });

  it("rescans and falls back without an error when Back reaches a Folder that no longer exists", async () => {
    mockLibrary([library, { ...library, photos: [], folders: ["trips", "pets"] }], (folder) => folder !== "trips/kids");
    render(<PhotoBrowser root="D:\\Photos" />);
    await open("trips");
    await open("kids");
    fireEvent.click(nav().getByRole("button", { name: "Library" }));
    fireEvent.click(back());
    expect(await screen.findByText(/trips\/kids.*no longer available/)).toBeTruthy();
    expect(current()).toBe("trips");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(back());
    expect(current()).toBe("trips");
    fireEvent.click(back());
    expect(current()).toBe("Library");
  });

  it("creates a New Folder in the current Folder from the header and from empty grid space", async () => {
    mockLibrary();
    const onCreateFolder = vi.fn(async (parent: string, name: string) => parent ? `${parent}/${name}` : name);
    render(<PhotoBrowser root="D:\\Photos" onCreateFolder={onCreateFolder} />);
    await open("trips");
    fireEvent.click(screen.getByRole("button", { name: "New Folder…" }));
    let dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "Kids" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create" }));
    expect(dialog.getByRole("alert").textContent).toMatch(/already there/);
    fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "summer" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCreateFolder).toHaveBeenCalledWith("trips", "summer");

    fireEvent.click(nav().getByRole("button", { name: "Library" }));
    fireEvent.contextMenu(screen.getByRole("list", { name: "Photos" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New Folder…" }));
    dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "winter" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreateFolder).toHaveBeenLastCalledWith("", "winter"));
  });

  it("renames a Folder after confirmation, and every mode's history follows it", async () => {
    const renamed = { photos: [{ ...photo(0), path: "trips/children/a.jpg" }], folders: ["trips", "trips/children", "pets", ".hidden"], warnings: [] };
    mockLibrary([library, renamed]);
    const onRenameFolder = vi.fn(async (folder: string, name: string) => `${folder.slice(0, folder.lastIndexOf("/"))}/${name}`);
    const props = { root: "D:\\Photos", onRenameFolder };
    const view = render(<PhotoBrowser {...props} mode="sort" />);
    await open("trips");
    await open("kids");
    view.rerender(<PhotoBrowser {...props} mode="album" />);
    await open("pets");
    fireEvent.click(back());
    await open("trips");
    expect(back().disabled).toBe(false);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Open folder kids" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
    const dialog = within(screen.getByRole("dialog", { name: "Rename Folder" }));
    const name = dialog.getByRole("textbox", { name: "Folder name" }) as HTMLInputElement;
    expect(name.value).toBe("kids");
    fireEvent.change(name, { target: { value: "children" } });
    fireEvent.click(dialog.getByRole("button", { name: "Rename" }));
    expect(dialog.getByText(/Rename "kids" to "children"\?/)).toBeTruthy();
    expect(onRenameFolder).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onRenameFolder).toHaveBeenCalledWith("trips/kids", "children");
    await screen.findByRole("button", { name: "Open folder children" });
    // Album mode never visited kids, so its history stays; Sort mode's is cleared and follows the rename.
    expect(current()).toBe("trips");
    expect(back().disabled).toBe(false);
    view.rerender(<PhotoBrowser {...props} mode="sort" />);
    expect(current()).toBe("children");
    expect(back().disabled).toBe(true);
    expect(screen.getByText("a.jpg")).toBeTruthy();
  });

  it("never renames the Library root or a protected Folder", async () => {
    mockLibrary();
    render(<PhotoBrowser root="D:\\Photos" onRenameFolder={vi.fn()} />);
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Open folder .hidden" }));
    expect((screen.getByRole("menuitem", { name: "Rename…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.contextMenu(nav().getByRole("button", { name: "Library" }));
    expect(screen.queryByRole("menuitem", { name: "Rename…" })).toBeNull();
  });
});
