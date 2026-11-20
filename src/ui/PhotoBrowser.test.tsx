// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { addPhotoSlot, createAlbum, duplicatePage, placePhoto, type Album, type PhotoMove } from "../core";
import PhotoBrowser from "./PhotoBrowser";
import { hasPhotoDrag, readPhotoDrag } from "./photoDrag";
import { tauriPhotoPorts } from "./tauriPhotoPorts";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
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
  expect(folders.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["pets", "trips"]);
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
  it("scrolls the Folder area and the grid while a Photo is dragged near their top or bottom edge", async () => {
    // jsdom has no DragEvent, so dragover would lose its pointer position.
    vi.stubGlobal("DragEvent", MouseEvent);
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "scan_photos") return { photos: Array.from({ length: 40 }, (_, index) => photo(index)), folders: ["a", "b", "c", "d", "e"], warnings: [] };
      return "data:image/png;base64,dGVzdA==";
    });
    render(<PhotoBrowser root="D:\\Photos" onSendPhotos={vi.fn(async () => [])} />);
    const tile = (await screen.findByText(photo(0).path)).closest("figure")!;
    const transfer = photoTransfer();
    fireEvent.dragStart(tile, { dataTransfer: transfer });
    const placed = (element: HTMLElement, top: number, bottom: number) => {
      element.getBoundingClientRect = () => new DOMRect(0, top, 340, bottom - top);
      return element;
    };
    const area = placed(screen.getByRole("list", { name: "Folders" }), 100, 260);
    const grid = placed(screen.getByLabelText("Photo grid"), 270, 870);
    const hover = (element: HTMLElement, clientY: number) => fireEvent.dragOver(element, { dataTransfer: transfer, clientY });

    hover(area, 180);
    hover(grid, 570);
    expect([area.scrollTop, grid.scrollTop]).toEqual([0, 0]);
    hover(screen.getByRole("button", { name: "Open folder e" }), 258);
    expect(area.scrollTop).toBeGreaterThan(0);
    hover(tile, 868);
    expect(grid.scrollTop).toBeGreaterThan(0);
    const scrolled = [area.scrollTop, grid.scrollTop];
    hover(area, 102);
    hover(grid, 272);
    expect(area.scrollTop).toBeLessThan(scrolled[0]);
    expect(grid.scrollTop).toBeLessThan(scrolled[1]);
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
  expect(folder.classList.contains("drop-target")).toBe(true);
  const layoutDrag = { types: ["application/x-phalbummakr-layout"], getData: () => "layout-1", dropEffect: "none" };
  expect(fireEvent.dragOver(folder, { dataTransfer: layoutDrag })).toBe(true);
  fireEvent.drop(folder, { dataTransfer: layoutDrag });
  expect(onSendPhotos).not.toHaveBeenCalled();
  // Browsers send no mouse moves during a drag, so the first one means it ended.
  fireEvent.mouseMove(window);
  expect(folder.classList.contains("drop-target")).toBe(false);
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
    onSendPhotos = vi.fn(async (): Promise<PhotoMove[]> => []), onCreateFolder = vi.fn(async (parent: string, name: string) => parent ? `${parent}/${name}` : name) } = {}) {
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "scan_photos") return { photos, folders, warnings: [] };
      if (command === "read_photos") return movedRecords(photos, (args as { paths: string[] }).paths);
      return `data:image/png;base64,${String(command)}`;
    });
    const host = sortHost();
    const onChosenChange = vi.fn();
    const props = { root: "D:\\Photos", album, onSendPhotos, onCreateFolder };
    const view = render(<PhotoBrowser {...props} sort={{ host, active: true, onChosenChange }} />);
    await screen.findByText(photos[0].path);
    const tile = (path: string) => within(screen.getByRole("list", { name: "Photos" })).getByText(path).closest("figure")!;
    const rerunCommand = (serial: number) => view.rerender(<PhotoBrowser {...props} sort={{ host, active: true, onChosenChange, command: { serial } }} />);
    const leaveSort = () => view.rerender(<PhotoBrowser {...props} sort={{ host, active: false, onChosenChange }} />);
    return { host, work: within(host), tile, onChosenChange, onSendPhotos, onCreateFolder, rerunCommand, leaveSort };
  }

  it("shows a clicked Photo large with its Usage badge, and steps through the grid with the arrow keys", async () => {
    const album = placePhoto(addPhotoSlot(createAlbum({ name: "Test", pageCount: 2 }), "page-1"), "page-1", "slot-1", photo(1));
    const { work, tile, onChosenChange, leaveSort } = await browseSort({ album });
    expect(work.getByText(/Click a Photo/)).toBeTruthy();
    expect(onChosenChange).toHaveBeenLastCalledWith(0);
    fireEvent.click(tile(photo(0).path));
    expect(await work.findByRole("img", { name: photo(0).path })).toBeTruthy();
    expect(work.queryByLabelText(/Used/)).toBeNull();
    expect(onChosenChange).toHaveBeenLastCalledWith(1);
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

  it("compares up to four Ctrl-clicked Photos side by side, chosen, and unchooses and chooses them by clicking", async () => {
    const { work, tile, onChosenChange } = await browseSort({ photos: [0, 1, 2, 3, 4].map(photo) });
    fireEvent.click(tile(photo(0).path));
    fireEvent.click(tile(photo(1).path), { ctrlKey: true });
    const comparison = work.getByRole("group", { name: "Comparison" });
    // Ctrl-click chooses, and the Photo that was shown on its own stays chosen.
    expect(onChosenChange).toHaveBeenLastCalledWith(2);
    expect(work.getByRole("button", { name: `Unchoose ${photo(0).path}` }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(work.getByRole("button", { name: `Unchoose ${photo(1).path}` }));
    expect(work.getByRole("button", { name: `Choose ${photo(1).path}` }).getAttribute("aria-pressed")).toBe("false");
    expect(onChosenChange).toHaveBeenLastCalledWith(1);
    for (const index of [2, 3, 4]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    expect(comparison.classList.contains("sort-view--4")).toBe(true);
    expect(work.queryByRole("button", { name: /photo-4\.jpg/ })).toBeNull();
    expect(onChosenChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(tile(photo(0).path), { ctrlKey: true });
    expect(work.queryByRole("button", { name: /photo-0\.jpg/ })).toBeNull();
    expect(onChosenChange).toHaveBeenLastCalledWith(2);
    fireEvent.click(tile(photo(4).path));
    expect(work.queryByRole("group", { name: "Comparison" })).toBeNull();
    expect(await work.findByRole("img", { name: photo(4).path })).toBeTruthy();
  });

  it("offers Show and Comparison actions on right-click in the grid and in the Comparison", async () => {
    const { work, tile } = await browseSort({ photos: [0, 1, 2, 3, 4].map(photo) });
    const menuItems = () => within(screen.getByRole("menu", { name: "Photo actions" })).getAllByRole("menuitem");
    const item = (name: string) => within(screen.getByRole("menu", { name: "Photo actions" })).getByRole("menuitem", { name });

    fireEvent.contextMenu(tile(photo(0).path));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Show", "Add to Comparison", "Send to Folder"]);
    expect(item("Send to Folder").getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(item("Show"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(await work.findByRole("img", { name: photo(0).path })).toBeTruthy();

    fireEvent.contextMenu(tile(photo(1).path));
    fireEvent.click(item("Add to Comparison"));
    expect(work.getByRole("group", { name: "Comparison" })).toBeTruthy();
    fireEvent.contextMenu(tile(photo(1).path));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Show", "Remove from Comparison", "Send to Folder"]);
    fireEvent.keyDown(screen.getByRole("menu", { name: "Photo actions" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.contextMenu(work.getByRole("button", { name: `Unchoose ${photo(1).path}` }));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Unchoose", "Remove from Comparison", "Send to Folder"]);
    fireEvent.click(item("Unchoose"));
    fireEvent.contextMenu(work.getByRole("button", { name: `Choose ${photo(1).path}` }));
    fireEvent.click(item("Choose"));
    fireEvent.contextMenu(work.getByRole("button", { name: `Unchoose ${photo(1).path}` }));
    fireEvent.click(item("Remove from Comparison"));
    expect(work.queryByRole("group", { name: "Comparison" })).toBeNull();

    // A Photo shown on its own always counts as chosen, so it can't be unchosen.
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    expect(menuItems().map((entry) => entry.textContent)).toEqual(["Remove from Comparison", "Send to Folder"]);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    for (const index of [1, 2, 3]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    fireEvent.contextMenu(tile(photo(4).path));
    expect((item("Add to Comparison") as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends a Photo to a nested Folder from the submenu, then shows the next Photo in the grid", async () => {
    const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile } = await browseSort({ onSendPhotos });
    fireEvent.click(tile(photo(0).path));
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
    const folders = within(screen.getByRole("menu", { name: "Send to Folder" }));
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
    fireEvent.click(work.getByRole("button", { name: `Unchoose ${photo(2).path}` }));
    fireEvent.contextMenu(work.getByRole("button", { name: `Unchoose ${photo(1).path}` }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
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

  it("sends every chosen Photo from the right-click menu of a chosen one, and only an unchosen Photo itself", async () => {
    const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile, onCreateFolder } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
    fireEvent.click(tile(photo(0).path));
    for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    fireEvent.click(work.getByRole("button", { name: `Unchoose ${photo(2).path}` }));
    const sendVia = (target: HTMLElement, folder: string) => {
      fireEvent.contextMenu(target);
      fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
      fireEvent.click(within(screen.getByRole("menu", { name: "Send to Folder" })).getByRole("menuitem", { name: folder }));
    };
    // Wait for each move to finish, when its tiles leave the grid.
    const settled = (...paths: string[]) => waitFor(() => {
      const grid = within(screen.getByRole("list", { name: "Photos" }));
      for (const path of paths) expect(grid.queryByText(path)).toBeNull();
    });

    sendVia(work.getByRole("button", { name: `Unchoose ${photo(1).path}` }), "New Folder…");
    const dialog = within(screen.getByRole("dialog", { name: "New Folder" }));
    expect(dialog.getByText(/moves 2 Photos/)).toBeTruthy();
    fireEvent.change(dialog.getByRole("textbox", { name: "Folder name" }), { target: { value: "best" } });
    fireEvent.click(dialog.getByRole("button", { name: "Create and Move" }));
    await waitFor(() => expect(onSendPhotos).toHaveBeenCalledWith([photo(0).path, photo(1).path], "best"));
    expect(onCreateFolder).toHaveBeenCalledWith("", "best");
    await waitFor(() => expect(work.queryByRole("button", { name: /photo-[01]\.jpg/ })).toBeNull());
    await settled(photo(0).path, photo(1).path);
    expect(screen.getByRole("button", { name: "Open folder best" })).toBeTruthy();

    // An unchosen Photo goes on its own, from the grid as from the Comparison.
    fireEvent.click(tile(photo(3).path), { ctrlKey: true });
    fireEvent.click(work.getByRole("button", { name: `Unchoose ${photo(3).path}` }));
    sendVia(tile(photo(3).path), "kids");
    await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "kids"));
    await settled(photo(3).path);
    // A chosen Photo right-clicked in the grid takes the other chosen Photos with it.
    fireEvent.click(screen.getByRole("button", { name: "Open folder best" }));
    await screen.findByText(photo(0).path);
    fireEvent.click(tile(photo(0).path), { ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    sendVia(tile(photo(0).path), "kids");
    await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(2).path, `best/${photo(0).path}`], "kids"));
  });

  describe("dragging chosen Photos", () => {
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
    /** Ctrl-clicks the first three Photos into a Comparison, leaving only the ones at `indexes` chosen. */
    function compareKeepingChosen(work: ReturnType<typeof within>, tile: (path: string) => HTMLElement, ...indexes: number[]) {
      fireEvent.click(tile(photo(0).path));
      for (const index of [1, 2]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
      for (const index of [0, 1, 2].filter((index) => !indexes.includes(index))) {
        fireEvent.click(work.getByRole("button", { name: `Unchoose ${photo(index).path}` }));
      }
    }

    it("moves every Photo Ctrl-clicked in the grid when one is dragged from the grid, and only an unchosen Photo itself", async () => {
      const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
      const { tile } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });

      dragTo(tile(photo(3).path), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "kids"));
      await settled(photo(3).path);
      dragTo(tile(photo(1).path), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path], "kids"));
    });

    it("moves the chosen Photos when one is dragged from the Comparison, and a Photo shown on its own by itself", async () => {
      const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
      const { work, tile } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
      compareKeepingChosen(work, tile, 0, 1);

      dragTo(work.getByRole("button", { name: `Choose ${photo(2).path}` }), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(2).path], "kids"));
      await settled(photo(2).path);
      dragTo(work.getByRole("button", { name: `Unchoose ${photo(1).path}` }), kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(1).path], "kids"));
      await settled(photo(0).path, photo(1).path);
      fireEvent.click(tile(photo(3).path));
      dragTo((await work.findByRole("img", { name: photo(3).path })).closest("figure")!, kids());
      await waitFor(() => expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "kids"));
    });

    it("shows how many Photos are dragged on the drag image when there's more than one", async () => {
      const { work, tile } = await browseSort();
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      const dragImage = (source: HTMLElement) => {
        const setDragImage = vi.fn((image: Element) => image.textContent);
        fireEvent.dragStart(source, { dataTransfer: { ...photoTransfer(), setDragImage } });
        fireEvent.dragEnd(source);
        return setDragImage.mock.results.map(({ value }) => value);
      };
      expect(dragImage(tile(photo(1).path))).toEqual(["2 Photos"]);
      expect(dragImage(work.getByRole("button", { name: `Unchoose ${photo(0).path}` }))).toEqual(["2 Photos"]);
      expect(dragImage(tile(photo(2).path))).toEqual([]);
    });

    it("moves only the dragged Photo outside Sort mode, where the chosen Photos aren't shown", async () => {
      const { work, tile, onSendPhotos, leaveSort } = await browseSort();
      compareKeepingChosen(work, tile, 0, 1);
      leaveSort();
      const setDragImage = vi.fn();
      const transfer = Object.assign(photoTransfer(), { setDragImage });
      fireEvent.dragStart(tile(photo(1).path), { dataTransfer: transfer });
      fireEvent.drop(kids(), { dataTransfer: transfer });
      expect(setDragImage).not.toHaveBeenCalled();
      expect(onSendPhotos).toHaveBeenCalledWith([photo(1).path], "kids");
    });

    it("only offers Folders that don't already hold every dragged Photo, including the current Folder", async () => {
      const kept = { ...photo(2), path: "kids/kept.jpg" };
      const { work, tile, onSendPhotos } = await browseSort({ photos: [photo(0), photo(1), kept], folders: ["kids"] });
      fireEvent.click(tile(photo(0).path));
      fireEvent.click(tile(photo(1).path), { ctrlKey: true });
      fireEvent.click(kids());
      await screen.findByText("kept.jpg");
      const breadcrumbs = within(screen.getByRole("navigation", { name: "Photo folders" }));
      const library = breadcrumbs.getByRole("button", { name: "Library" });
      const current = breadcrumbs.getByRole("button", { name: "kids" });

      const transfer = photoTransfer();
      const source = work.getByRole("button", { name: `Unchoose ${photo(0).path}` });
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

  it("sends the chosen Photos from the command bar's Send to Folder dialog, into an existing or a new Folder", async () => {
    const onSendPhotos = vi.fn(async (paths: string[], target: string) => paths.map((from) => ({ from, to: `${target}/${from}` })));
    const { work, tile, rerunCommand, onCreateFolder } = await browseSort({ photos: [0, 1, 2, 3].map(photo), onSendPhotos });
    fireEvent.click(tile(photo(0).path));
    for (const index of [1, 2, 3]) fireEvent.click(tile(photo(index).path), { ctrlKey: true });
    for (const index of [1, 3]) fireEvent.click(work.getByRole("button", { name: `Unchoose ${photo(index).path}` }));
    rerunCommand(1);
    let dialog = within(screen.getByRole("dialog", { name: "Send to Folder" }));
    expect(dialog.getByText("Moves 2 Photos.")).toBeTruthy();
    expect(dialog.getAllByRole("radio").map((entry) => entry.closest("label")!.textContent)).toEqual(["Library", "kids", "small"]);
    const send = dialog.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(dialog.getByRole("radio", { name: "kids" }));
    fireEvent.click(send);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSendPhotos).toHaveBeenLastCalledWith([photo(0).path, photo(2).path], "kids");
    await waitFor(() => expect(work.getAllByRole("button")).toHaveLength(2));

    fireEvent.click(work.getByRole("button", { name: `Choose ${photo(3).path}` }));
    rerunCommand(2);
    dialog = within(screen.getByRole("dialog", { name: "Send to Folder" }));
    fireEvent.click(dialog.getByRole("radio", { name: "Library" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "New Folder (optional)" }), { target: { value: "trip" } });
    fireEvent.click(dialog.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCreateFolder).toHaveBeenCalledWith("", "trip");
    expect(onSendPhotos).toHaveBeenLastCalledWith([photo(3).path], "trip");
  });

  it("updates the grid in place after a move: tiles are busy until it finishes, and the next Photo comes with the settled grid", async () => {
    let finish!: (moves: PhotoMove[]) => void;
    const onSendPhotos = vi.fn(() => new Promise<PhotoMove[]>((resolve) => { finish = resolve; }));
    const { work, tile } = await browseSort({ onSendPhotos });
    const grid = screen.getByRole("list", { name: "Photos" });
    fireEvent.click(tile(photo(0).path));
    fireEvent.contextMenu(await work.findByRole("img", { name: photo(0).path }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Send to Folder" })).getByRole("menuitem", { name: "kids" }));

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
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Send to Folder" })).getByRole("menuitem", { name: "kids" }));
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Send to Folder" })).getByRole("menuitem", { name: "kids" }));
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
    render(<PhotoBrowser root="D:\\Photos" onSendPhotos={onSendPhotos} sort={{ host: sortHost(), active: true, onChosenChange: () => undefined }} />);
    const grid = within(await screen.findByRole("list", { name: "Photos" }));
    await grid.findByText(photo(0).path);
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await screen.findByText("Scanning Library...");

    fireEvent.contextMenu(grid.getByText(photo(0).path));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send to Folder" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Send to Folder" })).getByRole("menuitem", { name: "kids" }));
    await screen.findByText(`Moved "${photo(0).path}" to kids.`);
    releaseStale();
    await waitFor(() => expect(scans).toBe(3));
    await waitFor(() => expect(screen.queryByText("Scanning Library...")).toBeNull());
    expect(grid.queryByText(photo(0).path)).toBeNull();
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
