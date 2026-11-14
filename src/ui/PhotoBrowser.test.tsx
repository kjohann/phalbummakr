// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { addPhotoSlot, createAlbum, duplicatePage, placePhoto } from "../core";
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

it("updates Usage badges and the unused filter as the current Album changes", async () => {
  const first = photo(0);
  const second = photo(1);
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos: [first, second], folders: ["folder"], warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  const { rerender } = render(<PhotoBrowser root="D:\\Photos" />);
  await screen.findByText(first.path);
  const filter = screen.getByRole("checkbox", { name: "Unused in this Album" }) as HTMLInputElement;
  expect(filter.disabled).toBe(true);
  let album = addPhotoSlot(createAlbum({ name: "Test", pageCount: 1 }), "page-1");
  album = placePhoto(album, "page-1", "slot-1", first);
  rerender(<PhotoBrowser root="D:\\Photos" album={album} />);
  expect(screen.getByLabelText("Used 1 time in this Album").textContent).toBe("1");
  album = duplicatePage(album, "page-1");
  rerender(<PhotoBrowser root="D:\\Photos" album={album} />);
  expect(screen.getByLabelText("Used 2 times in this Album").textContent).toBe("2");
  fireEvent.click(filter);
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
  expect(dataTransfer.effectAllowed).toBe("copy");
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
