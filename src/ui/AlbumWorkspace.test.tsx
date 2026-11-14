// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAlbum, deserializeAlbum, serializeAlbum, type AlbumPorts } from "../core";
import AlbumWorkspace from "./AlbumWorkspace";

vi.mock("react-konva", () => ({
  Stage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children: ReactNode }) => <>{children}</>,
  Rect: () => null,
  Image: ({ image, opacity }: { image: HTMLImageElement; opacity?: number }) =>
    <img alt="Placement" src={image.src} style={{ opacity }} />,
}));

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // A 1278 x 800 editor gives a scale of 2 px per mm, so an A4 trim Page is 594 x 420 px.
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: new DOMRectReadOnly(0, 0, 1278, 800) } as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function disk() {
  const files = new Map<string, string>([["Existing", serializeAlbum(createAlbum({ name: "Existing", pageCount: 2 }))]]);
  const ports: AlbumPorts = {
    list: vi.fn(async () => [...files.keys()]),
    read: vi.fn(async (_root, name) => {
      const json = files.get(name);
      if (!json) throw new Error("Missing file");
      return json;
    }),
    write: vi.fn(async (_root, name, json, create) => {
      if (create && files.has(name)) throw new Error("Already exists");
      files.set(name, json);
    }),
  };
  return { ports, files };
}

it("selects facing Pages from a Spread strip below the editor and blocks out the inside cover", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  const canvas = await screen.findByRole("group", { name: "Spread editor" });
  const strip = screen.getByRole("navigation", { name: "Spreads" });
  expect(canvas.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(canvas).getByText("Inside cover")).toBeTruthy();
  expect(within(canvas).getByRole("button", { name: "Select Page 1" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(within(strip).getByRole("button", { name: "Select Page 2" }));
  expect(within(canvas).queryByText("Inside cover")).toBeNull();
  expect(within(canvas).getByRole("button", { name: "Select Page 2" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("PAGE 2 OF 2")).toBeTruthy();
});

it("keeps starting side and print settings in Album settings, validates them, and persists changes", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Album settings" }));
  fireEvent.change(screen.getByLabelText("Page 1 side"), { target: { value: "left" } });
  const firstSpread = within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("group", { name: "Spread 1" });
  expect(firstSpread.firstElementChild?.getAttribute("aria-label")).toBe("Select Page 1");
  fireEvent.change(screen.getByLabelText("Bleed (mm)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Safe Zone (mm)"), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("Export resolution (DPI)"), { target: { value: "600" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await waitFor(() => expect(screen.getByText("Saved").textContent).toBe("Saved"));
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.queryByLabelText("Bleed (mm)")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Album settings" }));
  expect((screen.getByLabelText("Page 1 side") as HTMLSelectElement).value).toBe("left");
  expect((screen.getByLabelText("Bleed (mm)") as HTMLInputElement).value).toBe("4");
  expect((screen.getByLabelText("Safe Zone (mm)") as HTMLInputElement).value).toBe("7");
  expect((screen.getByLabelText("Export resolution (DPI)") as HTMLInputElement).value).toBe("600");
  fireEvent.change(screen.getByLabelText("Safe Zone (mm)"), { target: { value: "105" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  expect(screen.getByRole("alert").textContent).toContain("Safe Zone");
  expect(screen.getByText("Safe Zone: 7 mm")).toBeTruthy();
});

it("adds and duplicates after the selected Page, selects the result, deletes safely, and reopens saved Pages", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Add Page" }));
  expect(screen.getByText("PAGE 2 OF 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Duplicate Page" }));
  expect(screen.getByText("PAGE 3 OF 4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete Page" }));
  expect(screen.getByText("PAGE 3 OF 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete Page" }));
  expect(screen.getByText("PAGE 2 OF 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete Page" }));
  expect(screen.getByText("PAGE 1 OF 1")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Delete Page" }) as HTMLButtonElement).disabled).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(500));
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.getByText("1 Pages")).toBeTruthy());
  expect(screen.getByText("PAGE 1 OF 1")).toBeTruthy();
});

it("drag-reorders Pages, keeps the moved Page selected, supports keyboard-friendly moves, and persists the order", async () => {
  const { ports, files } = disk();
  files.set("Existing", serializeAlbum(createAlbum({ name: "Existing", pageCount: 4 })));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  vi.useFakeTimers();
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  const first = strip.getByRole("button", { name: "Select Page 1" });
  const last = strip.getByRole("button", { name: "Select Page 4" });
  const dataTransfer = { setData: vi.fn(), effectAllowed: "none", dropEffect: "none" };
  fireEvent.dragStart(first, { dataTransfer });
  fireEvent.dragOver(last, { dataTransfer });
  fireEvent.drop(last, { dataTransfer });
  fireEvent.dragEnd(first, { dataTransfer });
  expect(screen.getByText("PAGE 4 OF 4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Move Page earlier" }));
  expect(screen.getByText("PAGE 3 OF 4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Move Page later" }));
  expect(screen.getByText("PAGE 4 OF 4")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Move Page later" }) as HTMLButtonElement).disabled).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(500));
  vi.useRealTimers();
  const reopened = deserializeAlbum(await ports.read("D:\\Photos", "Existing"));
  expect(reopened.pages.map((page) => page.id)).toEqual(["page-2", "page-3", "page-4", "page-1"]);
  const before = serializeAlbum(reopened);
  fireEvent.drop(strip.getByRole("button", { name: "Select Page 1" }), { dataTransfer });
  expect(screen.getByRole("status").textContent).toBe("Saved");
  expect(serializeAlbum(deserializeAlbum(await ports.read("D:\\Photos", "Existing")))).toBe(before);
});

it("lists and opens existing Albums, then creates an A4 landscape Album without manual dimensions", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  expect(screen.getByText("2 Pages")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New Album" }));
  expect(screen.getByLabelText("Page Format").textContent).toBe("A4 - landscape (297 x 210 mm)");
  expect(screen.queryByLabelText(/width|height/i)).toBeNull();
  expect((screen.getByLabelText("Page count") as HTMLInputElement).value).toBe("24");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Christmas" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Album" }));
  await screen.findByRole("heading", { name: "Christmas" });
  const album = deserializeAlbum(files.get("Christmas")!);
  expect(album.pages).toHaveLength(24);
  expect(album.startingSide).toBe("right");
  expect(album.pageFormat.size).toBe("A4");
  expect(album.pageFormat.orientation).toBe("landscape");
});

it("debounces changes, blocks navigation until saved, and reopens the persisted Album", async () => {
  const { ports, files } = disk();
  const onBusyChange = vi.fn();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} onBusyChange={onBusyChange} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Album settings" }));
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText("Page 1 side"), { target: { value: "left" } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  fireEvent.change(screen.getByLabelText("Page 1 side"), { target: { value: "right" } });
  fireEvent.change(screen.getByLabelText("Page 1 side"), { target: { value: "left" } });
  expect((screen.getByRole("button", { name: "New Album" }) as HTMLButtonElement).disabled).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(() => vi.advanceTimersByTimeAsync(499));
  expect(deserializeAlbum(files.get("Existing")!).startingSide).toBe("right");
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(deserializeAlbum(files.get("Existing")!).startingSide).toBe("left");
  expect(screen.getByRole("status").textContent).toBe("Saved");
  expect(ports.write).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.queryByLabelText("Page 1 side")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Album settings" }));
  await waitFor(() => expect((screen.getByLabelText("Page 1 side") as HTMLSelectElement).value).toBe("left"));
});

it("keeps unsaved changes after a failed save, prevents leaving, and retries explicitly", async () => {
  const { ports, files } = disk();
  const write = ports.write;
  ports.write = vi.fn().mockRejectedValueOnce(new Error("Disk full")).mockImplementation(write);
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Album settings" }));
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText("Page 1 side"), { target: { value: "left" } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(screen.getByRole("alert").textContent).toContain("Disk full");
  expect(screen.getByRole("status").textContent).toBe("Not saved");
  for (const name of ["Add Page", "Duplicate Page", "Delete Page", "Move Page later"]) {
    expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  }
  expect(within(screen.getByRole("navigation", { name: "Spreads" }))
    .getByRole("button", { name: "Select Page 1" }).draggable).toBe(false);
  expect(deserializeAlbum(files.get("Existing")!).startingSide).toBe("right");
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(true);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).startingSide).toBe("left");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Saved");
});

it("keeps the previous Album available when opening malformed JSON fails and does not overwrite duplicates", async () => {
  const { ports, files } = disk();
  files.set("Broken", "{");
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Open Album Broken" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: "Existing" })).toBeTruthy();
  expect(ports.write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "New Album" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Existing" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Album" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Already exists"));
  expect(deserializeAlbum(files.get("Existing")!).pages).toHaveLength(2);
  expect(screen.getByRole("form", { name: "New Album" })).toBeTruthy();
});

it("shows listing failures and allows the user to retry", async () => {
  const { ports } = disk();
  const list = ports.list;
  ports.list = vi.fn().mockRejectedValueOnce(new Error("Permission denied")).mockImplementation(list);
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Permission denied");
  fireEvent.click(screen.getByRole("button", { name: "Refresh Albums" }));
  await screen.findByRole("button", { name: "Open Album Existing" });
  expect(screen.queryByRole("alert")).toBeNull();
});

function previews() {
  return { preview: vi.fn(async (_root: string, path: string) => `data:image/jpeg;base64,${btoa(path)}`) };
}

function drag(element: Element, dx: number, dy: number) {
  fireEvent.mouseDown(element, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });
  fireEvent.mouseUp(window, { clientX: 100 + dx, clientY: 100 + dy });
}

it("adds, moves, resizes and deletes Photo Slots on the selected Page and persists their Page fractions", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  expect((screen.getByRole("button", { name: "Delete Slot" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  expect(slot.getAttribute("aria-pressed")).toBe("true");
  // 59.4 px is 0.1 of the 594 px trim width; 42 px is 0.1 of the 420 px trim height.
  drag(slot, 59.4, 42);
  drag(screen.getByRole("button", { name: "Resize Page 1 Photo Slot 1" }), 59.4, -42);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
  const [saved] = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  expect(saved.x).toBeCloseTo(0.4, 9);
  expect(saved.y).toBeCloseTo(0.4, 9);
  expect(saved.width).toBeCloseTo(0.5, 9);
  expect(saved.height).toBeCloseTo(0.3, 9);

  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }), { key: "Delete" });
  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Slot" }));
  expect(screen.queryByRole("button", { name: /^Page 1 Photo Slot/ })).toBeNull();
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots).toEqual([]);
});

function photoDrop(photo: { path: string; width: number; height: number; orientation: number }, thumbnail?: string) {
  const data = new Map([["application/x-phalbummakr-photo", JSON.stringify({
    ...photo, ...(thumbnail ? { thumbnail } : {}),
  })]]);
  return { dataTransfer: { types: [...data.keys()], getData: (type: string) => data.get(type) ?? "", dropEffect: "none" } };
}

it("highlights every visible Photo Slot and labels the current drop target", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));

  const target = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const other = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  const transfer = photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }).dataTransfer;
  const dragStart = new Event("dragstart", { bubbles: true }) as DragEvent;
  Object.defineProperty(dragStart, "dataTransfer", { value: transfer });
  fireEvent(window, dragStart);

  expect(target.classList.contains("slot-overlay--dragging")).toBe(true);
  expect(other.classList.contains("slot-overlay--dragging")).toBe(true);
  fireEvent.dragOver(target, { dataTransfer: transfer });

  expect(screen.getByText("Place Photo")).toBeTruthy();
  expect(target.classList.contains("slot-overlay--drop-target")).toBe(true);
  expect(other.classList.contains("slot-overlay--dragging")).toBe(true);
  const insideCover = within(screen.getByRole("group", { name: "Spread editor" })).getByText("Inside cover");
  fireEvent.dragOver(insideCover, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  expect(screen.queryByText("Place Photo")).toBeNull();
  expect(other.classList.contains("slot-overlay--dragging")).toBe(true);
  fireEvent(window, new Event("dragend"));
  expect(screen.queryByText("Place Photo")).toBeNull();
  expect(target.classList.contains("slot-overlay--dragging")).toBe(false);
  expect(other.classList.contains("slot-overlay--dragging")).toBe(false);
});

it("creates and selects a Photo Slot when a Photo is dropped on a blank Page", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  const editor = screen.getByRole("group", { name: "Spread editor" });
  const page = within(editor).getByRole("button", { name: "Select Page 1" });
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 606, 432));
  const drop = photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 });
  fireEvent.dragOver(page, drop);
  expect(drop.dataTransfer.dropEffect).toBe("copy");
  const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperties(dropEvent, {
    dataTransfer: { value: drop.dataTransfer },
    clientX: { value: 403 },
    clientY: { value: 266 },
  });
  fireEvent(page, dropEvent);

  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  expect(slot.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByText("Place Photo")).toBeNull();
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.photoPath).toBe("tree.jpg");
});

it("ignores Photo drops on blocked Pages, the Spread strip, and the area around Pages", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  const photo = photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 });
  const editor = screen.getByRole("group", { name: "Spread editor" });
  fireEvent.drop(within(editor).getByText("Inside cover"), photo);
  fireEvent.drop(editor, photo);
  fireEvent.drop(screen.getByRole("navigation", { name: "Spreads" }), photo);
  expect(screen.queryByRole("button", { name: /^Page \d+ Photo Slot/ })).toBeNull();

  fireEvent.change(screen.getByLabelText("Page"), { target: { value: "page-2" } });
  fireEvent.drop(within(editor).getByText("No Page"), photo);
  expect(screen.queryByRole("button", { name: /^Page \d+ Photo Slot/ })).toBeNull();
});

it("draws the dragged thumbnail with loading feedback until the full preview is ready", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    private url = "";
    get src() { return this.url; }
    set src(url: string) { this.url = url; queueMicrotask(() => this.onload?.()); }
  });
  let resolvePreview: (url: string) => void = () => {};
  const preview = new Promise<string>((resolve) => { resolvePreview = resolve; });
  const photoPorts = previews();
  photoPorts.preview = vi.fn(() => preview);
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={photoPorts} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop(
    { path: "tree.jpg", width: 6000, height: 4000, orientation: 1 },
    "data:image/png;base64,dGh1bWJuYWls",
  ));

  const placeholder = await screen.findByRole("img", { name: "Placement" });
  expect(placeholder.getAttribute("src")).toBe("data:image/png;base64,dGh1bWJuYWls");
  expect((placeholder as HTMLImageElement).style.opacity).toBe("0.45");
  expect(screen.getByRole("status", { name: "Loading Photo preview" })).toBeTruthy();

  await act(async () => {
    resolvePreview("data:image/jpeg;base64,full-preview");
    await preview;
  });
  await waitFor(() => expect(screen.getByRole("img", { name: "Placement" }).getAttribute("src"))
    .toBe("data:image/jpeg;base64,full-preview"));
  expect(screen.queryByRole("status", { name: "Loading Photo preview" })).toBeNull();
  expect((screen.getByRole("img", { name: "Placement" }) as HTMLImageElement).style.opacity).toBe("1");
});

it("reports a failed preview and retries it on demand", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    private url = "";
    get src() { return this.url; }
    set src(url: string) { this.url = url; queueMicrotask(() => this.onload?.()); }
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const photoPorts = previews();
  photoPorts.preview = vi.fn()
    .mockRejectedValueOnce(new Error("Preview unavailable"))
    .mockResolvedValue("data:image/jpeg;base64,retried-preview");
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={photoPorts} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop(
    { path: "tree.jpg", width: 6000, height: 4000, orientation: 1 },
  ));

  expect(await screen.findByText("Couldn't load Photo")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("img", { name: "Placement" }).getAttribute("src"))
    .toBe("data:image/jpeg;base64,retried-preview"));
  expect(photoPorts.preview).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Couldn't load Photo")).toBeNull();
});

it("places a dropped Photo in a Photo Slot, replaces it on a second drop, and draws it from its preview", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    private url = "";
    get src() { return this.url; }
    set src(url: string) { this.url = url; queueMicrotask(() => this.onload?.()); }
  });
  const { ports, files } = disk();
  const photoPorts = previews();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={photoPorts} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const tree = photoDrop({ path: "2024/tree.jpg", width: 6000, height: 4000, orientation: 1 });
  fireEvent.dragOver(slot, tree);
  expect(tree.dataTransfer.dropEffect).toBe("copy");
  fireEvent.drop(slot, tree);
  expect((await screen.findByRole("img", { name: "Placement" })).getAttribute("src")).toBe(`data:image/jpeg;base64,${btoa("2024/tree.jpg")}`);
  expect(photoPorts.preview).toHaveBeenCalledWith("D:\\Photos", "2024/tree.jpg");
  fireEvent.dragOver(slot, photoDrop({ path: "snow.png", width: 4000, height: 6000, orientation: 1 }));
  expect(screen.getByText("Replace Photo")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
  const placement = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!;
  expect(placement.photoPath).toBe("2024/tree.jpg");
  expect(placement.crop.y).toBe(0);
  expect(placement.crop.x + placement.crop.width / 2).toBeCloseTo(0.5, 9);

  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop({ path: "snow.png", width: 4000, height: 6000, orientation: 1 }));
  await waitFor(() => expect(screen.getByRole("img", { name: "Placement" }).getAttribute("src")).toBe(`data:image/jpeg;base64,${btoa("snow.png")}`));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
  const [replaced] = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  expect(replaced.placement!.photoPath).toBe("snow.png");
  expect(screen.getAllByRole("img", { name: "Placement" })).toHaveLength(1);
});

it("keeps Crop local during a pan gesture, commits at release, and persists Fit", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved").textContent).toBe("Saved"));
  const original = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
  const writesBeforePan = ports.write.mock.calls.length;
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop).toEqual(original);
  fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop).toEqual(original);
  await act(() => vi.advanceTimersByTimeAsync(500));
  const panned = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(panned.x).toBeGreaterThan(original.x);
  expect(ports.write).toHaveBeenCalledTimes(writesBeforePan + 1);

  expect((screen.getByRole("checkbox", { name: "Crop photo" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Crop photo" }) as HTMLInputElement).disabled).toBe(false);
  const writesBeforeZoom = ports.write.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  const zoomed = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(zoomed.width).toBeLessThan(panned.width);
  expect(ports.write).toHaveBeenCalledTimes(writesBeforeZoom + 1);

  fireEvent.click(screen.getByRole("checkbox", { name: "Fit Photo" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.fit).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Crop photo" }) as HTMLInputElement).disabled).toBe(true);
});
