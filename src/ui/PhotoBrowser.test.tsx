// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import PhotoBrowser from "./PhotoBrowser";

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
    path: `holiday/photo-${index}.jpg`,
    captureDate: 1_577_934_245_000 + index * 1000,
    width: 4000,
    height: 3000,
    orientation: 1,
    revision: `revision-${index}`,
  };
}

it("renders only a small window of 2,500 Photos and lazily loads thumbnails as the user scrolls", async () => {
  const photos = Array.from({ length: 2500 }, (_, index) => photo(index));
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos, warnings: [] };
    return "data:image/png;base64,dGVzdA==";
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);

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
});

it("rescans added and removed Photos, reports warnings, and keeps the grid when a rescan fails", async () => {
  let scanned = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command !== "scan_photos") return "data:image/png;base64,dGVzdA==";
    scanned++;
    if (scanned === 3) throw new Error("Library disconnected");
    return {
      photos: [photo(scanned === 1 ? 0 : 1)],
      warnings: scanned === 1 ? [] : ["bad.jpg: invalid JPEG"],
    };
  });
  render(<PhotoBrowser root={"D:\\Photos"} />);
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
});

it("caps thumbnail work at four requests and cancels queued work after scrolling away", async () => {
  const photos = Array.from({ length: 2500 }, (_, index) => photo(index));
  const release: (() => void)[] = [];
  let paused = true;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") return { photos, warnings: [] };
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
  let finishScan: (result: { photos: ReturnType<typeof photo>[]; warnings: string[] }) => void = () => {};
  let scans = 0;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "scan_photos") {
      if (++scans === 1) return { photos: [photo(0)], warnings: [] };
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
  finishScan({ photos: [], warnings: [] });
  await screen.findByText(/No Photos yet/);
});
