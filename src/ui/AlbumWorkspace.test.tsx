// @vitest-environment jsdom
import { useState, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPhotoSlot, addTextSlot, applyLayout, createAlbum, createGridLayout, deserializeAlbum, photoUsage, placePhoto, readLayoutLibrary, relinkPlacements, rotateSlot, serializeAlbum, serializeLayoutLibrary, setSlotPlaceholder, setSlotText, type Album, type AlbumPorts, type Layout, type LayoutPorts } from "../core";
import Workspace, { type AlbumCommand, type AlbumCommandName, type PhotoMoveLink } from "./AlbumWorkspace";
import PhotoBrowser from "./PhotoBrowser";
import { PhotoSlotTools } from "./SlotTools";
import type { PageExportPorts } from "./pageExport";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { useLayoutLibrary } from "./useLayoutLibrary";
import { isSlotClipboardCurrent, readText, writeText } from "./slotClipboard";
vi.mock("./slotClipboard", () => ({ isSlotClipboardCurrent: vi.fn(), readText: vi.fn(), writeText: vi.fn() }));
vi.mock("react-konva", () => ({
  Stage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children: ReactNode }) => <>{children}</>,
  Rect: () => null,
  Text: ({ text, opacity }: { text: string; opacity?: number }) => <span style={{ opacity }}>{text}</span>,
  Group: ({ children, rotation }: { children: ReactNode; rotation?: number }) =>
    <div data-slot-rotation={rotation}>{children}</div>,
  Image: ({ image, opacity }: { image: HTMLImageElement; opacity?: number }) =>
    <img alt="Placement" src={image.src} style={{ opacity }} />,
}));

vi.mock("konva/lib/shapes/Text", () => ({
  Text: class {
    constructor(private options: { text: string; width: number; fontSize: number; lineHeight: number }) {}
    height() {
      const charactersPerLine = Math.floor(this.options.width / (this.options.fontSize * 0.6));
      if (!charactersPerLine) return 0;
      const lines = this.options.text.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
      return lines * this.options.fontSize * this.options.lineHeight;
    }
    measureSize() { return { width: this.options.fontSize * 0.6 }; }
    destroy() {}
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSlotClipboardCurrent).mockResolvedValue(true);
  vi.spyOn(tauriPhotoPorts, "index").mockImplementation(async (_root, paths) => ({
    identities: paths.map((path) => ({ path, status: "ready", hash: path })),
    hashedFiles: 0, hashedBytes: 0, cacheHits: paths.length, elapsedMs: 0,
  }));
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

/** Stands in for the command bar, which sends commands to the workspace and hosts the selected Slot's tools. */
function AlbumWorkspace(props: ComponentProps<typeof Workspace>) {
  const [command, setCommand] = useState<AlbumCommand>();
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const send = (name: AlbumCommandName) => setCommand((current) => ({ name, serial: (current?.serial ?? 0) + 1 }));
  return <>
    <div role="toolbar" aria-label="Commands">
      <div ref={setToolsHost} />
      <button type="button" onClick={() => send("add-photo-slot")}>Add Photo Slot</button>
      <button type="button" onClick={() => send("add-text-slot")}>Add Text Slot</button>
      {(["album-settings", "add-spread", "save-as-layout", "undo", "redo", "export-pages"] as const).map((name) => (
        <button key={name} type="button" onClick={() => send(name)}>Bar {name}</button>
      ))}
    </div>
    <Workspace {...props} bar={{ ...props.bar, command, toolsHost }} />
  </>;
}

const MenuHarness = AlbumWorkspace;
const bar = () => within(screen.getByRole("toolbar", { name: "Commands" }));

it("copies a Photo Slot snapshot and pastes it onto another Page as an undoable edit", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1"),
    "page-1", "slot-1", { path: "tree.jpg", width: 100, height: 100, orientation: 1 });
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(1));
  const pasted = (onAlbumChange.mock.lastCall![0] as Album).pages[1].slots[0];
  expect(pasted.placement?.photoPath).toBe("tree.jpg");
  expect(pasted.x).toBeCloseTo(album.pages[0].slots[0].x);
  expect(photoUsage(onAlbumChange.mock.lastCall![0] as Album).get("tree.jpg")).toBe(2);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(0);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(1);
});

it("pastes a Text Slot snapshot through Page, Slot and thumbnail menus with independent Page offsets", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const original = setSlotText(addTextSlot(createAlbum({ name: "Existing", pageCount: 4 }), "page-1"), "page-1", "slot-1", "Original");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    fontPorts={{ list: async () => ["Arial"] }} document={{ path: "Existing", album: original }} />);
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.contextMenu(slot);
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy Slot" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.click(slot);
  fireEvent.keyDown(document.body, { key: "Delete" });

  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.contextMenu(strip.getByRole("button", { name: "Select Page 2" }));
  const pasteMenu = () => screen.getByRole("menuitem", { name: "Paste Slot" }) as HTMLButtonElement;
  await waitFor(() => expect(pasteMenu().disabled).toBe(false));
  fireEvent.click(pasteMenu());
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(1));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots[0]).toMatchObject({ text: "Original", x: 0.3, y: 0.3 });

  fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2 Text Slot 1" }));
  await waitFor(() => expect(pasteMenu().disabled).toBe(false));
  fireEvent.click(pasteMenu());
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(2));
  let slots = (onAlbumChange.mock.lastCall![0] as Album).pages[1].slots;
  expect(slots[1].x).toBeCloseTo(0.3 + 5 / 297);
  expect(slots[1].y).toBeCloseTo(0.3 + 5 / 210);

  fireEvent.contextMenu(strip.getByRole("button", { name: "Select Page 3" }));
  await waitFor(() => expect(pasteMenu().disabled).toBe(false));
  fireEvent.click(pasteMenu());
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[2].slots).toHaveLength(1));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[2].slots[0].x).toBeCloseTo(0.3);

  fireEvent.click(strip.getByRole("button", { name: "Select Page 2" }));
  fireEvent.contextMenu(within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 2" }));
  await waitFor(() => expect(pasteMenu().disabled).toBe(false));
  fireEvent.click(pasteMenu());
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(3));
  slots = (onAlbumChange.mock.lastCall![0] as Album).pages[1].slots;
  expect(slots[2].x).toBeCloseTo(0.3 + 10 / 297);
  expect(slots[2].y).toBeCloseTo(0.3 + 10 / 210);
  expect(screen.getByRole("button", { name: "Page 2 Text Slot 3" }).getAttribute("aria-pressed")).toBe("true");
});

it("selects the pasted Slot even when the Page changes while the clipboard is being read", async () => {
  let clipboard = "";
  let finishRead: (text: string) => void = () => { throw new Error("Read did not start"); };
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  fireEvent.click(bar().getByRole("button", { name: "Add Photo Slot" }));
  await act(async () => finishRead(clipboard));
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(3));
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 3" }).getAttribute("aria-pressed")).toBe("true");
});

it("queues a paste requested while copying is still writing the clipboard", async () => {
  let clipboard = "";
  let finishWrite: () => void = () => { throw new Error("Write did not start"); };
  vi.mocked(writeText).mockImplementation((text) => new Promise((resolve) => {
    finishWrite = () => { clipboard = text; resolve(); };
  }));
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await act(async () => finishWrite());
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(2));
});

it("preserves ordinary selected UI text when copying", async () => {
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  const range = document.createRange();
  range.selectNodeContents(screen.getByText("Trim edge"));
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  expect(fireEvent.keyDown(document.body, { key: "c", ctrlKey: true })).toBe(true);
  expect(writeText).not.toHaveBeenCalled();
  window.getSelection()!.removeAllRanges();
});

it("does not discard a newer Slot copy when an older menu clipboard read fails late", async () => {
  let clipboard = "";
  let failRead: (error: string) => void = () => { throw new Error("Read did not start"); };
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementationOnce(() => new Promise((_resolve, reject) => { failRead = reject; }))
    .mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const first = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const second = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.click(first);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.contextMenu(first);
  fireEvent.click(second);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  await act(async () => failRead("The clipboard contents were not available in the requested format or the clipboard is empty."));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(3));
});

it("starts a fresh sequence when a deleted Page's identifier is reused", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", pageCount: 4 }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.click(strip.getByRole("button", { name: "Select Page 2" }));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(1));
  fireEvent.click(strip.getByRole("button", { name: "Delete Spread 2" }));
  fireEvent.click(strip.getByRole("button", { name: "Insert Spread before Spread 2" }));
  fireEvent.click(strip.getByRole("button", { name: "Select Page 2" }));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(1));
  const slot = (onAlbumChange.mock.lastCall![0] as Album).pages[1].slots[0];
  expect(slot.x).toBeCloseTo(0.3);
  expect(slot.y).toBeCloseTo(0.3);
});

it("does not treat a replacement Page as the deleted source Page", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", pageCount: 4 }), "page-2");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.click(strip.getByRole("button", { name: "Select Page 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Page 2 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.click(strip.getByRole("button", { name: "Delete Spread 2" }));
  fireEvent.click(strip.getByRole("button", { name: "Insert Spread before Spread 2" }));
  fireEvent.click(strip.getByRole("button", { name: "Select Page 2" }));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[1].slots).toHaveLength(1));
  const slot = (onAlbumChange.mock.lastCall![0] as Album).pages[1].slots[0];
  expect(slot.x).toBeCloseTo(0.3);
  expect(slot.y).toBeCloseTo(0.3);
});

it("replaces a Slot copy when ordinary clipboard data is copied and disables menu paste", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.click(slot);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  clipboard = "ordinary text";
  fireEvent.contextMenu(slot);
  await waitFor(() => expect(readText).toHaveBeenCalled());
  expect((screen.getByRole("menuitem", { name: "Paste Slot" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await act(async () => {});
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(1);
  expect(clipboard).toBe("ordinary text");
});

it("does not restore a Slot copy when clipboard history restores its old token", async () => {
  let clipboard = "";
  let sequence = 0;
  let copySequence = 0;
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; copySequence = ++sequence; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  vi.mocked(isSlotClipboardCurrent).mockImplementation(async () => sequence === copySequence);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.click(slot);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  const savedToken = clipboard;
  clipboard = "ordinary text";
  sequence += 1;
  clipboard = savedToken;
  sequence += 1;
  fireEvent.contextMenu(slot);
  await waitFor(() => expect(isSlotClipboardCurrent).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByRole("menuitem", { name: "Paste Slot" }) as HTMLButtonElement).disabled).toBe(true));
  onAlbumChange.mockClear();
  await act(async () => fireEvent.keyDown(document.body, { key: "v", ctrlKey: true }));
  expect(onAlbumChange).not.toHaveBeenCalled();
});

it("reports clipboard failures without changing the Album or its undo history", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockRejectedValueOnce(new Error("write denied"))
    .mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockRejectedValueOnce(new Error("read denied")).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  expect(await screen.findByText(/Could not copy Slot:.*write denied/)).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  expect(await screen.findByText(/Could not read clipboard:.*read denied/)).toBeTruthy();
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(1);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(1);
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(2));
});

it("treats a non-text system clipboard as unavailable without a clipboard access error", async () => {
  vi.mocked(writeText).mockResolvedValue();
  vi.mocked(readText).mockRejectedValue("The clipboard contents were not available in the requested format or the clipboard is empty.");
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.click(slot);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.contextMenu(slot);
  await waitFor(() => expect(readText).toHaveBeenCalled());
  expect((screen.getByRole("menuitem", { name: "Paste Slot" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not intercept text editing or dialogs and invalidates the Slot copy when leaving Album mode", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addTextSlot(createAlbum({ name: "Existing" }), "page-1");
  const props = { root: "D:\\Photos", ports, document: { path: "Existing", album }, fontPorts: { list: async () => ["Arial"] } };
  const { rerender } = render(<AlbumWorkspace {...props} />);
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.click(slot);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.doubleClick(slot);
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  expect(fireEvent.keyDown(editor, { key: "c", ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(editor, { key: "v", ctrlKey: true })).toBe(true);
  expect(writeText).toHaveBeenCalledOnce();
  expect(readText).not.toHaveBeenCalled();
  fireEvent.click(bar().getByRole("button", { name: "Bar album-settings" }));
  const title = screen.getByLabelText("Title");
  expect(fireEvent.keyDown(title, { key: "v", ctrlKey: true })).toBe(true);
  expect(readText).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { name: "Album settings" })).getByRole("button", { name: "Close" }));
  rerender(<AlbumWorkspace {...props} active={false} />);
  rerender(<AlbumWorkspace {...props} active />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Page 1 Text Slot 1" }));
  expect((screen.getByRole("menuitem", { name: "Paste Slot" }) as HTMLButtonElement).disabled).toBe(true);
  expect(clipboard).not.toBe("");
});

it("offsets same-Page pastes in millimetres, clamps them at the Bleed and resets on a new copy", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", bleedMm: { x: 3, y: 3 } }), "page-1");
  album.pages[0].slots[0].x = 0.6;
  album.pages[0].slots[0].y = 0.6;
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  for (let count = 2; count <= 3; count += 1) {
    fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
    await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(count));
  }
  const slots = (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots;
  expect(slots[1].x).toBeCloseTo(1 + 3 / 297 - 0.4);
  expect(slots[1].y).toBeCloseTo(1 + 3 / 210 - 0.4);
  expect(slots[2]).toMatchObject({ x: slots[1].x, y: slots[1].y, placement: null });
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(4));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots[3].x).toBeCloseTo(slots[1].x);
});

it("restarts the per-Page sequence when a Slot is copied again", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const original = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.click(original);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  for (let count = 2; count <= 3; count += 1) {
    fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
    await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(count));
  }
  const slots = (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots;
  expect(slots[1].x).toBeCloseTo(0.3 + 5 / 297);
  expect(slots[1].y).toBeCloseTo(0.3 + 5 / 210);
  expect(slots[2].x).toBeCloseTo(0.3 + 10 / 297);
  fireEvent.click(original);
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(4));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots[3].x).toBeCloseTo(0.3 + 5 / 297);
});

it("cancels a pending paste if Album mode is left before the clipboard read finishes", async () => {
  let clipboard = "";
  let finishRead: (text: string) => void = () => { throw new Error("Read did not start"); };
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  const props = { root: "D:\\Photos", ports, onAlbumChange, document: { path: "Existing", album } };
  const { rerender } = render(<AlbumWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  rerender(<AlbumWorkspace {...props} active={false} />);
  await act(async () => finishRead(clipboard));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(1);
});

it("keeps a Slot copy when an Album creation form is cancelled without switching Albums", async () => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const onAlbumChange = vi.fn();
  const props = { root: "D:\\Photos", ports, onAlbumChange, document: { path: "Existing", album }, clipboardActive: true };
  const { rerender } = render(<AlbumWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  rerender(<AlbumWorkspace {...props} active={false} />);
  rerender(<AlbumWorkspace {...props} active />);
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await waitFor(() => expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(2));
});

it.each([
  ["Photo move", [{ from: "unrelated.jpg", to: "other/unrelated.jpg" }]],
  ["Folder rename", { from: "unrelated", to: "renamed" }],
] as const)("invalidates a Slot copy after a successful %s without clearing clipboard text", async (_name, moves) => {
  let clipboard = "";
  vi.mocked(writeText).mockImplementation(async (text) => { clipboard = text; });
  vi.mocked(readText).mockImplementation(async () => clipboard);
  const { ports } = disk();
  const photoMoves: PhotoMoveLink = { current: null };
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoMoves={photoMoves}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  await act(() => photoMoves.current!(async () => moves));
  fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
  await act(async () => {});
  expect(readText).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  expect((screen.getByRole("menuitem", { name: "Paste Slot" }) as HTMLButtonElement).disabled).toBe(true);
  clipboard = "ordinary text";
  await act(() => photoMoves.current!(async () => moves));
  expect(clipboard).toBe("ordinary text");
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

async function waitForAutosave() {
  await waitFor(() => expect(
    (screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled,
  ).toBe(false));
}

function setExactFontSize(points: string) {
  fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "custom" } });
  const input = screen.getByLabelText("Font size (pt)");
  fireEvent.change(input, { target: { value: points } });
  fireEvent.keyDown(input, { key: "Enter" });
}

it("inserts an empty Spread between existing Spreads from the strip", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 4 }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.click(strip.getByRole("button", { name: "Insert Spread before Spread 2" }));
  expect(screen.getByText("PAGE 2 OF 6")).toBeTruthy();
  expect(strip.getAllByRole("group", { name: /Spread \d/ })).toHaveLength(4);
});

it("shows an empty Text Slot's placeholder greyed out on the canvas, but not in the strip", () => {
  const { ports } = disk();
  const album = addTextSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  expect(Number(editor.getByText("Text").style.opacity)).toBeLessThan(1);
  expect(within(screen.getByRole("navigation", { name: "Spreads" })).queryByText("Text")).toBeNull();
  fireEvent.doubleClick(editor.getByRole("button", { name: "Page 1 Text Slot 1" }));
  const textbox = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  expect(textbox.getAttribute("placeholder")).toBe("Text");
  fireEvent.change(textbox, { target: { value: "Hello" } });
  fireEvent.keyDown(textbox, { key: "Escape" });
  expect(editor.queryByText("Text")).toBeNull();
  expect(Number(editor.getByText("Hello").style.opacity)).toBe(1);
});

it("sizes an empty Text Slot by its text, never by its placeholder", () => {
  const { ports } = disk();
  const album = setSlotPlaceholder(addTextSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1", "slot-1", "A very long hint ".repeat(12));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  const slot = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Page 1 Text Slot 1" });
  // One 18 pt line is 7.62 mm, at 2 px per mm.
  expect(parseFloat(slot.style.height)).toBeCloseTo(15.24, 1);
  expect(screen.queryByText("Text overflows Slot")).toBeNull();
});

it("renders Page content in the strip thumbnail", () => {
  const { ports } = disk();
  const album = setSlotText(addTextSlot(createAlbum({ name: "Existing" }), "page-2"), "page-2", "slot-1", "A caption");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  expect(within(screen.getByRole("navigation", { name: "Spreads" })).getByText("A caption")).toBeTruthy();
});

it("uses a small Photo rendition for Page thumbnails", async () => {
  const { ports } = disk();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-2"), "page-2", "slot-1",
    { path: "tree.jpg", width: 100, height: 100, orientation: 1 });
  const photoPorts = {
    preview: vi.fn(async () => "preview"),
    pageThumbnail: vi.fn(async () => "thumbnail"),
  };
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={photoPorts} document={{ path: "Existing", album }} />);
  await waitFor(() => expect(photoPorts.pageThumbnail).toHaveBeenCalledWith("D:\\Photos", "tree.jpg", expect.any(AbortSignal)));
  expect(photoPorts.preview).not.toHaveBeenCalled();
});

it("deletes an empty middle Spread without asking and protects end Spreads", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 4 }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  expect(strip.queryByRole("button", { name: "Delete Spread 1" })).toBeNull();
  expect(strip.queryByRole("button", { name: "Delete Spread 3" })).toBeNull();
  fireEvent.click(strip.getByRole("button", { name: "Delete Spread 2" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText(/ OF 2$/)).toBeTruthy();
});

it("keeps the selected Page when deleting another Spread", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 6 }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.click(strip.getByRole("button", { name: "Select Page 6" }));
  fireEvent.click(strip.getByRole("button", { name: "Delete Spread 2" }));
  expect(screen.getByText("PAGE 4 OF 4")).toBeTruthy();
});

it("offers context actions appropriate to a Page or empty strip", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 4 }) }} />);
  const strip = screen.getByRole("navigation", { name: "Spreads" });
  fireEvent.contextMenu(within(strip).getByRole("button", { name: "Select Page 1" }));
  const menu = within(screen.getByRole("menu"));
  expect((menu.getByRole("menuitem", { name: "Insert Spread Before" }) as HTMLButtonElement).disabled).toBe(true);
  expect((menu.getByRole("menuitem", { name: "Delete Spread" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(menu.getByRole("menuitem", { name: "Duplicate Page onto New Spread" }));
  expect(screen.getByText("PAGE 3 OF 6")).toBeTruthy();
  fireEvent.contextMenu(strip);
  fireEvent.click(screen.getByRole("menuitem", { name: "Add Spread" }));
  expect(screen.getByText(/ OF 8$/)).toBeTruthy();
});

it("inserts around a middle Spread and disables invalid end-Spread actions", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 6 }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.contextMenu(strip.getByRole("button", { name: "Select Page 4" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Insert Spread Before" }));
  expect(screen.getByText("PAGE 4 OF 8")).toBeTruthy();
  fireEvent.contextMenu(strip.getByRole("button", { name: "Select Page 8" }));
  expect((screen.getByRole("menuitem", { name: "Insert Spread After" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("menuitem", { name: "Delete Spread" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate Page onto New Spread" }));
  expect(screen.getByText("PAGE 8 OF 10")).toBeTruthy();
});

it("indicates the Page drop target and rejects drops on Inside Covers", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 4 }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  const transfer = { setData: vi.fn(), effectAllowed: "none", dropEffect: "none" };
  fireEvent.dragStart(strip.getByRole("button", { name: "Select Page 1" }), { dataTransfer: transfer });
  fireEvent.dragOver(strip.getByRole("button", { name: "Select Page 4" }), { dataTransfer: transfer });
  expect(strip.getByRole("button", { name: "Select Page 4" }).classList.contains("page-drop-target")).toBe(true);
  fireEvent.dragOver(strip.getByRole("button", { name: "Insert Spread before Spread 2" }), { dataTransfer: transfer });
  expect(strip.getByRole("button", { name: "Select Page 4" }).classList.contains("page-drop-target")).toBe(false);
  fireEvent.dragOver(strip.getByRole("button", { name: "Select Page 4" }), { dataTransfer: transfer });
  fireEvent.dragOver(strip.getAllByText("Inside cover")[1], { dataTransfer: transfer });
  expect(strip.getByRole("button", { name: "Select Page 4" }).classList.contains("page-drop-target")).toBe(false);
  fireEvent.drop(strip.getAllByText("Inside cover")[1], { dataTransfer: transfer });
  expect(screen.getByText("PAGE 1 OF 4")).toBeTruthy();
});

it("reorders a Page from the keyboard and keeps it selected and focused", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 4 }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  const first = strip.getByRole("button", { name: "Select Page 1" });
  first.focus();
  fireEvent.keyDown(first, { altKey: true, key: "ArrowRight" });
  expect(screen.getByText("PAGE 2 OF 4")).toBeTruthy();
  expect(document.activeElement).toBe(strip.getByRole("button", { name: "Select Page 2" }));
});

it("shows non-interactive Inside Covers on both end Spreads", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing" }) }} />);
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  expect(strip.getAllByText("Inside cover")).toHaveLength(2);
  const front = editor.getByText("Inside cover");
  fireEvent.click(front);
  fireEvent.drop(front, photoDrop({ path: "tree.jpg", width: 100, height: 100, orientation: 1 }));
  expect(screen.getByText("PAGE 1 OF 2")).toBeTruthy();
  fireEvent.click(strip.getByRole("button", { name: "Select Page 2" }));
  const back = editor.getByText("Inside cover");
  fireEvent.click(back);
  fireEvent.drop(back, photoDrop({ path: "tree.jpg", width: 100, height: 100, orientation: 1 }));
  expect(screen.getByText("PAGE 2 OF 2")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Photo Slot 1/ })).toBeNull();
  expect(ports.write).not.toHaveBeenCalled();
});

it("autosaves an Album document without rendering save-status feedback", async () => {
  const { ports, files } = disk();
  const write = ports.write;
  let finishWrite: () => void = () => {};
  const pendingWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
  ports.write = vi.fn<AlbumPorts["write"]>(async (...args) => { await pendingWrite; await write(...args); });
  const onBusyChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onBusyChange={onBusyChange}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 2 }) }} />);
  expect(screen.queryByRole("status")).toBeNull();

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Insert Spread before Spread 2" }));
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  expect(screen.queryByRole("status")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).toBeNull();

  await act(async () => { finishWrite(); await pendingWrite; });
  expect(deserializeAlbum(files.get("Existing")!).pages).toHaveLength(4);
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole("status")).toBeNull();
});

it("opens a selected Album file and saves edits back to that file", async () => {
  const { ports } = disk();
  const album = createAlbum({ name: "Family: / 2026", pageCount: 2 });
  render(<MenuHarness root={"D:\\Photos"} ports={ports}
    document={{ path: "D:\\Photos\\renamed.phalbum", album }} />);
  await screen.findByRole("region", { name: "Album Pages" });
  expect(screen.queryByRole("navigation", { name: "Albums" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New: title / 2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply print settings" }));
  await waitFor(() => expect(ports.write).toHaveBeenCalledWith(
    "D:\\Photos", "D:\\Photos\\renamed.phalbum", expect.any(String), false,
  ));
  expect(deserializeAlbum(vi.mocked(ports.write).mock.calls[0][2]).title).toBe("New: title / 2026");
});

it("disables Album edits during a file transition", async () => {
  const { ports } = disk();
  const document = { path: "D:\\Photos\\album.phalbum", album: createAlbum({ name: "Original", pageCount: 2 }) };
  const { rerender } = render(<MenuHarness root="D:\\Photos" document={document} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Bar album-settings" }));
  rerender(<MenuHarness root="D:\\Photos" document={document} ports={ports} suspended />);
  expect((screen.getByRole("button", { name: "Insert Spread before Spread 2" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText("Title").matches(":disabled")).toBe(true);
});

it("rotates a Text Slot and keeps its in-place editor oriented while its content grows", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  fireEvent.change(editor, { target: { value: "One\nTwo" } });
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0]).toMatchObject({ text: "One\nTwo" }));
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot clockwise" }));
  expect(editor.style.transform).toContain("rotate(90deg)");
  expect(editor.style.left).toBe("50%");
  expect(editor.style.top).toBe("50%");
  fireEvent.change(editor, { target: { value: "One\nTwo\nThree" } });
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(saved).toMatchObject({ rotation: 90, text: "One\nTwo\nThree" });
    expect(saved.height * 210).toBeCloseTo(before.width * 297);
    expect(saved.width * 297).toBeCloseTo(3 * 18 * 1.2 / (72 / 25.4));
  });
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot counterclockwise" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].rotation).toBe(0));
});

it("resizes the writing width of a sideways Text Slot using its vertical handle", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot clockwise" }));
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  const before = parseFloat(slot.style.height);
  drag(screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" }), 0, 42);
  expect(parseFloat(slot.style.height)).toBeCloseTo(before + 42);
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].height * 420).toBeCloseTo(before + 42));
});

it.each([
  { direction: "top left", dx: 59.4, dy: 42, x: 0.4, y: 0.4, width: 0.3, height: 0.3 },
  { direction: "top", dx: 59.4, dy: 42, x: 0.3, y: 0.4, width: 0.4, height: 0.3 },
  { direction: "top right", dx: 59.4, dy: 42, x: 0.3, y: 0.4, width: 0.5, height: 0.3 },
  { direction: "right", dx: 59.4, dy: 42, x: 0.3, y: 0.3, width: 0.5, height: 0.4 },
  { direction: "bottom right", dx: 59.4, dy: 42, x: 0.3, y: 0.3, width: 0.5, height: 0.5 },
  { direction: "bottom", dx: 59.4, dy: 42, x: 0.3, y: 0.3, width: 0.4, height: 0.5 },
  { direction: "bottom left", dx: 59.4, dy: 42, x: 0.4, y: 0.3, width: 0.3, height: 0.5 },
  { direction: "left", dx: 59.4, dy: 42, x: 0.4, y: 0.3, width: 0.3, height: 0.4 },
])("previews and persists a Photo Slot resize from $direction", async ({ direction, dx, dy, ...expected }) => {
  const { ports, files } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const handles = within(slot).getAllByRole("button", { name: /^Resize / });
  expect(handles).toHaveLength(8);
  const label = direction === "bottom right" ? "Resize Page 1 Photo Slot 1" : `Resize Page 1 Photo Slot 1 from ${direction}`;
  fireEvent.mouseDown(screen.getByRole("button", { name: label }), { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 100 + dx / 2, clientY: 100 + dy / 2, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy, ctrlKey: true });
  expect(parseFloat(slot.style.width)).toBeCloseTo(expected.width * 594, 9);
  expect(parseFloat(slot.style.height)).toBeCloseTo(expected.height * 420, 9);
  fireEvent.mouseUp(window, { clientX: 100 + dx, clientY: 100 + dy, ctrlKey: true });
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    for (const key of ["x", "y", "width", "height"] as const) expect(saved[key]).toBeCloseTo(expected[key], 9);
  });
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(parseFloat(slot.style.width)).toBeCloseTo(0.4 * 594, 9);
  expect(parseFloat(slot.style.height)).toBeCloseTo(0.4 * 420, 9);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(parseFloat(slot.style.width)).toBeCloseTo(expected.width * 594, 9);
});

it.each([0, 90, 180, 270] as const)("resizes a %d-degree Text Slot from a corner while preserving its reflow anchor", async (rotation) => {
  const { ports, files } = disk();
  let album = setSlotText(addTextSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1"),
    "page-1", "slot-1", "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  for (let turn = 0; turn < rotation; turn += 90) album = rotateSlot(album, "page-1", "slot-1", 90);
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial"] }}
    document={{ path: "Existing", album }} />);
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  const sideways = rotation === 90 || rotation === 270;
  expect(within(slot).getAllByRole("button", { name: /^Resize / })).toHaveLength(6);
  expect(within(slot).queryByRole("button", { name: `Resize Page 1 Text Slot 1 from ${sideways ? "left" : "top"}` })).toBeNull();
  const before = {
    left: parseFloat(slot.style.left), top: parseFloat(slot.style.top),
    width: parseFloat(slot.style.width), height: parseFloat(slot.style.height),
  };
  const dx = sideways ? 80 : before.width / 2;
  const dy = sideways ? before.height / 2 : 80;
  fireEvent.mouseDown(screen.getByRole("button", { name: "Resize Page 1 Text Slot 1 from top left" }),
    { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy, ctrlKey: true });
  fireEvent.mouseUp(window, { clientX: 100 + dx, clientY: 100 + dy, ctrlKey: true });
  const after = {
    left: parseFloat(slot.style.left), top: parseFloat(slot.style.top),
    width: parseFloat(slot.style.width), height: parseFloat(slot.style.height),
  };
  expect(sideways ? after.height : after.width).toBeCloseTo((sideways ? before.height : before.width) / 2, 9);
  expect(sideways ? after.top + after.height : after.left + after.width)
    .toBeCloseTo(sideways ? before.top + before.height : before.left + before.width, 9);
  expect(sideways ? after.width : after.height).toBeCloseTo((sideways ? before.width : before.height) * 2, 9);
  if (rotation === 90) expect(after.left + after.width).toBeCloseTo(before.left + before.width, 9);
  else if (rotation === 180) expect(after.top + after.height).toBeCloseTo(before.top + before.height, 9);
  else expect(sideways ? after.left : after.top).toBeCloseTo(sideways ? before.left : before.top, 9);
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(saved.width * 594).toBeCloseTo(after.width, 9);
    expect(saved.height * 420).toBeCloseTo(after.height, 9);
  });
});

it("snaps a top-left resize on both axes, toggles Ctrl and cancels without changing the Album", () => {
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  onAlbumChange.mockClear();
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const before = { left: slot.style.left, top: slot.style.top, width: slot.style.width, height: slot.style.height };
  const dx = (5 / 297 - 0.3) * 594 + 3;
  const dy = (5 / 210 - 0.3) * 420 + 3;
  fireEvent.mouseDown(screen.getByRole("button", { name: "Resize Page 1 Photo Slot 1 from top left" }),
    { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });
  expect(screen.getAllByLabelText("Snap to Safe Zone")).toHaveLength(2);
  expect(parseFloat(slot.style.width)).toBeCloseTo((0.7 - 5 / 297) * 594, 9);
  expect(parseFloat(slot.style.height)).toBeCloseTo((0.7 - 5 / 210) * 420, 9);
  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  expect(screen.queryByLabelText("Snap to Safe Zone")).toBeNull();
  expect(parseFloat(slot.style.width)).toBeCloseTo((0.7 - 5 / 297) * 594 - 3, 9);
  fireEvent.keyUp(window, { key: "Control" });
  expect(screen.getAllByLabelText("Snap to Safe Zone")).toHaveLength(2);
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.mouseUp(window, { clientX: 100 + dx, clientY: 100 + dy });
  expect(slot.style.left).toBe(before.left);
  expect(slot.style.top).toBe(before.top);
  expect(slot.style.width).toBe(before.width);
  expect(slot.style.height).toBe(before.height);
  expect(onAlbumChange).not.toHaveBeenCalled();
});

it("fits Text Slot height to its content and persists growth and shrinkage", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.change(editor, { target: { value: "One\nTwo\nThree\nFour" } });
  expect(parseFloat(slot.style.height)).toBeCloseTo(60.96);
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].height).toBeCloseTo(60.96 / 420));
  fireEvent.change(editor, { target: { value: "One" } });
  expect(parseFloat(slot.style.height)).toBeCloseTo(15.24);
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].height).toBeCloseTo(15.24 / 420));
});

it("shows a Text Slot's style controls in the command bar with presets and an exact point size", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const controls = bar().getByRole("group", { name: "Text Slot tools" });
  expect(within(screen.getByRole("group", { name: "Spread editor" })).queryByLabelText("Font family")).toBeNull();
  expect(within(controls).getByLabelText("Font family")).toBeTruthy();
  fireEvent.change(within(controls).getByLabelText("Font size"), { target: { value: "36" } });
  fireEvent.change(within(controls).getByLabelText("Font size"), { target: { value: "custom" } });
  fireEvent.change(within(controls).getByLabelText("Font size (pt)"), { target: { value: "22.5" } });
  fireEvent.keyDown(within(controls).getByLabelText("Font size (pt)"), { key: "Enter" });
  fireEvent.click(within(controls).getByRole("button", { name: "Underline" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0]).toMatchObject({
    style: { fontSize: 22.5, underline: true },
  }));
});

it("toggles whole-box formatting with standard shortcuts while editing and selecting text", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  fireEvent.change(editor, { target: { value: "Caption" } });
  for (const key of ["b", "i", "u"]) {
    const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
    fireEvent(editor, event);
    expect(event.defaultPrevented).toBe(true);
  }
  const tools = within(bar().getByRole("group", { name: "Text Slot tools" }));
  for (const [name, shortcut] of [["Bold", "B"], ["Italic", "I"], ["Underline", "U"]]) {
    const button = tools.getByRole("button", { name });
    expect([button.getAttribute("aria-pressed"), button.title, button.getAttribute("aria-keyshortcuts")])
      .toEqual(["true", `${name} (Ctrl+${shortcut})`, `Control+${shortcut}`]);
  }
  expect(tools.queryByText("Format")).toBeNull();
  expect((editor as HTMLTextAreaElement).style.textDecoration).toBe("underline");
  fireEvent.keyDown(editor, { key: "Escape" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Page 1 Text Slot 1" }), { key: "b", metaKey: true });
  fireEvent.keyDown(bar().getByRole("group", { name: "Text Slot tools" }), { key: "i", ctrlKey: true });
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0]).toMatchObject({
    text: "Caption", style: { bold: false, italic: false, underline: true },
  }));
});

it("edits a Text Slot in place and persists its content and styling", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial", "Georgia"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const text = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  fireEvent.change(text, { target: { value: "Hello\nworld" } });
  fireEvent.change(await screen.findByLabelText("Font family"), { target: { value: "Georgia" } });
  fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "24" } });
  fireEvent.change(screen.getByLabelText("Text colour"), { target: { value: "#123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Bold" }));
  fireEvent.click(screen.getByRole("button", { name: "Italic" }));
  fireEvent.click(screen.getByRole("button", { name: "Align centre" }));
  expect(screen.getByRole("button", { name: "Align centre" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Align left" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByLabelText("Text alignment")).toBeNull();
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!);
    expect(saved.pages[0].slots[0]).toMatchObject({
      type: "text", text: "Hello\nworld",
      style: { fontFamily: "Georgia", fontSize: 24, color: "#123456", bold: true, italic: true, align: "center" },
    });
  });
});

it("warns when even one character is wider than a Text Slot without shrinking its font", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { target: { value: "W" } });
  drag(screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" }), -225.72, 0);
  setExactFontSize("100");
  expect(screen.getByText("Text overflows Slot")).toBeTruthy();
  expect((screen.getByLabelText("Font size (pt)") as HTMLInputElement).value).toBe("100");
  setExactFontSize("18");
  expect(screen.queryByText("Text overflows Slot")).toBeNull();
});

it("moves and width-resizes Text Slots while retaining fitted height and keyboard editing", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const edit = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  fireEvent.change(edit, { target: { value: "One\nTwo\nThree\nFour\nFive\nSix\nSeven\nEight\nNine\nTen\nEleven\nTwelve" } });
  expect(screen.queryByText("Text overflows Slot")).toBeNull();
  drag(screen.getByRole("button", { name: "Move Page 1 Text Slot 1" }), 59.4, 42);
  drag(screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" }), 59.4, 100);
  expect(screen.queryByText("Text overflows Slot")).toBeNull();
  fireEvent.keyDown(edit, { key: "Escape" });
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.keyDown(slot, { key: "Enter" });
  expect(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" })).toBeTruthy();
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(saved.x).toBeCloseTo(0.4);
    expect(saved.y).toBeCloseTo(0.4);
    expect(saved.width).toBeCloseTo(0.5);
    expect(saved.height).toBeCloseTo(182.88 / 420);
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete Slot" }));
  expect(screen.queryByRole("button", { name: "Page 1 Text Slot 1" })).toBeNull();
});

it("snaps a Text Slot's width to the Safe Zone after releasing Ctrl", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { target: { value: "One\nTwo" } });

  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  const handle = screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" });
  const safeRight = 1 - 5 / 297;
  const endX = 100 + (safeRight - 0.7) * 594 + 3;
  fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: endX, clientY: 180, ctrlKey: true });
  expect(parseFloat(slot.style.width)).toBeCloseTo((safeRight - 0.3) * 594 + 3);
  expect(screen.queryByLabelText("Snap to Safe Zone")).toBeNull();

  fireEvent.keyUp(window, { key: "Control", ctrlKey: false });
  expect(parseFloat(slot.style.width)).toBeCloseTo((safeRight - 0.3) * 594);
  expect(parseFloat(slot.style.height)).toBeCloseTo(30.48);
  expect(screen.getByLabelText("Snap to Safe Zone")).toBeTruthy();
  fireEvent.mouseUp(window, { clientX: endX, clientY: 180 });
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(saved.width).toBeCloseTo(safeRight - 0.3, 9);
    expect(saved.y).toBeCloseTo(0.3, 9);
    expect(saved.height).toBeCloseTo(30.48 / 420, 9);
  });
});

it("does not resize or snap a Text Slot when its handle moves only vertically", async () => {
  const { ports, files } = disk();
  const album = addTextSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  album.pages[0].slots[0].width = 1 - 5 / 297 - 0.3 + 3 / 594;
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));

  const slot = await screen.findByRole("button", { name: "Page 1 Text Slot 1" });
  const width = parseFloat(slot.style.width);
  const handle = screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" });
  fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100, clientY: 150 });
  expect(parseFloat(slot.style.width)).toBeCloseTo(width);
  expect(screen.queryByLabelText("Snap to Safe Zone")).toBeNull();
  fireEvent.mouseUp(window, { clientX: 100, clientY: 150 });
});

it("keeps growing beyond the Page with a warning and clears it after text shrinks", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  fireEvent.change(editor, { target: { value: Array(30).fill("Line").join("\n") } });
  expect(screen.getByText("Text extends beyond Page")).toBeTruthy();
  await waitFor(() => {
    const slot = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(slot.height).toBeCloseTo(457.2 / 420);
    expect(slot.y).toBe(0.3);
  });
  fireEvent.change(editor, { target: { value: "Line" } });
  expect(screen.queryByText("Text extends beyond Page")).toBeNull();
});

it("reflows text when its width or point size changes and retains that layout after reopening", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { target: { value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" } });
  const resize = screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" });
  expect(resize.classList.contains("slot-resize-handle--text")).toBe(true);
  drag(resize, -118.8, 100);
  expect(parseFloat(screen.getByRole("button", { name: "Page 1 Text Slot 1" }).style.height)).toBeCloseTo(30.48);
  fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "36" } });
  await waitFor(() => {
    const slot = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(slot.width).toBeCloseTo(0.2);
    expect(slot).toMatchObject({ style: { fontSize: 36 } });
  });
  const height = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].height;
  expect(height).toBeCloseTo(121.92 / 420);
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(parseFloat(screen.getByRole("button", { name: "Page 1 Text Slot 1" }).style.height)).toBeCloseTo(121.92));
});

it("shows invalid exact point sizes without changing the Text Slot", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  setExactFontSize("0");
  expect(screen.getByRole("alert").textContent).toContain("between 1 and 1000 pt");
  expect((screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }) as HTMLTextAreaElement).style.fontSize).toBe("12.7px");
  setExactFontSize("22.5");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("reports system font discovery failures and retries without losing text", async () => {
  const { ports } = disk();
  const list = vi.fn().mockRejectedValueOnce(new Error("Font service unavailable")).mockResolvedValue(["Arial", "Georgia"]);
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const edit = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  fireEvent.change(edit, { target: { value: "Caption" } });
  expect((await screen.findByRole("alert")).textContent).toContain("Font service unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry fonts" }));
  await waitFor(() => expect(within(screen.getByLabelText("Font family")).getByRole("option", { name: "Georgia" })).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
  expect((edit as HTMLTextAreaElement).value).toBe("Caption");
});

it("does not highlight or replace a Text Slot when dragging a Photo", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { target: { value: "Caption" } });
  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  const drop = photoDrop({ path: "a.jpg", width: 100, height: 100, orientation: 1 });
  fireEvent.dragStart(window, drop);
  expect(slot.classList.contains("slot-overlay--dragging")).toBe(false);
  fireEvent.dragOver(slot, drop);
  fireEvent.drop(slot, drop);
  expect((screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }) as HTMLTextAreaElement).value).toBe("Caption");
  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 1" })).toBeNull();
});

it("clears Text Slot selection when switching Pages with identically named Slots", async () => {
  const { ports, files } = disk();
  let album = createAlbum({ name: "Existing", pageCount: 2 });
  album = addTextSlot(addTextSlot(album, "page-1"), "page-2");
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  const firstSlot = await screen.findByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.click(firstSlot);
  fireEvent.doubleClick(firstSlot);
  expect(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  expect(screen.getByRole("button", { name: "Page 2 Text Slot 1" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByLabelText("Font family")).toBeNull();
});

it("keeps in-place text editing available while an earlier autosave is in flight", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const edit = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }) as HTMLTextAreaElement;
  const write = vi.mocked(ports.write).getMockImplementation()!;
  let finishWrite: () => void = () => {};
  const firstWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
  vi.mocked(ports.write).mockImplementationOnce(async (...args) => { await firstWrite; await write(...args); });
  vi.useFakeTimers();
  edit.focus();
  fireEvent.change(edit, { target: { value: "First" } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(edit.disabled).toBe(false);
  expect(document.activeElement).toBe(edit);
  fireEvent.change(edit, { target: { value: "First and second" } });
  await act(async () => { finishWrite(); await firstWrite; });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0]).toMatchObject({ text: "First and second" });
});

it("finishes text editing when a Photo Slot is added", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  expect(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  expect(screen.queryByRole("textbox", { name: "Edit Page 1 Text Slot 1" })).toBeNull();
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }).getAttribute("aria-pressed")).toBe("true");
});

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
  expect(within(canvas).getByText("Inside cover")).toBeTruthy();
  expect(within(canvas).getByRole("button", { name: "Select Page 2" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("PAGE 2 OF 2")).toBeTruthy();
});

it("keeps print settings in Album settings, validates them, and persists changes", async () => {
  const { ports } = disk();
  render(<MenuHarness root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  fireEvent.change(screen.getByLabelText("Bleed left/right (mm)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Bleed top/bottom (mm)"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Safe Zone left/right (mm)"), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("Safe Zone top/bottom (mm)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Export resolution (DPI)"), { target: { value: "600" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await waitForAutosave();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.queryByLabelText("Bleed left/right (mm)")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  expect((screen.getByLabelText("Bleed left/right (mm)") as HTMLInputElement).value).toBe("4");
  expect((screen.getByLabelText("Bleed top/bottom (mm)") as HTMLInputElement).value).toBe("2");
  expect((screen.getByLabelText("Safe Zone left/right (mm)") as HTMLInputElement).value).toBe("7");
  expect((screen.getByLabelText("Safe Zone top/bottom (mm)") as HTMLInputElement).value).toBe("4");
  expect((screen.getByLabelText("Export resolution (DPI)") as HTMLInputElement).value).toBe("600");
  fireEvent.change(screen.getByLabelText("Safe Zone top/bottom (mm)"), { target: { value: "105" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  expect(screen.getByRole("alert").textContent).toContain("Safe Zone");
  expect(screen.getByText("Safe Zone: 7 mm left/right, 4 mm top/bottom")).toBeTruthy();
});

it("keeps content-index statistics in collapsed Album settings diagnostics without editing the Album", async () => {
  const { ports } = disk();
  render(<MenuHarness root="D:\\Photos" ports={ports}
    contentIndexStats={{ hashedFiles: 4, hashedBytes: 1024, cacheHits: 6, elapsedMs: 12.5 }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  expect(screen.queryByText("Diagnostics")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  const summary = screen.getByText("Diagnostics");
  expect(summary.closest("details")?.open).toBe(false);
  expect(summary.closest("details")?.textContent).toContain("4 files hashed (1,024 bytes), 6 cached; 12.5 ms indexing.");
  fireEvent.click(summary);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(ports.write).not.toHaveBeenCalled();
});

it("adds and duplicates Spreads, selects the result, and reopens saved Pages", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Insert Spread before Spread 2" }));
  expect(screen.getByText("PAGE 2 OF 4")).toBeTruthy();
  fireEvent.contextMenu(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate Page onto New Spread" }));
  expect(screen.getByText("PAGE 4 OF 6")).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(500));
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.getByText(/ OF 6$/)).toBeTruthy());
  expect(screen.getByText("PAGE 4 OF 6")).toBeTruthy();
});

it("duplicates the first and last Pages onto their respective sides of new Spreads", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing" }) }} />);
  const strip = within(screen.getByRole("navigation", { name: "Spreads" }));
  fireEvent.contextMenu(strip.getByRole("button", { name: "Select Page 1" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate Page onto New Spread" }));
  expect(screen.getByText("PAGE 3 OF 4")).toBeTruthy();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.contextMenu(strip.getByRole("button", { name: "Select Page 4" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate Page onto New Spread" }));
  expect(screen.getByText("PAGE 4 OF 6")).toBeTruthy();
});

it("drag-reorders Pages, keeps the moved Page selected, and persists the order", async () => {
  const { ports, files } = disk();
  files.set("Existing", serializeAlbum(createAlbum({ name: "Existing", pageCount: 4 })));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
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
  await act(() => vi.advanceTimersByTimeAsync(500));
  vi.useRealTimers();
  const reopened = deserializeAlbum(await ports.read("D:\\Photos", "Existing"));
  expect(reopened.pages.map((page) => page.id)).toEqual(["page-2", "page-3", "page-4", "page-1"]);
  const before = serializeAlbum(reopened);
  fireEvent.drop(strip.getByRole("button", { name: "Select Page 1" }), { dataTransfer });
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(false);
  expect(serializeAlbum(deserializeAlbum(await ports.read("D:\\Photos", "Existing")))).toBe(before);
});

it("lists and opens existing Albums, then creates an A4 landscape Album without manual dimensions", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  expect(screen.getByText(/ OF 2$/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "New Album" }));
  expect(screen.getByLabelText("Page Format").textContent).toBe("A4 - landscape (297 x 210 mm)");
  expect(screen.queryByLabelText(/width|height/i)).toBeNull();
  expect((screen.getByLabelText("Page count") as HTMLInputElement).value).toBe("2");
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Christmas" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Album" }));
  await screen.findByRole("button", { name: "Open Album Christmas", current: "page" });
  const album = deserializeAlbum(files.get("Christmas")!);
  expect(album.pages).toHaveLength(2);
  expect(album.pageFormat.size).toBe("A4");
  expect(album.pageFormat.orientation).toBe("landscape");
});

it("debounces changes, blocks navigation until saved, and reopens the persisted Album", async () => {
  const { ports, files } = disk();
  const onBusyChange = vi.fn();
  render(<MenuHarness root={"D:\\Photos"} ports={ports} onBusyChange={onBusyChange} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText("Bleed left/right (mm)"), { target: { value: "4" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await act(() => vi.advanceTimersByTimeAsync(300));
  fireEvent.change(screen.getByLabelText("Bleed left/right (mm)"), { target: { value: "6" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  expect((screen.getByRole("button", { name: "New Album" }) as HTMLButtonElement).disabled).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(() => vi.advanceTimersByTimeAsync(499));
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm.x).toBe(3);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm.x).toBe(6);
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(false);
  expect(ports.write).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.queryByLabelText("Bleed left/right (mm)")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  await waitFor(() => expect((screen.getByLabelText("Bleed left/right (mm)") as HTMLInputElement).value).toBe("6"));
});

it("keeps unsaved changes after a failed save, prevents leaving, and retries explicitly", async () => {
  const { ports, files } = disk();
  const write = ports.write;
  ports.write = vi.fn().mockRejectedValueOnce(new Error("Disk full")).mockImplementation(write);
  render(<MenuHarness root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText("Bleed left/right (mm)"), { target: { value: "4" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(screen.getByRole("alert").textContent).toContain("Disk full");
  expect(screen.queryByText("Not saved")).toBeNull();
  expect((screen.getByRole("button", { name: "Insert Spread before Spread 2" }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(screen.getByRole("navigation", { name: "Spreads" }))
    .getByRole("button", { name: "Select Page 1" }).draggable).toBe(false);
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm.x).toBe(3);
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(true);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm.x).toBe(4);
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(false);
});

it("keeps the previous Album available when opening malformed JSON fails and does not overwrite duplicates", async () => {
  const { ports, files } = disk();
  files.set("Broken", "{");
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Open Album Broken" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Open Album Existing", current: "page" })).toBeTruthy();
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
  return {
    preview: vi.fn(async (_root: string, path: string) => `data:image/jpeg;base64,${btoa(path)}`),
    pageThumbnail: vi.fn(async (_root: string, path: string) => `data:image/png;base64,${btoa(path)}`),
  };
}

function drag(element: Element, dx: number, dy: number) {
  fireEvent.mouseDown(element, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + dx, clientY: 100 + dy });
  fireEvent.mouseUp(window, { clientX: 100 + dx, clientY: 100 + dy });
}

it("shows Photo Slot tools in the command bar and zooms the Crop in 10% steps", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitForAutosave();
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  const toolbar = within(bar().getByRole("group", { name: "Photo Slot tools" }));
  expect(within(screen.getByRole("region", { name: "Album Pages" })).queryByRole("button", { name: "Zoom in" })).toBeNull();
  for (const name of ["Zoom out", "Zoom in", "Rotate Slot counterclockwise", "Rotate Slot clockwise", "Delete Slot"]) {
    expect(toolbar.getByRole("button", { name })).toBeTruthy();
  }
  fireEvent.click(toolbar.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop.width)
    .toBeCloseTo(before.width / 1.1));
  const fit = toolbar.getByRole("button", { name: "Fit Photo" });
  expect(fit.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(fit);
  expect(toolbar.getByRole("button", { name: "Fit Photo" }).getAttribute("aria-pressed")).toBe("true");
  expect(toolbar.queryByRole("button", { name: "Zoom in" })).toBeNull();
  expect(toolbar.queryByRole("button", { name: "Zoom out" })).toBeNull();
});

/** Sends a Ctrl key press and reports whether something handled it. */
function pressCtrl(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { ctrlKey: true, bubbles: true, cancelable: true, ...init });
  fireEvent(target, event);
  return event.defaultPrevented;
}

it("zooms the Crop with Ctrl+Plus and Ctrl+Minus and rotates the Slot with Ctrl+Left and Ctrl+Right", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitForAutosave();
  const width = () => deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop.width;
  const before = width();
  const press = (init: KeyboardEventInit) => pressCtrl(document.body, init);

  expect(press({ key: "+" })).toBe(true);
  expect(press({ key: "=" })).toBe(true);
  expect(press({ key: "+", code: "NumpadAdd" })).toBe(true);
  await waitFor(() => expect(width()).toBeCloseTo(before / 1.1 ** 3));
  expect(press({ key: "-" })).toBe(true);
  expect(press({ key: "-", code: "NumpadSubtract" })).toBe(true);
  await waitFor(() => expect(width()).toBeCloseTo(before / 1.1));
  const toolbar = within(bar().getByRole("group", { name: "Photo Slot tools" }));
  expect(toolbar.getByRole("button", { name: "Zoom in" }).getAttribute("aria-keyshortcuts")).toBe("Control+Plus");
  expect(toolbar.getByRole("button", { name: "Zoom out" }).title).toBe("Zoom out (Ctrl+Minus)");

  expect(press({ key: "ArrowRight" })).toBe(true);
  expect(document.querySelector('[data-slot-rotation="90"]')).not.toBeNull();
  expect(press({ key: "ArrowLeft" })).toBe(true);
  expect(press({ key: "ArrowLeft" })).toBe(true);
  expect(document.querySelector('[data-slot-rotation="270"]')).not.toBeNull();
  const rotateLeft = toolbar.getByRole("button", { name: "Rotate Slot counterclockwise" });
  expect([rotateLeft.title, rotateLeft.getAttribute("aria-keyshortcuts")]).toEqual(["Rotate left (Ctrl+Left)", "Control+ArrowLeft"]);

  // With Fit on, the Crop can't zoom.
  fireEvent.click(toolbar.getByRole("button", { name: "Fit Photo" }));
  await waitForAutosave();
  const fitted = files.get("Existing");
  expect(press({ key: "+" })).toBe(false);
  expect(files.get("Existing")).toBe(fitted);
});

it("leaves Slot shortcuts to text fields and dialogs", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" });
  expect(pressCtrl(editor, { key: "ArrowRight" })).toBe(false);
  expect(document.querySelector('[data-slot-rotation="90"]')).toBeNull();
  fireEvent.keyDown(editor, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  expect(pressCtrl(document.body, { key: "ArrowRight" })).toBe(false);
  expect(document.querySelector('[data-slot-rotation="90"]')).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(pressCtrl(document.body, { key: "ArrowRight" })).toBe(true);
  expect(document.querySelector('[data-slot-rotation="90"]')).not.toBeNull();
});

it("leaves Fit and Zoom out of Photo Slot tools where Slots hold no content, as in Layout mode", () => {
  render(<PhotoSlotTools fit={false} content={false} disabled={false}
    onFit={vi.fn()} onZoom={vi.fn()} onRotate={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")))
    .toEqual(["Rotate Slot counterclockwise", "Rotate Slot clockwise", "Delete Slot"]);
});

it("removes the Slot's tools from the command bar when the selection is cleared", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  expect(bar().getByRole("group", { name: "Photo Slot tools" })).toBeTruthy();
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  expect(bar().queryByRole("group", { name: "Photo Slot tools" })).toBeNull();
});

it("shows Rotate and Delete with a selected Text Slot's tools in the command bar", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const toolbar = within(bar().getByRole("group", { name: "Text Slot tools" }));
  expect(toolbar.getByLabelText("Font family")).toBeTruthy();
  fireEvent.click(toolbar.getByRole("button", { name: "Rotate Slot clockwise" }));
  expect(document.querySelector('[data-slot-rotation="90"]')).not.toBeNull();
  expect(toolbar.getByRole("button", { name: "Rotate Slot counterclockwise" })).toBeTruthy();
  expect(toolbar.getByRole("button", { name: "Delete Slot" })).toBeTruthy();
});

it("keeps focus and selection in the text being edited while its style changes from the command bar", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial", "Georgia"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: "Caption" } });
  editor.focus();
  editor.setSelectionRange(2, 5);
  const toolbar = within(bar().getByRole("group", { name: "Text Slot tools" }));

  for (const name of ["Bold", "Underline", "Align right", "Rotate Slot clockwise"]) {
    const button = toolbar.getByRole("button", { name });
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fireEvent(button, press);
    expect(press.defaultPrevented).toBe(true);
  }

  const family = await toolbar.findByRole("option", { name: "Georgia" }).then(() => toolbar.getByLabelText("Font family"));
  family.focus();
  fireEvent.change(family, { target: { value: "Georgia" } });
  expect(document.activeElement).toBe(editor);
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 5]);
  expect(editor.style.fontFamily).toBe("Georgia");

  fireEvent.click(toolbar.getByRole("button", { name: "Bold" }));
  fireEvent.click(toolbar.getByRole("button", { name: "Align right" }));
  expect(document.activeElement).toBe(editor);
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 5]);
  expect([editor.style.fontWeight, editor.style.textAlign]).toEqual(["bold", "right"]);
});

it("pans with the centred crop handle while dragging elsewhere moves the Slot", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  expect(screen.queryByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" })).toBeNull();
  fireEvent.drop(slot, photoDrop({ path: "a.jpg", width: 6000, height: 6000, orientation: 1 }));
  const handle = screen.getByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" });
  expect(handle.textContent).toBe("✥");
  expect(screen.queryByRole("checkbox", { name: "Crop photo" })).toBeNull();
  await waitForAutosave();
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
  drag(handle, 0, 10);
  await waitForAutosave();
  const panned = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
  expect(panned).toMatchObject({ x: before.x, y: before.y });
  expect(panned.placement!.crop.y).toBeCloseTo(before.placement!.crop.y - before.placement!.crop.height * 0.1);
  drag(slot, 59.4, 0);
  await waitForAutosave();
  const moved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
  expect(moved.x).toBeCloseTo(before.x + 0.1);
  expect(moved.placement!.crop).toEqual(panned.placement!.crop);
  fireEvent.click(screen.getByRole("button", { name: "Fit Photo" }));
  expect(screen.queryByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" })).toBeNull();
});

it("deletes the selected Slot from the toolbar or Delete key without asking, but not while its text is edited", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { key: "Delete" });
  expect(screen.getByRole("button", { name: "Page 1 Text Slot 1" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.click(bar().getByRole("button", { name: "Delete Slot" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Text Slot 1" }));
  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Page 1 Text Slot 1" })).toBeNull();
});

it("adds Slots where an empty part of a Page is right-clicked", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  const page = within(await screen.findByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  await waitFor(() => expect(page.style.width).toBe("606px"));
  // The Page's Bleed is 6 px, so these points are trim fractions (0.5, 0.2) and (0.2, 0.5).
  fireEvent.contextMenu(page, { clientX: 303, clientY: 90 });
  fireEvent.click(screen.getByRole("menuitem", { name: "Add Photo Slot" }));
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.contextMenu(page, { clientX: 124.8, clientY: 216 });
  fireEvent.click(screen.getByRole("menuitem", { name: "Add Text Slot" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 2" }), { key: "Escape" });
  await waitForAutosave();
  const [photo, text] = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  expect(photo).toMatchObject({ type: "photo", x: 0.3, width: 0.4 });
  expect(photo.y).toBeCloseTo(0);
  expect(text.type).toBe("text");
  expect(text.x).toBeCloseTo(0);
  expect(text.y + text.height / 2).toBeCloseTo(0.5);
});

it("selects a right-clicked Slot and offers its toolbar actions", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.contextMenu(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }));
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const photo = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.drop(photo, photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  const text = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.contextMenu(text);
  expect(text.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("menuitemcheckbox", { name: "Fit" })).toBeNull();
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent))
    .toEqual(["Copy Slot", "Paste Slot", "Rotate left", "Rotate right", "Delete", "Apply grid layout..."]);
  fireEvent.contextMenu(photo);
  expect(photo.getAttribute("aria-pressed")).toBe("true");
  const fit = screen.getByRole("menuitemcheckbox", { name: "Fit" });
  expect(fit.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(fit);
  fireEvent.contextMenu(photo);
  fireEvent.click(screen.getByRole("menuitem", { name: "Rotate right" }));
  await waitForAutosave();
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[1]).toMatchObject({ rotation: 90, placement: { fit: true } });
  fireEvent.contextMenu(photo);
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
});


it("runs command bar commands on the open Album and reports Slot selection", async () => {
  const { ports } = disk();
  const onSlotSelectedChange = vi.fn();
  render(<MenuHarness root="D:\\Photos" ports={ports} bar={{ onSlotSelectedChange }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  expect(screen.queryByRole("button", { name: "Album settings" })).toBeNull();
  expect(onSlotSelectedChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  expect(onSlotSelectedChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(bar().getByRole("button", { name: "Delete Slot" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 1" })).toBeNull());
  expect(onSlotSelectedChange).toHaveBeenLastCalledWith(false);
  await waitForAutosave();
  fireEvent.click(screen.getByRole("button", { name: "Bar add-spread" }));
  expect(screen.getByText(/ OF 4$/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  const settings = within(screen.getByRole("dialog", { name: "Album settings" }));
  fireEvent.click(settings.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("adds Photo and Text Slots to the selected Page from the command bar", () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports}
    document={{ path: "Existing", album: createAlbum({ name: "Existing", pageCount: 4 }) }} />);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Text Slot" }));
  expect(screen.getByRole("button", { name: "Page 3 Photo Slot 1" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Page 3 Text Slot 2" })).toBeTruthy();
});

it("leaves the Delete key alone while another mode is shown, but still opens Album settings", async () => {
  const { ports } = disk();
  const props = { root: "D:\\Photos", ports, document: { path: "Existing", album: createAlbum({ name: "Existing" }) } };
  const { rerender } = render(<div><AlbumWorkspace {...props} /></div>);
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  rerender(<div hidden><AlbumWorkspace {...props} active={false} /></div>);
  fireEvent.keyDown(window, { key: "Delete" });
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 1", hidden: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings", hidden: true }));
  expect(screen.getByRole("dialog", { name: "Album settings" }).closest("[hidden]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  rerender(<div><AlbumWorkspace {...props} active /></div>);
  fireEvent.keyDown(window, { key: "Delete" });
  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 1" })).toBeNull();
});

it("reports Album commands as available while an autosave is pending, but not while it is written or failed", async () => {
  const { ports } = disk();
  let finishWrite: () => void = () => {};
  let failWrite: (cause: Error) => void = () => {};
  ports.write = vi.fn(() => new Promise<void>((resolve, reject) => { finishWrite = resolve; failWrite = reject; }));
  const onEditableChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} bar={{ onEditableChange }}
    document={{ path: "Existing", album: createAlbum({ name: "Existing" }) }} />);
  expect(onEditableChange).toHaveBeenLastCalledWith(true);
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  expect(onEditableChange).toHaveBeenLastCalledWith(true);
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(onEditableChange).toHaveBeenLastCalledWith(false);
  await act(async () => finishWrite());
  expect(onEditableChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "Add Text Slot" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  await act(async () => failWrite(new Error("Disk full")));
  expect(onEditableChange).toHaveBeenLastCalledWith(false);
});

it.each(["ready", "pending", "error"] as const)("uses the shared %s duplicate check when Alt-placing a Photo", (status) => {
  vi.stubGlobal("DragEvent", MouseEvent);
  const { ports } = disk();
  const album = placePhoto(addPhotoSlot(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1"),
    "page-1", "slot-1", { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  const photoIdentities = new Map([
    ["a.jpg", { path: "a.jpg", status: "ready" as const, hash: "same" }],
    ["copy.jpg", status === "ready" ? { path: "copy.jpg", status, hash: "same" }
      : status === "error" ? { path: "copy.jpg", status, message: "Access denied" } : { path: "copy.jpg", status }],
  ]);
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} photoIdentities={photoIdentities}
    document={{ path: "Existing", album }} />);
  const target = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.drop(target, { ...photoDrop({ path: "copy.jpg", width: 6000, height: 4000, orientation: 1 }), altKey: true });
  if (status === "ready") expect(screen.getByText("copy.jpg is already used in this Album.")).toBeTruthy();
  else expect(screen.getByText(/copy.jpg was placed; duplicate check pending/)).toBeTruthy();
  expect(target.getAttribute("title")).toBe("copy.jpg");
});

it("warns on a renamed filesystem alias without rewriting the original Placement path", async () => {
  const { ports, files } = disk();
  const album = placePhoto(addPhotoSlot(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1"),
    "page-1", "slot-1", { path: "Photo.jpg", width: 6000, height: 4000, orientation: 1 });
  const photoIdentities = new Map([
    ["Photo.jpg", { path: "Photo.jpg", status: "ready" as const, hash: "same-file" }],
    ["photo.jpg", { path: "photo.jpg", status: "ready" as const, hash: "same-file" }],
  ]);
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} photoIdentities={photoIdentities}
    document={{ path: "Existing", album }} />);
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }),
    photoDrop({ path: "photo.jpg", width: 6000, height: 4000, orientation: 1 }));
  expect(screen.getByText("photo.jpg is already used in this Album.")).toBeTruthy();
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots.map((slot) => slot.placement?.photoPath))
    .toEqual(["Photo.jpg", "photo.jpg"]));
});

it("Alt-drags a populated Slot without moving the original and commits one undoable duplicate", async () => {
  const { ports, files } = disk();
  const album = rotateSlot(placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"),
    "page-1", "slot-1", { path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }), "page-1", "slot-1", 90);
  const original = album.pages[0].slots[0];
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    document={{ path: "Existing", album }} />);
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  const slot = editor.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const left = slot.style.left;
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100, altKey: true, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 160, clientY: 150, altKey: false, ctrlKey: true });
  expect(slot.style.left).toBe(left);
  expect(editor.getByRole("button", { name: "Page 1 Photo Slot 2" })).toBeTruthy();
  expect(ports.write).not.toHaveBeenCalled();
  fireEvent.mouseUp(window, { clientX: 160, clientY: 150, ctrlKey: true });
  expect(editor.getByRole("button", { name: "Page 1 Photo Slot 2" }).getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => {
    const slots = deserializeAlbum(files.get("Existing")!).pages[0].slots;
    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual(original);
    expect(slots[1]).toEqual({ ...original, id: "slot-2", x: original.x + 60 / 594, y: original.y + 50 / 420 });
  });
  expect(photoUsage(deserializeAlbum(files.get("Existing")!)).get("tree.jpg")).toBe(2);
  expect(screen.queryByText(/already used/)).toBeNull();
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(editor.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(editor.getByRole("button", { name: "Page 1 Photo Slot 2" })).toBeTruthy();
});

it("shows the loaded Photo immediately in a duplicate preview without waiting for another image load", async () => {
  const images: { onload: (() => void) | null }[] = [];
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    src = "";
    constructor() { images.push(this); }
  });
  const { ports } = disk();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1", "slot-1",
    { path: "tree.jpg", width: 6000, height: 4000, orientation: 1 });
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    document={{ path: "Existing", album }} />);
  await waitFor(() => expect(images.length).toBeGreaterThan(0));
  act(() => images.forEach((image) => image.onload?.()));
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  expect(editor.getAllByAltText("Placement")).toHaveLength(1);
  fireEvent.mouseDown(editor.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: 150, clientY: 150 });
  expect(editor.getAllByAltText("Placement")).toHaveLength(2);
  fireEvent.keyDown(window, { key: "Escape" });
});

it.each(["Escape", "blur", "pointercancel", "click"] as const)(
  "discards an Alt duplicate on %s without saving or adding an undo step", (interruption) => {
    const { ports } = disk();
    const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
    render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
    const editor = within(screen.getByRole("group", { name: "Spread editor" }));
    fireEvent.mouseDown(editor.getByRole("button", { name: "Page 1 Photo Slot 1" }),
      { button: 0, clientX: 100, clientY: 100, altKey: true });
    if (interruption !== "click") {
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150 });
      expect(editor.getByRole("button", { name: "Page 1 Photo Slot 2" })).toBeTruthy();
    }
    if (interruption === "Escape") fireEvent.keyDown(window, { key: "Escape" });
    else if (interruption === "blur") fireEvent.blur(window);
    else if (interruption === "pointercancel") fireEvent(window, new Event("pointercancel"));
    fireEvent.mouseUp(window, { clientX: interruption === "click" ? 100 : 150, clientY: 100 });
    expect(editor.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
    expect(ports.write).not.toHaveBeenCalled();
    fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
    expect(editor.getByRole("button", { name: "Page 1 Photo Slot 1" })).toBeTruthy();
  },
);

it("shares the visible thumbnail and adopts the original's full Photo as it loads during duplication", async () => {
  const images: { src: string; onload: (() => void) | null }[] = [];
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    private url = "";
    constructor() { images.push(this); }
    get src() { return this.url; }
    set src(url: string) {
      this.url = url;
      if (url.startsWith("data:")) queueMicrotask(() => this.onload?.());
    }
  });
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  const photoPorts = previews();
  photoPorts.preview = vi.fn(async () => "preview:tree.jpg");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts}
    document={{ path: "Existing", album }} />);
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  const original = editor.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(original, photoDrop({
    path: "tree.jpg", width: 6000, height: 4000, orientation: 1,
  }, "data:image/png;base64,dGVzdA=="));
  await waitFor(() => expect(editor.getAllByAltText("Placement")).toHaveLength(1));
  fireEvent.mouseDown(original, { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: 150, clientY: 150 });
  expect(editor.getAllByAltText("Placement")).toHaveLength(2);
  expect(editor.getAllByAltText("Placement").map((image) => image.style.opacity)).toEqual(["0.45", "0.45"]);
  const primary = images.find((image) => image.src === "preview:tree.jpg");
  expect(primary).toBeTruthy();
  act(() => primary!.onload?.());
  expect(editor.getAllByAltText("Placement").map((image) => image.style.opacity)).toEqual(["1", "1"]);
  fireEvent.keyDown(window, { key: "Escape" });
});

it("latches Alt at drag start, snaps the duplicate to the original, and enforces Page bounds", () => {
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  const original = editor.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.mouseDown(original, { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: 104, clientY: 100 });
  const copy = editor.getByRole("button", { name: "Page 1 Photo Slot 2" });
  expect(copy.style.left).toBe(original.style.left);
  expect(screen.getAllByLabelText("Snap to Slot").length).toBeGreaterThan(0);
  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  expect(parseFloat(copy.style.left) - parseFloat(original.style.left)).toBeCloseTo(4);
  expect(screen.queryByLabelText("Snap to Slot")).toBeNull();
  fireEvent.keyUp(window, { key: "Control" });
  expect(copy.style.left).toBe(original.style.left);
  fireEvent.mouseMove(window, { clientX: 5000, clientY: 100 });
  const page = editor.getByRole("button", { name: "Select Page 1" });
  expect(parseFloat(copy.style.left) + parseFloat(copy.style.width)).toBeCloseTo(parseFloat(page.style.left) + parseFloat(page.style.width));
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.mouseDown(original, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 130, clientY: 100, altKey: true });
  expect(editor.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
  fireEvent.keyDown(window, { key: "Escape" });
});

it("Alt resizing still snaps and enforces minimum size without duplicating", () => {
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing" }), "page-1");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  const original = editor.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const handle = editor.getByRole("button", { name: "Resize Page 1 Photo Slot 1" });
  fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: 100 + 0.3 * 594 - 4, clientY: 100, altKey: true });
  expect(screen.getByLabelText("Snap to Page edge")).toBeTruthy();
  expect(editor.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull();
  fireEvent.mouseMove(window, { clientX: -5000, clientY: -5000, altKey: true });
  expect(parseFloat(original.style.width)).toBeGreaterThan(0);
  expect(parseFloat(original.style.height)).toBeGreaterThan(0);
  fireEvent.keyDown(window, { key: "Escape" });
});

it("snaps a Photo Slot to a nearby Page edge, shows a guide, and saves the position", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));

  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 - 0.3 * 594 + 4, clientY: 100 });

  expect(parseFloat(slot.style.left)).toBeCloseTo(parseFloat(page.style.left) + 6);
  expect(screen.getByLabelText("Snap to Page edge")).toBeTruthy();
  fireEvent.mouseUp(window, { clientX: 100 - 0.3 * 594 + 4, clientY: 100 });
  expect(screen.queryByLabelText("Snap to Page edge")).toBeNull();
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].x).toBeCloseTo(0);
  });
});

it("temporarily bypasses and restores snapping with Ctrl during a Slot drag", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));

  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  const trimLeft = parseFloat(page.style.left) + 6;
  const endX = 100 - 0.3 * 594 + 4;
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: endX, clientY: 100 });
  expect(parseFloat(slot.style.left)).toBeCloseTo(trimLeft);

  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  expect(parseFloat(slot.style.left)).toBeCloseTo(trimLeft + 4);
  expect(screen.queryByLabelText("Snap to Page edge")).toBeNull();
  fireEvent.keyUp(window, { key: "Control", ctrlKey: false });
  expect(parseFloat(slot.style.left)).toBeCloseTo(trimLeft);
  expect(screen.getByLabelText("Snap to Page edge")).toBeTruthy();

  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  fireEvent.mouseUp(window, { clientX: endX, clientY: 100, ctrlKey: true });
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].x).toBeCloseTo(4 / 594, 9);
  });
});

it("shows every aligned Slot edge and center during a drag and clears them with Ctrl", async () => {
  const { ports, files } = disk();
  const album = createAlbum({ name: "Existing", pageCount: 2 });
  album.pages[0].slots = [
    { id: "active", type: "photo", x: 0.125, y: 0.35, width: 0.125, height: 0.25, placement: null },
    { id: "reference", type: "photo", x: 0.625, y: 0.25, width: 0.125, height: 0.25, placement: null },
  ];
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));

  const slot = await screen.findByRole("button", { name: "Page 1 Photo Slot 1" });
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  const trimTop = parseFloat(page.style.top) + 6;
  const endY = 100 - 0.096 * 420;
  const guidePositions = () => screen.getAllByLabelText("Snap to Slot").map((guide) => {
    const line = guide.querySelector("line")!;
    expect(line.getAttribute("y1")).toBe(line.getAttribute("y2"));
    return Number(line.getAttribute("y1"));
  });
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100, clientY: endY });
  expect(guidePositions()).toEqual([trimTop + 105, trimTop + 157.5]);
  // The aligned bottom edge is at the Page centre, which labels that guide.
  expect(screen.getAllByLabelText("Snap to Page centre")).toHaveLength(1);

  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  expect(screen.queryByLabelText("Snap to Slot")).toBeNull();
  fireEvent.keyUp(window, { key: "Control", ctrlKey: false });
  expect(guidePositions()).toEqual([trimTop + 105, trimTop + 157.5]);
  fireEvent.mouseUp(window, { clientX: 100, clientY: endY });
  expect(screen.queryByLabelText("Snap to Slot")).toBeNull();
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].y).toBeCloseTo(0.25, 9);
  });
});

function ctrlClick(element: Element) {
  fireEvent.mouseDown(element, { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseUp(window, { clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.click(element, { ctrlKey: true });
}

async function openSelectedSlotsAlbum() {
  const { ports, files } = disk();
  const album = createAlbum({ name: "Existing", pageCount: 2 });
  album.pages[0].slots = [
    { id: "a", type: "photo", x: 0.1, y: 0.1, width: 0.2, height: 0.2, placement: null },
    { id: "b", type: "photo", x: 0.4, y: 0.1, width: 0.2, height: 0.2, placement: null },
    { id: "c", type: "photo", x: 0.7, y: 0.7, width: 0.1, height: 0.1, placement: null },
  ];
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  const slots = await Promise.all([1, 2, 3].map((number) => screen.findByRole("button", { name: `Page 1 Photo Slot ${number}` })));
  const saved = () => deserializeAlbum(files.get("Existing")!).pages[0].slots;
  return { slots, saved };
}

it("hides the Photo drag handle on Selected Slots while more than one is selected", async () => {
  const { slots: [a, b, c] } = await openSelectedSlotsAlbum();
  fireEvent.drop(a, photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.drop(b, photoDrop({ path: "b.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.drop(c, photoDrop({ path: "c.jpg", width: 6000, height: 4000, orientation: 1 }));
  const handle = (number: number) => screen.queryByLabelText(`Drag Photo from Page 1 Photo Slot ${number}`);
  fireEvent.click(a);
  ctrlClick(b);
  expect([handle(1), handle(2), handle(3)].map(Boolean)).toEqual([false, false, true]);
  ctrlClick(b);
  expect(handle(1)).not.toBeNull();
});

it("Ctrl-clicks Selected Slots and moves them together as one undo step, snapping to the Page centre", async () => {
  const { slots: [a, b, c], saved } = await openSelectedSlotsAlbum();
  ctrlClick(a);
  ctrlClick(b);
  expect([a, b, c].map((slot) => slot.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
  expect(screen.queryByRole("button", { name: "Delete Slot" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Resize Page 1/ })).toBeNull();

  // A plain drag of one Selected Slot moves both; their joint centre lands on the Page centre.
  fireEvent.mouseDown(b, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 129.7, clientY: 100 + 0.297 * 420 });
  expect(screen.getAllByLabelText("Snap to Page centre")).toHaveLength(1);
  fireEvent.mouseUp(window, { clientX: 129.7, clientY: 100 + 0.297 * 420 });
  fireEvent.click(b);
  await waitFor(() => expect(saved()[1].y).toBeCloseTo(0.4, 9));
  expect(saved()[0]).toMatchObject({ x: expect.closeTo(0.15, 9), y: expect.closeTo(0.4, 9) });
  expect(saved()[1].x).toBeCloseTo(0.45, 9);
  expect(saved()[2]).toMatchObject({ x: 0.7, y: 0.7 });
  expect([a, b].map((slot) => slot.getAttribute("aria-pressed"))).toEqual(["true", "true"]);

  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  await waitFor(() => expect(saved()[0]).toMatchObject({ x: 0.1, y: 0.1 }));
  expect(saved()[1]).toMatchObject({ x: 0.4, y: 0.1 });

  // A plain click selects only that Slot; Ctrl-click adds and removes.
  fireEvent.click(a);
  expect([a, b].map((slot) => slot.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  ctrlClick(b);
  ctrlClick(b);
  expect([a, b].map((slot) => slot.getAttribute("aria-pressed"))).toEqual(["true", "false"]);

  // Delete removes every Selected Slot in one undo step.
  ctrlClick(c);
  fireEvent.keyDown(window, { key: "Delete" });
  await waitFor(() => expect(saved().map((slot) => slot.id)).toEqual(["b"]));
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  await waitFor(() => expect(saved().map((slot) => slot.id)).toEqual(["a", "b", "c"]));
});

it("keeps the spacing of Selected Slots when the drag stops at the Bleed, and clears them from the Page", async () => {
  const { slots: [a, b], saved } = await openSelectedSlotsAlbum();
  fireEvent.click(a);
  ctrlClick(b);
  drag(a, -1000, 0);
  await waitFor(() => expect(saved()[0].x).toBeLessThan(0));
  expect(saved()[1].x - saved()[0].x).toBeCloseTo(0.3, 9);

  fireEvent.click(canvasPage(1));
  expect([a, b].map((slot) => slot.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
});

it("finishes a snapped Slot drag and clears guides on window focus loss", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));

  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 - 0.3 * 594 + 4, clientY: 100 });
  expect(screen.getByLabelText("Snap to Page edge")).toBeTruthy();
  fireEvent.blur(window);
  expect(screen.queryByLabelText("Snap to Page edge")).toBeNull();
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].x).toBeCloseTo(0, 9);
  });
});

it("ignores an unreachable snap target in favor of a reachable one when resizing", async () => {
  const { ports, files } = disk();
  const album = createAlbum({ name: "Existing", pageCount: 2 });
  album.pages[0].slots = [
    { id: "active", type: "photo", x: 0.3, y: 0.1, width: 0.3, height: 0.2, placement: null },
    { id: "unreachable", type: "photo", x: 0.317, y: 0.5, width: 0.1, height: 0.1, placement: null },
    { id: "reachable", type: "photo", x: 0.324, y: 0.75, width: 0.1, height: 0.1, placement: null },
  ];
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));

  const slot = await screen.findByRole("button", { name: "Page 1 Photo Slot 1" });
  const handle = screen.getByRole("button", { name: "Resize Page 1 Photo Slot 1" });
  fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 - 0.284 * 594, clientY: 100 });
  expect(parseFloat(slot.style.width)).toBeCloseTo(0.024 * 594);
  expect(screen.getByLabelText("Snap to Slot")).toBeTruthy();
  fireEvent.mouseUp(window, { clientX: 100 - 0.284 * 594, clientY: 100 });
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].width).toBeCloseTo(0.024, 9);
  });
});

it("reaches the Bleed when dragged well past the Page edge", async () => {
  const { ports, files } = disk();
  const album = createAlbum({ name: "Existing", pageCount: 2, bleedMm: { x: 2, y: 2 } });
  album.pages[0].slots.push({
    id: "slot-1", type: "photo", x: 0.3, y: 0.3, width: 0.4, height: 0.4, placement: null,
  });
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));

  const slot = await screen.findByRole("button", { name: "Page 1 Photo Slot 1" });
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: -400, clientY: 100 });
  expect(parseFloat(slot.style.left)).toBeCloseTo(parseFloat(page.style.left));
  expect(screen.queryByLabelText("Snap to Page edge")).toBeNull();
  fireEvent.mouseUp(window, { clientX: -400, clientY: 100 });
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].x).toBeCloseTo(-2 / 297, 9);
  });
});

it("does not snap a Text Slot to a gap that disappears after text reflows", async () => {
  const { ports, files } = disk();
  const album = addTextSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  const text = album.pages[0].slots[0];
  if (text.type !== "text") throw new Error("Expected a Text Slot.");
  Object.assign(text, { x: 0.375, y: 0.3, width: 0.2, text: "ABCDEFGHIJKLMNOPQRS" });
  album.pages[0].slots.push(
    { id: "left", type: "photo", x: 0.125, y: 0.35, width: 0.125, height: 0.02, placement: null },
    { id: "right", type: "photo", x: 0.745, y: 0.35, width: 0.125, height: 0.02, placement: null },
  );
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));

  const slot = await screen.findByRole("button", { name: "Page 1 Text Slot 1" });
  const handle = screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" });
  fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + 0.042 * 594, clientY: 100 });
  expect(parseFloat(slot.style.width)).toBeCloseTo(0.242 * 594);
  expect(screen.queryByLabelText("Snap to Equal gap")).toBeNull();
  fireEvent.mouseUp(window, { clientX: 100 + 0.042 * 594, clientY: 100 });
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].width).toBeCloseTo(0.242, 9);
  });
});

it("shows equal-gap guides while moving a Text Slot between Photo Slots", async () => {
  const { ports, files } = disk();
  const album = addTextSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  Object.assign(album.pages[0].slots[0], { x: 0.3, y: 0.25, width: 0.25 });
  album.pages[0].slots.push(
    { id: "left", type: "photo", x: 0.125, y: 0.25, width: 0.125, height: 0.25, placement: null },
    { id: "right", type: "photo", x: 0.75, y: 0.25, width: 0.125, height: 0.25, placement: null },
  );
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));

  const slot = await screen.findByRole("button", { name: "Page 1 Text Slot 1" });
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 100 + 0.079 * 594, clientY: 100 });
  expect(screen.getByLabelText("Snap to Equal gap")).toBeTruthy();
  fireEvent.mouseUp(window, { clientX: 100 + 0.079 * 594, clientY: 100 });
  expect(screen.queryByLabelText("Snap to Equal gap")).toBeNull();
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].x).toBeCloseTo(0.375, 9);
  });
});

it("adds, moves, resizes and deletes Photo Slots on the selected Page and persists their Page fractions", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  expect(screen.queryByRole("button", { name: "Delete Slot" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  expect(slot.getAttribute("aria-pressed")).toBe("true");
  // 59.4 px is 0.1 of the 594 px trim width; 42 px is 0.1 of the 420 px trim height.
  drag(slot, 59.4, 42);
  drag(screen.getByRole("button", { name: "Resize Page 1 Photo Slot 1" }), 59.4, -42);
  await waitForAutosave();
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
  await waitForAutosave();
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots).toEqual([]);
});

function photoDrop(photo: { path: string; width: number; height: number; orientation: number }, thumbnail?: string) {
  const data = new Map([["application/x-phalbummakr-photo", JSON.stringify({
    ...photo, ...(thumbnail ? { thumbnail } : {}),
  })]]);
  return { dataTransfer: { types: [...data.keys()], getData: (type: string) => data.get(type) ?? "", dropEffect: "none" } };
}

function placementTransfer() {
  const data = new Map<string, string>();
  return {
    get types() { return [...data.keys()]; },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "none", dropEffect: "none",
  };
}

it("swaps placed Photos through the Photo drag handle without moving their Slots", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }),
    photoDrop({ path: "b.jpg", width: 4000, height: 6000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Fit Photo" }));
  await waitForAutosave();
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  const dataTransfer = placementTransfer();
  fireEvent.dragStart(screen.getByLabelText("Drag Photo from Page 1 Photo Slot 1"), { dataTransfer });
  const target = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.dragOver(target, { dataTransfer });
  expect(screen.getByText("Swap Photos")).toBeTruthy();
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(window, { dataTransfer });
  await waitFor(() => {
    const after = deserializeAlbum(files.get("Existing")!).pages[0].slots;
    expect(after[0]).toEqual({ ...before[0], placement: before[1].placement });
    expect(after[1]).toEqual({ ...before[1], placement: before[0].placement });
  });
  expect(screen.queryByText(/already used in this Album/)).toBeNull();
});

it("swaps without adding post-swap controls and uses an icon-only Photo drag handle with a tooltip", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }),
    photoDrop({ path: "b.jpg", width: 4000, height: 6000, orientation: 1 }));
  await waitForAutosave();
  const dataTransfer = placementTransfer();
  const handle = screen.getByLabelText("Drag Photo from Page 1 Photo Slot 1");
  fireEvent.dragStart(handle, { dataTransfer });
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }), { dataTransfer });
  fireEvent.dragEnd(window, { dataTransfer });
  expect(screen.queryByText("Photos swapped.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Replace instead" })).toBeNull();
  expect(handle.title).toBe("Drag to swap");
  expect(handle.textContent).toBe("");
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!);
    expect(saved.pages[0].slots[0].placement!.photoPath).toBe("b.jpg");
    expect(saved.pages[0].slots[1].placement!.photoPath).toBe("a.jpg");
    expect([...photoUsage(saved)]).toEqual([["b.jpg", 1], ["a.jpg", 1]]);
  });
});

it("moves a Placement to an empty Slot, retaining its Crop and ignoring a drop onto itself", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  const source = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(source, photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.click(source);
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  const firstDrag = placementTransfer();
  fireEvent.dragStart(screen.getByLabelText("Drag Photo from Page 1 Photo Slot 1"), { dataTransfer: firstDrag });
  fireEvent.drop(source, { dataTransfer: firstDrag });
  fireEvent.dragEnd(window, { dataTransfer: firstDrag });
  const secondDrag = placementTransfer();
  fireEvent.dragStart(screen.getByLabelText("Drag Photo from Page 1 Photo Slot 1"), { dataTransfer: secondDrag });
  const target = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.dragOver(target, { dataTransfer: secondDrag });
  expect(screen.getByText("Move Photo")).toBeTruthy();
  fireEvent.drop(target, { dataTransfer: secondDrag });
  fireEvent.dragEnd(window, { dataTransfer: secondDrag });
  expect(screen.queryByRole("button", { name: "Replace instead" })).toBeNull();
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!);
    expect(saved.pages[0].slots[0].placement).toBeNull();
    expect(saved.pages[0].slots[1].placement!.photoPath).toBe("a.jpg");
    expect(saved.pages[0].slots[1].placement!.crop.width).toBeLessThan(0.9);
  });
});

it("keeps a Photo drag source mounted while a pending save finishes", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  await waitForAutosave();
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));

  vi.useFakeTimers();
  let finishWrite: () => void = () => {};
  const pendingWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
  const write = vi.mocked(ports.write).getMockImplementation()!;
  vi.mocked(ports.write).mockImplementationOnce(async (...args) => {
    await pendingWrite;
    await write(...args);
  });
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  const handle = screen.getByLabelText("Drag Photo from Page 1 Photo Slot 1");
  const dataTransfer = placementTransfer();
  fireEvent.dragStart(handle, { dataTransfer });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(handle.isConnected).toBe(true);
  await act(async () => { finishWrite(); await pendingWrite; });
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }), { dataTransfer });
  fireEvent.dragEnd(handle, { dataTransfer });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }).title).toBe("a.jpg");
});

it("keeps a portrait Photo upright when dropped into a rotated empty Slot and saves it", async () => {
  const { ports, files } = disk();
  const { container } = render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot clockwise" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].rotation).toBe(90));
  expect(container.querySelector("[data-slot-rotation]")?.getAttribute("data-slot-rotation")).toBe("90");
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }),
    photoDrop({ path: "portrait.jpg", width: 6000, height: 4000, orientation: 6 }));
  await waitFor(() => {
    const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
    expect(saved.rotation ?? 0).toBe(0);
    expect(saved).toMatchObject({ x: before.x, y: before.y, width: before.width, height: before.height });
    expect(saved.placement!.crop.width).toBeCloseTo(1);
    expect(saved.placement!.crop.height).toBeCloseTo(0.942857);
  });
  expect(container.querySelector("[data-slot-rotation]")?.getAttribute("data-slot-rotation")).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop.width).toBeLessThan(1));
  const cropBeforePan = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
  drag(screen.getByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" }), 20, 0);
  await waitFor(() => {
    const crop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
    expect(crop.x).toBeCloseTo(cropBeforePan.x - cropBeforePan.width * 0.1);
    expect(crop.y).toBeCloseTo(cropBeforePan.y);
  });
});

it("pans a rotated Photo in the direction dragged on the Page", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot clockwise" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].rotation).toBe(90));
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
  drag(screen.getByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" }), 20, 0);
  await waitFor(() => {
    const crop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
    expect(crop.x).toBeCloseTo(before.x);
    expect(crop.y).toBeCloseTo(before.y + before.height * 0.1);
  });
});

it("keeps the sibling Photo browser in sync with edits and Album switches", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 2 })));
  const photo = { path: "tree.jpg", width: 6000, height: 4000, orientation: 1, captureDate: 0, revision: "1" };
  vi.spyOn(tauriPhotoPorts, "scan").mockResolvedValue({ photos: [photo], folders: [], warnings: [] });
  vi.spyOn(tauriPhotoPorts, "thumbnail").mockResolvedValue("data:image/png;base64,dGVzdA==");
  function Workspace() {
    const [album, setAlbum] = useState<Album | null>(null);
    return <><PhotoBrowser root="D:\\Photos" album={album} />
      <AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={setAlbum} /></>;
  }
  render(<Workspace />);
  await screen.findByText("tree.jpg");
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop(photo));
  expect(screen.getByLabelText("Used 1 time in this Album")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "All" }));
  expect(screen.queryByText("tree.jpg")).toBeNull();
  await waitForAutosave();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Other" }));
  await screen.findByRole("button", { name: "Open Album Other", current: "page" });
  expect(await screen.findByText("tree.jpg")).toBeTruthy();
  expect(screen.queryByLabelText("Used 1 time in this Album")).toBeNull();
});

it("does not start an earlier save during a Crop pan", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitForAutosave();

  vi.useFakeTimers();
  const writesBefore = vi.mocked(ports.write).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
  fireEvent.mouseDown(screen.getByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" }), { button: 0, clientX: 100, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore);
  fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore);

  fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore + 1);
  const crop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(crop.width).toBeCloseTo(0.857143, 5);
  expect(crop.x).toBeGreaterThan(0.107);
});

it("finishes a Crop pan when the window loses focus", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 2 })));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitForAutosave();
  const original = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;

  vi.useFakeTimers();
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
  fireEvent.mouseDown(screen.getByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" }), { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
  fireEvent.blur(window);
  await act(() => vi.advanceTimersByTimeAsync(500));

  const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(saved.x).toBeGreaterThan(original.x);
  expect((screen.getByRole("button", { name: "Open Album Other" }) as HTMLButtonElement).disabled).toBe(false);
});

it("serializes saves when a Slot drag ends during an earlier Crop save", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 2 })));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitForAutosave();

  vi.useFakeTimers();
  const writesBefore = vi.mocked(ports.write).mock.calls.length;
  const write = vi.mocked(ports.write).getMockImplementation()!;
  let finishWrite: () => void = () => {};
  const firstWrite = new Promise<void>((resolve) => { finishWrite = resolve; });
  vi.mocked(ports.write).mockImplementationOnce(async (...args) => {
    await firstWrite;
    await write(...args);
  });
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore + 1);
  fireEvent.mouseMove(window, { clientX: 159.4, clientY: 100 });
  fireEvent.mouseUp(window, { clientX: 159.4, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore + 1);
  expect((screen.getByRole("button", { name: "Open Album Other" }) as HTMLButtonElement).disabled).toBe(true);

  await act(async () => { finishWrite(); await firstWrite; });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore + 2);
  const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0];
  expect(saved.x).toBeCloseTo(0.4, 9);
  expect(saved.placement!.crop.width).toBeCloseTo(0.857143, 5);
  expect((screen.getByRole("button", { name: "Open Album Other" }) as HTMLButtonElement).disabled).toBe(false);
});

it("reports Album changes and warns without blocking duplicate drops on Slots and Pages", async () => {
  const { ports, files } = disk();
  const onAlbumChange = vi.fn<(album: Album | null) => void>();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange} />);
  expect(onAlbumChange).toHaveBeenLastCalledWith(null);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  await waitFor(() => expect(onAlbumChange.mock.lastCall?.[0]?.title).toBe("Existing"));
  const photo = photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photo);
  expect(screen.queryByText(/already used in this Album/)).toBeNull();
  expect(photoUsage(onAlbumChange.mock.lastCall![0]!).get("tree.jpg")).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 2" }), photo);
  expect(screen.getByText("tree.jpg is already used in this Album.")).toBeTruthy();
  expect(photoUsage(onAlbumChange.mock.lastCall![0]!).get("tree.jpg")).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 606, 432));
  const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperties(dropEvent, {
    dataTransfer: { value: photo.dataTransfer }, clientX: { value: 403 }, clientY: { value: 266 },
  });
  fireEvent(page, dropEvent);
  expect(screen.getByText("tree.jpg is already used in this Album.")).toBeTruthy();
  expect(photoUsage(onAlbumChange.mock.lastCall![0]!).get("tree.jpg")).toBe(3);
  await waitForAutosave();
  expect(photoUsage(deserializeAlbum(files.get("Existing")!)).get("tree.jpg")).toBe(3);
});

it("highlights every visible Photo Slot and labels the current drop target", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
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
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
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
  await waitForAutosave();
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.photoPath).toBe("tree.jpg");
});

it("previews a new Photo Slot, bypasses it with Ctrl, and commits the preview as one undo step", async () => {
  vi.stubGlobal("DragEvent", MouseEvent);
  const { ports, files } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  album.pages[0].slots[0] = { ...album.pages[0].slots[0], x: 0.3, y: 0.3, width: 0.2, height: 0.2 };
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 606, 432));
  const transfer = photoDrop({ path: "new.jpg", width: 200, height: 100, orientation: 6 }).dataTransfer;
  const readDragData = vi.spyOn(transfer, "getData");
  const start = new Event("dragstart", { bubbles: true });
  Object.defineProperty(start, "dataTransfer", { value: transfer });
  fireEvent(window, start);
  readDragData.mockReturnValue("");
  const pointer = { dataTransfer: transfer, clientX: 106 + (0.5 + 3 / 297 + 0.2 * 210 / 297 / 4) * 594, clientY: 56 + 0.4 * 420 };
  fireEvent.dragOver(page, pointer);
  const preview = screen.getByRole("img", { name: "Smart placement preview" });
  fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
  expect(screen.queryByRole("img", { name: "Smart placement preview" })).toBeNull();
  fireEvent.keyUp(window, { key: "Control", ctrlKey: false });
  expect(screen.getByRole("img", { name: "Smart placement preview" })).toBeTruthy();
  fireEvent.dragOver(page, { ...pointer, ctrlKey: true });
  expect(screen.queryByRole("img", { name: "Smart placement preview" })).toBeNull();
  fireEvent.dragOver(page, pointer);
  expect(screen.getByRole("img", { name: "Smart placement preview" }).getAttribute("style")).toBe(preview.getAttribute("style"));
  readDragData.mockRestore();
  fireEvent.drop(page, pointer);
  const placed = (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots[1];
  expect(placed.x).toBeCloseTo(0.5 + 3 / 297);
  expect(placed.y).toBeCloseTo(0.3);
  expect(placed.width).toBeCloseTo(0.2 * 210 / 297 / 2);
  expect(placed.height).toBeCloseTo(0.2);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toHaveLength(1);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots[1]).toEqual(placed);
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[1]).toEqual(placed));
});

it("clears the Smart placement preview when replacing a Photo in an existing Slot", () => {
  vi.stubGlobal("DragEvent", MouseEvent);
  const { ports } = disk();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1"),
    "page-1", "slot-1", { path: "old.jpg", width: 100, height: 100, orientation: 1 });
  album.pages[0].slots[0] = { ...album.pages[0].slots[0], x: 0.3, y: 0.3, width: 0.2, height: 0.2 };
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 606, 432));
  const transfer = photoDrop({ path: "new.jpg", width: 100, height: 100, orientation: 1 }).dataTransfer;
  const start = new Event("dragstart", { bubbles: true });
  Object.defineProperty(start, "dataTransfer", { value: transfer });
  fireEvent(window, start);
  fireEvent.dragOver(page, { dataTransfer: transfer, clientX: 106 + (0.5 + 3 / 297 + 0.2 * 210 / 297 / 2) * 594, clientY: 224 });
  expect(screen.getByRole("img", { name: "Smart placement preview" })).toBeTruthy();
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.dragOver(slot, { dataTransfer: transfer });
  expect(screen.queryByRole("img", { name: "Smart placement preview" })).toBeNull();
  expect(screen.getByText("Replace Photo")).toBeTruthy();
  fireEvent.drop(slot, { dataTransfer: transfer });
  const slots = (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots;
  expect(slots).toHaveLength(1);
  expect(slots[0]).toMatchObject({ x: 0.3, y: 0.3, width: 0.2, height: 0.2, placement: { photoPath: "new.jpg" } });
});

it("uses ordinary Page-drop geometry when Ctrl is held at drop", () => {
  vi.stubGlobal("DragEvent", MouseEvent);
  const { ports } = disk();
  const album = addPhotoSlot(createAlbum({ name: "Existing", pageCount: 2 }), "page-1");
  album.pages[0].slots[0] = { ...album.pages[0].slots[0], x: 0.3, y: 0.3, width: 0.2, height: 0.2 };
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  const page = within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: "Select Page 1" });
  vi.spyOn(page, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 50, 606, 432));
  const transfer = photoDrop({ path: "new.jpg", width: 100, height: 100, orientation: 1 }).dataTransfer;
  const start = new Event("dragstart", { bubbles: true });
  Object.defineProperty(start, "dataTransfer", { value: transfer });
  fireEvent(window, start);
  const pointer = { dataTransfer: transfer, clientX: 106 + (0.5 + 3 / 297 + 0.2 * 210 / 297 / 2) * 594, clientY: 224 };
  fireEvent.dragOver(page, pointer);
  expect(screen.getByRole("img", { name: "Smart placement preview" })).toBeTruthy();
  fireEvent.drop(page, { ...pointer, ctrlKey: true });
  const placed = (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots[1];
  expect(placed.width).toBeCloseTo(0.4);
  expect(placed.height).toBeCloseTo(0.4 * 297 / 210);
});

it("ignores Photo drops on blocked Pages, the Spread strip, and the area around Pages", async () => {
  const { ports } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  const photo = photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 });
  const editor = screen.getByRole("group", { name: "Spread editor" });
  fireEvent.drop(within(editor).getByText("Inside cover"), photo);
  fireEvent.drop(editor, photo);
  fireEvent.drop(screen.getByRole("navigation", { name: "Spreads" }), photo);
  expect(screen.queryByRole("button", { name: /^Page \d+ Photo Slot/ })).toBeNull();

  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.drop(within(editor).getByText("Inside cover"), photo);
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
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
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
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop(
    { path: "tree.jpg", width: 6000, height: 4000, orientation: 1 },
  ));

  expect(await screen.findByText("Couldn't load Photo")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("img", { name: "Placement" }).getAttribute("src"))
    .toBe("data:image/jpeg;base64,retried-preview"));
  expect(photoPorts.preview).toHaveBeenLastCalledWith("D:\\Photos", "tree.jpg");
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
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
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
  await waitForAutosave();
  const placement = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!;
  expect(placement.photoPath).toBe("2024/tree.jpg");
  expect(placement.crop.y).toBe(0);
  expect(placement.crop.x + placement.crop.width / 2).toBeCloseTo(0.5, 9);

  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop({ path: "snow.png", width: 4000, height: 6000, orientation: 1 }));
  await waitFor(() => expect(screen.getByRole("img", { name: "Placement" }).getAttribute("src")).toBe(`data:image/jpeg;base64,${btoa("snow.png")}`));
  await waitForAutosave();
  const [replaced] = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  expect(replaced.placement!.photoPath).toBe("snow.png");
  expect(screen.getAllByRole("img", { name: "Placement" })).toHaveLength(1);
});

it("keeps Crop local during a pan gesture, commits at release, and persists Fit", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("button", { name: "Open Album Existing", current: "page" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitForAutosave();
  const original = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;

  vi.useFakeTimers();
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
  const writesBeforePan = vi.mocked(ports.write).mock.calls.length;
  fireEvent.mouseDown(screen.getByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" }), { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop).toEqual(original);
  fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop).toEqual(original);
  await act(() => vi.advanceTimersByTimeAsync(500));
  const panned = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(panned.x).toBeGreaterThan(original.x);
  expect(ports.write).toHaveBeenCalledTimes(writesBeforePan + 1);

  const writesBeforeZoom = vi.mocked(ports.write).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  const zoomed = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(zoomed.width).toBeLessThan(panned.width);
  expect(ports.write).toHaveBeenCalledTimes(writesBeforeZoom + 1);

  fireEvent.click(screen.getByRole("button", { name: "Fit Photo" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.fit).toBe(true);
  expect(screen.queryByRole("button", { name: "Pan Photo in Page 1 Photo Slot 1" })).toBeNull();
});


/** Adds the Side pane and the shared Layout Library that DocumentWorkspace provides around Album mode. */
function WithLayouts({ layoutPorts, ...props }: ComponentProps<typeof Workspace> & { layoutPorts: LayoutPorts }) {
  const [paneHost, setPaneHost] = useState<HTMLElement | null>(null);
  const state = useLayoutLibrary({ root: "D:\\Photos", format: props.document!.album.pageFormat, ports: layoutPorts });
  return <>
    <section aria-label="Side pane" ref={setPaneHost} />
    <AlbumWorkspace {...props} layouts={{ state, paneHost }} />
  </>;
}

function layoutDisk(layouts: Layout[]) {
  const store = { json: serializeLayoutLibrary({ schemaVersion: 2, layouts }) as string | null };
  const ports: LayoutPorts = {
    read: vi.fn(async () => store.json),
    write: vi.fn(async (_root: string, json: string) => { store.json = json; }),
  };
  return { ports, store };
}

const onePhotoLayout: Layout = { id: "layout-one", aspectRatio: 297 / 210, slots: [
  { id: "slot-1", type: "photo", x: 0.1, y: 0.1, width: 0.8, height: 0.8, placement: null },
] };
const squareLayout: Layout = { id: "layout-square", aspectRatio: 1, slots: [
  { id: "slot-1", type: "photo", x: 0.1, y: 0.1, width: 0.3, height: 0.3, placement: null },
  { id: "slot-2", type: "photo", x: 0.5, y: 0.1, width: 0.3, height: 0.3, placement: null },
] };

function albumWithContent() {
  let album = createAlbum({ name: "Existing", pageCount: 4 });
  for (const path of ["a.jpg", "b.jpg"]) {
    album = addPhotoSlot(album, "page-1");
    album = placePhoto(album, "page-1", album.pages[0].slots.at(-1)!.id, { path, width: 6000, height: 4000, orientation: 1 });
  }
  album = addTextSlot(album, "page-1");
  return setSlotText(album, "page-1", album.pages[0].slots.at(-1)!.id, "Hello");
}

const layoutCards = () => within(within(screen.getByRole("region", { name: "Side pane" })).getByRole("list", { name: "Layout Library" }));

it("migrates a Layout Library without rewriting the existing Album or its Pages", async () => {
  const { ports, files } = disk();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1", "slot-1",
    { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  const original = serializeAlbum(album);
  files.set("Existing", original);
  const library = layoutDisk([onePhotoLayout]);
  library.store.json = JSON.stringify({ schemaVersion: 1, layouts: [onePhotoLayout] });
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={library.ports}
    document={{ path: "Existing", album }} />);
  await waitFor(() => expect(library.ports.write).toHaveBeenCalled(), { timeout: 2000 });
  expect(layoutCards().getAllByRole("button")).toHaveLength(7);
  expect(files.get("Existing")).toBe(original);
  expect(ports.write).not.toHaveBeenCalled();
});

it("applies a Layout from its menu in the Side pane to a Page of the current Spread, with notices", async () => {
  const { ports, files } = disk();
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={layoutDisk([onePhotoLayout, squareLayout]).ports}
    document={{ path: "Existing", album: albumWithContent() }} />);
  const [first, square] = await waitFor(() => layoutCards().getAllByRole("button"));

  fireEvent.contextMenu(first);
  const menu = within(screen.getByRole("menu", { name: "Apply Layout" }));
  expect(menu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Apply to right Page"]);
  fireEvent.click(menu.getByRole("menuitem", { name: "Apply to right Page" }));
  expect(screen.queryByRole("menu", { name: "Apply Layout" })).toBeNull();
  expect(screen.getByText("1 Photo and 1 text did not fit the Layout on Page 1 and were removed.").closest("[role=status]")).not.toBeNull();
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots)
    .toMatchObject([{ type: "photo", x: 0.1, width: 0.8, placement: { photoPath: "a.jpg" } }]));

  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.contextMenu(square);
  const spreadMenu = within(screen.getByRole("menu", { name: "Apply Layout" }));
  expect(spreadMenu.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Apply to left Page", "Apply to right Page"]);
  fireEvent.click(spreadMenu.getByRole("menuitem", { name: "Apply to right Page" }));
  expect(screen.getByText(/made for Pages with a different aspect ratio/).closest("[role=status]")).not.toBeNull();
  expect(screen.queryByText(/did not fit the Layout/)).toBeNull();
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[2].slots)
    .toMatchObject([{ type: "photo", x: 0.1, placement: null }, { type: "photo", x: 0.5, placement: null }]));
  expect(deserializeAlbum(files.get("Existing")!).pages[1].slots).toEqual([]);

  // Applying a Layout is one undo step, which brings back what did not fit.
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots.map((slot) => slot.type))
    .toEqual(["photo", "photo", "text"]));
  expect(deserializeAlbum(files.get("Existing")!).pages[2].slots).toEqual([]);
});

const canvasPage = (number: number) =>
  within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: `Select Page ${number}` });

it("previews grid dimensions for a real Page without applying them when cancelled", async () => {
  const { ports } = disk();
  const library = layoutDisk([onePhotoLayout]);
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={library.ports}
    document={{ path: "Existing", album: albumWithContent() }} />);
  await waitFor(() => expect(layoutCards().getAllByRole("button")).toHaveLength(1));
  const editor = within(screen.getByRole("group", { name: "Spread editor" }));
  fireEvent.contextMenu(editor.getByText("Inside cover"));
  expect(screen.queryByRole("menu", { name: "Page actions" })).toBeNull();
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  const grid = within(dialog.getByRole("grid", { name: "Grid dimensions" }));
  const choice = grid.getByRole("gridcell", { name: "2 columns x 3 rows" });
  fireEvent.mouseEnter(choice);
  expect(dialog.getByText("2 columns x 3 rows")).toBeTruthy();
  fireEvent.click(choice);
  expect((dialog.getByLabelText("Columns") as HTMLInputElement).value).toBe("2");
  expect((dialog.getByLabelText("Rows") as HTMLInputElement).value).toBe("3");
  expect(editor.getAllByRole("button", { name: /^Page 1 (Photo|Text) Slot/ })).toHaveLength(3);
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(editor.getAllByRole("button", { name: /^Page 1 (Photo|Text) Slot/ })).toHaveLength(3);
  expect(layoutCards().getAllByRole("button")).toHaveLength(1);
  expect(library.ports.write).not.toHaveBeenCalled();
});

it("preserves edge text while applying a grid as one undoable change", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  let album = addTextSlot(createAlbum({ name: "Existing" }), "page-1");
  album = setSlotText(album, "page-1", "slot-1", "Title");
  album.pages[0].slots = [{ ...album.pages[0].slots[0], x: 0.1, y: 20 / 210, width: 0.4, height: 10 / 210 }];
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  const current = () => onAlbumChange.mock.lastCall![0] as Album;
  const original = structuredClone(current());
  fireEvent.contextMenu(screen.getByRole("button", { name: "Page 1 Text Slot 1" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  expect(dialog.getByText("Text preserved - space reserved at top.")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Apply" }));
  const applied = structuredClone(current());
  expect(applied.pages[0].slots.filter((slot) => slot.type === "text")).toEqual(original.pages[0].slots);
  expect(applied.pages[0].slots.filter((slot) => slot.type === "photo")).toHaveLength(4);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(current().pages).toEqual(original.pages);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(current().pages).toEqual(applied.pages);
});

it("reports Photo overflow without reporting preserved text as removed", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const album = albumWithContent();
  album.pages[0].slots[2] = { ...album.pages[0].slots[2], y: 20 / 210, height: 10 / 210 };
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  const original = structuredClone((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots[2]);
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  fireEvent.change(dialog.getByLabelText("Columns"), { target: { value: "1" } });
  fireEvent.change(dialog.getByLabelText("Rows"), { target: { value: "1" } });
  fireEvent.click(dialog.getByRole("button", { name: "Apply" }));
  expect(screen.getByText("1 Photo did not fit the Layout on Page 1 and was removed.")).toBeTruthy();
  const slots = (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots;
  expect(slots[0]).toMatchObject({ type: "photo", placement: { photoPath: "a.jpg" } });
  expect(slots[1]).toEqual(original);
});

it("applies a grid to only its Page, reports removed content, and supports undo and redo", async () => {
  const { ports } = disk();
  const library = layoutDisk([onePhotoLayout]);
  const onAlbumChange = vi.fn();
  const album = addTextSlot(albumWithContent(), "page-1");
  album.pages[0].slots[3] = { ...album.pages[0].slots[3], y: 20 / 210, height: 10 / 210 };
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={library.ports}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  await waitFor(() => expect(layoutCards().getAllByRole("button")).toHaveLength(1));
  const current = () => onAlbumChange.mock.lastCall![0] as Album;
  const original = structuredClone(current());
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  fireEvent.change(dialog.getByLabelText("Columns"), { target: { value: "1" } });
  fireEvent.change(dialog.getByLabelText("Rows"), { target: { value: "1" } });
  expect(dialog.getByText(/cannot preserve the current text arrangement/)).toBeTruthy();
  fireEvent.submit(dialog.getByRole("button", { name: "Remove text and apply full-page grid" }).closest("form")!);
  expect(current().pages).toEqual(original.pages);
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(current().pages).toEqual(original.pages);
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const replacement = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  fireEvent.change(replacement.getByLabelText("Columns"), { target: { value: "1" } });
  fireEvent.change(replacement.getByLabelText("Rows"), { target: { value: "1" } });
  fireEvent.click(replacement.getByRole("button", { name: "Remove text and apply full-page grid" }));

  expect(screen.getByText("1 Photo and 1 text did not fit the Layout on Page 1 and were removed.")).toBeTruthy();
  const page = current().pages[0];
  expect(page.slots).toHaveLength(1);
  expect(page.slots[0]).toMatchObject({ type: "photo", placement: { photoPath: "a.jpg" } });
  const crop = page.slots[0].placement!.crop;
  expect((crop.width * 6000) / (crop.height * 4000)).toBeCloseTo(267 / 180);
  expect(current().pages.slice(1)).toEqual(original.pages.slice(1));
  expect(layoutCards().getAllByRole("button")).toHaveLength(1);
  expect(library.ports.write).not.toHaveBeenCalled();

  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(current().pages).toEqual(original.pages);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(current().pages[0].slots).toEqual(page.slots);
  fireEvent.click(bar().getByRole("button", { name: "Bar save-as-layout" }));
  expect(layoutCards().getAllByRole("button")).toHaveLength(2);
  expect(screen.getByText("Saved Page 1 as a new Layout.")).toBeTruthy();
});

it("offers full-page replacement when the chosen grid does not fit around text", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  let album = addTextSlot(createAlbum({ name: "Existing", safeZoneMm: { x: 30, y: 30 } }), "page-1");
  album = addTextSlot(album, "page-1");
  album.pages[0].slots = [
    { ...album.pages[0].slots[0], y: 57.5 / 210, height: 10 / 210 },
    { ...album.pages[0].slots[1], y: 142.5 / 210, height: 10 / 210 },
  ];
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  const current = () => onAlbumChange.mock.lastCall![0] as Album;
  const original = structuredClone(current());
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  expect(dialog.getByText("Text preserved - space reserved at top and bottom.")).toBeTruthy();
  fireEvent.change(dialog.getByLabelText("Rows"), { target: { value: "12" } });
  expect(dialog.getByText(/selected grid does not fit around the text/)).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(current().pages).toEqual(original.pages);
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const replacement = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  fireEvent.change(replacement.getByLabelText("Rows"), { target: { value: "12" } });
  fireEvent.click(replacement.getByRole("button", { name: "Remove text and apply full-page grid" }));
  const applied = structuredClone(current());
  expect(applied.pages[0].slots).toHaveLength(24);
  expect(applied.pages[0].slots.every((slot) => slot.type === "photo")).toBe(true);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(current().pages).toEqual(original.pages);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(current().pages).toEqual(applied.pages);
});

it("targets the right-clicked Page in the strip, not its Spread sibling", async () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const album = albumWithContent();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  const current = () => onAlbumChange.mock.lastCall![0] as Album;
  const original = structuredClone(current());
  fireEvent.contextMenu(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Apply grid layout" })).getByRole("button", { name: "Apply" }));
  expect(current().pages[0]).toEqual(original.pages[0]);
  expect(current().pages[1].slots).toHaveLength(4);
  expect(current().pages[2]).toEqual(original.pages[2]);
});

it("offers the grid command from a full-bleed Slot and targets that Slot's Page", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const empty = createAlbum({ name: "Existing", pageCount: 4 });
  const album = applyLayout(empty, "page-2", readLayoutLibrary(null, empty.pageFormat).layouts[0]).album;
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  fireEvent.contextMenu(screen.getByRole("button", { name: "Page 2 Photo Slot 1" }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Slot actions" })).getByRole("menuitem", { name: "Apply grid layout..." }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Apply grid layout" })).getByRole("button", { name: "Apply" }));
  const current = onAlbumChange.mock.lastCall![0] as Album;
  expect(current.pages[1].slots).toHaveLength(4);
  expect(current.pages[2]).toEqual(album.pages[2]);
});

it("applies the largest supported grid and keeps the existing Photo", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1", "slot-1",
    { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()}
    onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  fireEvent.contextMenu(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  fireEvent.change(dialog.getByLabelText("Columns"), { target: { value: "12" } });
  fireEvent.change(dialog.getByLabelText("Rows"), { target: { value: "12" } });
  fireEvent.click(dialog.getByRole("button", { name: "Apply" }));
  const current = onAlbumChange.mock.lastCall![0] as Album;
  expect(current.pages[0].slots).toHaveLength(144);
  expect(current.pages[0].slots[0]).toMatchObject({ placement: { photoPath: "a.jpg" } });
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 144" })).toBeTruthy();
});

it("bounds preview requests across a populated Spread and skips the old Page after navigation", async () => {
  const { ports } = disk();
  const empty = createAlbum({ name: "Existing", pageCount: 4 });
  let album = empty;
  for (const page of [1, 2, 3]) {
    const pageId = `page-${page}`;
    album = applyLayout(album, pageId, createGridLayout(empty.pageFormat, 12, 12)).album;
    for (const [index, slot] of album.pages[page - 1].slots.entries()) {
      album = placePhoto(album, pageId, slot.id, { path: `${page}-${index}.jpg`, width: 6000, height: 4000, orientation: 1 });
    }
  }
  const requests: { path: string; finish: (url: string) => void }[] = [];
  const photoPorts = {
    preview: vi.fn((_root: string, path: string) => new Promise<string>((finish) => requests.push({ path, finish }))),
    pageThumbnail: vi.fn(async () => "thumbnail"),
  };
  const view = render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={{ path: "Existing", album }} />);
  expect(photoPorts.preview).toHaveBeenCalledTimes(4);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  await act(async () => requests[0].finish("preview"));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(5));
  expect(requests[4].path).toMatch(/^[23]-/);
  await act(async () => requests.slice(1, 4).forEach(({ finish }) => finish("preview")));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(8));
  expect(requests.slice(4).every(({ path }) => /^[23]-/.test(path))).toBe(true);
  view.unmount();
  await act(async () => requests.slice(4).forEach(({ finish }) => finish("preview")));
});

it("prioritizes a newly placed Photo while other grid previews wait", async () => {
  const { ports } = disk();
  const empty = createAlbum({ name: "Existing" });
  let album = applyLayout(empty, "page-1", createGridLayout(empty.pageFormat, 6, 1)).album;
  for (const [index, slot] of album.pages[0].slots.slice(0, 5).entries()) {
    album = placePhoto(album, "page-1", slot.id, { path: `${index}.jpg`, width: 6000, height: 4000, orientation: 1 });
  }
  const requests: { path: string; finish: (url: string) => void }[] = [];
  const photoPorts = {
    preview: vi.fn((_root: string, path: string) => new Promise<string>((finish) => requests.push({ path, finish }))),
    pageThumbnail: vi.fn(async () => "thumbnail"),
  };
  const view = render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={{ path: "Existing", album }} />);
  expect(photoPorts.preview).toHaveBeenCalledTimes(4);
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 6" }), photoDrop(
    { path: "new.jpg", width: 6000, height: 4000, orientation: 1 }, "data:image/png;base64,dGh1bWJuYWls"));
  await act(async () => requests[0].finish("preview"));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(5));
  expect(requests[4].path).toBe("new.jpg");
  view.unmount();
  await act(async () => requests.slice(1).forEach(({ finish }) => finish("preview")));
});

it("continues queued previews after a failure and prioritizes an explicit retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { ports } = disk();
  const empty = createAlbum({ name: "Existing" });
  let album = applyLayout(empty, "page-1", createGridLayout(empty.pageFormat, 6, 1)).album;
  for (const [index, slot] of album.pages[0].slots.entries()) {
    album = placePhoto(album, "page-1", slot.id, { path: `${index}.jpg`, width: 6000, height: 4000, orientation: 1 });
  }
  const requests: { path: string; finish: (url: string) => void; fail: (error: Error) => void }[] = [];
  const photoPorts = {
    preview: vi.fn((_root: string, path: string) => new Promise<string>((finish, fail) => requests.push({ path, finish, fail }))),
    pageThumbnail: vi.fn(async () => "thumbnail"),
  };
  const view = render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={{ path: "Existing", album }} />);
  expect(photoPorts.preview).toHaveBeenCalledTimes(4);
  await act(async () => requests[0].fail(new Error("Preview unavailable")));
  expect(await screen.findByText("Couldn't load Photo")).toBeTruthy();
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(5));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await act(async () => requests[1].finish("preview"));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(6));
  expect(requests[5].path).toBe("0.jpg");
  view.unmount();
  await act(async () => requests.slice(2).forEach(({ finish }) => finish("preview")));
});

it("pauses queued previews outside Album mode without reloading ready ones on return", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    private url = "";
    get src() { return this.url; }
    set src(url: string) { this.url = url; queueMicrotask(() => this.onload?.()); }
  });
  const { ports } = disk();
  const empty = createAlbum({ name: "Existing" });
  let album = applyLayout(empty, "page-1", createGridLayout(empty.pageFormat, 6, 1)).album;
  for (const [index, slot] of album.pages[0].slots.entries()) {
    album = placePhoto(album, "page-1", slot.id, { path: `${index}.jpg`, width: 6000, height: 4000, orientation: 1 });
  }
  const requests: { path: string; finish: (url: string) => void }[] = [];
  const photoPorts = {
    preview: vi.fn((_root: string, path: string) => new Promise<string>((finish) => requests.push({ path, finish }))),
    pageThumbnail: vi.fn(async () => "thumbnail"),
  };
  const document = { path: "Existing", album };
  const view = render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={document} active />);
  await act(async () => requests[0].finish("preview-0"));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(5));
  expect(screen.getAllByRole("img", { name: "Placement" }).some((image) => image.getAttribute("src") === "preview-0")).toBe(true);
  view.rerender(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={document} active={false} />);
  await act(async () => requests[1].finish("preview-1"));
  expect(photoPorts.preview).toHaveBeenCalledTimes(5);
  view.rerender(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={document} active />);
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(6));
  expect(requests.filter(({ path }) => path === "0.jpg")).toHaveLength(1);
  view.unmount();
  await act(async () => requests.slice(2).forEach(({ finish }) => finish("preview")));
});

it("reloads a restored Photo after a replacement preview starts", async () => {
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 2048;
    naturalHeight = 1365;
    private url = "";
    get src() { return this.url; }
    set src(url: string) { this.url = url; queueMicrotask(() => this.onload?.()); }
  });
  const { ports } = disk();
  const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1", "slot-1",
    { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
  let finishReplacement!: (url: string) => void;
  const photoPorts = {
    preview: vi.fn((_root: string, path: string) => path === "b.jpg"
      ? new Promise<string>((resolve) => { finishReplacement = resolve; })
      : Promise.resolve("preview-a")),
    pageThumbnail: vi.fn(async () => "thumbnail"),
  };
  const view = render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} document={{ path: "Existing", album }} />);
  await waitFor(() => expect(screen.queryByRole("status", { name: "Loading Photo preview" })).toBeNull());
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "b.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(2));
  fireEvent.drop(slot, photoDrop({ path: "a.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(photoPorts.preview).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.queryByRole("status", { name: "Loading Photo preview" })).toBeNull());
  view.unmount();
  await act(async () => finishReplacement("preview-b"));
});

it("explains invalid and no-area grids and supports keyboard selection", () => {
  const { ports } = disk();
  const album = createAlbum({ name: "Existing", safeZoneMm: { x: 104, y: 104 } });
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }} />);
  fireEvent.contextMenu(canvasPage(1));
  fireEvent.click(screen.getByRole("menuitem", { name: "Apply grid layout..." }));
  const dialog = within(screen.getByRole("dialog", { name: "Apply grid layout" }));
  const apply = dialog.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
  expect(dialog.getByRole("alert").textContent).toContain("no positive Slot width or height");
  expect(apply.disabled).toBe(true);

  const columns = dialog.getByLabelText("Columns") as HTMLInputElement;
  const rows = dialog.getByLabelText("Rows") as HTMLInputElement;
  fireEvent.change(rows, { target: { value: "1" } });
  expect(apply.disabled).toBe(false);
  fireEvent.change(columns, { target: { value: "13" } });
  expect(dialog.getByRole("alert").textContent).toContain("whole numbers from 1 to 12");
  expect(apply.disabled).toBe(true);
  fireEvent.change(columns, { target: { value: "1.5" } });
  expect(apply.disabled).toBe(true);
  fireEvent.change(columns, { target: { value: "" } });
  expect(apply.disabled).toBe(true);
  fireEvent.change(columns, { target: { value: "1" } });
  const grid = dialog.getByRole("grid", { name: "Grid dimensions" });
  grid.focus();
  fireEvent.keyDown(grid, { key: "ArrowRight" });
  expect(columns.value).toBe("2");
  expect(dialog.getByText("2 columns x 1 row")).toBeTruthy();
  expect(apply.disabled).toBe(false);
  fireEvent.keyDown(grid, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(album.pages[0].slots).toEqual([]);
});

function layoutTransfer() {
  const data = new Map<string, string>();
  return {
    get types() { return [...data.keys()]; },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "none", dropEffect: "none",
  };
}

it("applies a Layout dragged from the Side pane onto a Page, also when dropped on one of its Slots", async () => {
  const { ports, files } = disk();
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={layoutDisk([onePhotoLayout, squareLayout]).ports}
    document={{ path: "Existing", album: albumWithContent() }} />);
  const [first, square] = await waitFor(() => layoutCards().getAllByRole("button"));
  expect(square.getAttribute("draggable")).toBe("true");

  const toSlot = layoutTransfer();
  fireEvent.dragStart(square, { dataTransfer: toSlot });
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.dragOver(slot, { dataTransfer: toSlot });
  expect(canvasPage(1).hasAttribute("data-layout-target")).toBe(true);
  fireEvent.drop(slot, { dataTransfer: toSlot });
  expect(canvasPage(1).hasAttribute("data-layout-target")).toBe(false);
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots)
    .toMatchObject([{ x: 0.1, width: 0.3, placement: { photoPath: "a.jpg" } }, { x: 0.5, width: 0.3, placement: { photoPath: "b.jpg" } }]));

  fireEvent.click(within(screen.getByRole("navigation", { name: "Spreads" })).getByRole("button", { name: "Select Page 2" }));
  const toPage = layoutTransfer();
  fireEvent.dragStart(first, { dataTransfer: toPage });
  const page = canvasPage(2);
  fireEvent.dragOver(page, { dataTransfer: toPage });
  fireEvent.drop(page, { dataTransfer: toPage });
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[1].slots).toMatchObject([{ x: 0.1, width: 0.8, placement: null }]));
  expect(deserializeAlbum(files.get("Existing")!).pages[2].slots).toEqual([]);
});

it("saves the selected Page as a new Layout in the Layout Library, without its Photos or text", async () => {
  const { ports } = disk();
  const library = layoutDisk([onePhotoLayout]);
  const album = rotateSlot(albumWithContent(), "page-1", "slot-1", 90);
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={library.ports}
    document={{ path: "Existing", album }} />);
  await waitFor(() => expect(layoutCards().getAllByRole("button")).toHaveLength(1));
  fireEvent.click(canvasPage(1));
  fireEvent.click(bar().getByRole("button", { name: "Bar save-as-layout" }));
  expect(screen.getByText("Saved Page 1 as a new Layout.").closest("[role=status]")).not.toBeNull();
  expect(layoutCards().getAllByRole("button").map((card) => card.getAttribute("aria-label")))
    .toEqual(["Layout 1: 1 Photo Slot", "Layout 2: 2 Photo Slots, 1 Text Slot"]);
  await waitFor(() => expect(library.ports.write).toHaveBeenCalled());
  const saved = readLayoutLibrary(library.store.json, album.pageFormat).layouts[1];
  const [photo, , text] = album.pages[0].slots;
  expect(saved.slots).toHaveLength(3);
  expect(saved.slots[0]).toEqual({ ...photo, placement: null });
  expect(saved.slots[0].rotation).toBe(90);
  expect(saved.slots[2]).toEqual({ ...text, text: "" });
});

it("shows a failed Layout Library save in Album mode and retries it", async () => {
  const { ports } = disk();
  const library = layoutDisk([onePhotoLayout]);
  vi.mocked(library.ports.write).mockRejectedValueOnce(new Error("Disk full"));
  render(<WithLayouts root="D:\\Photos" ports={ports} photoPorts={previews()} layoutPorts={library.ports}
    document={{ path: "Existing", album: albumWithContent() }} />);
  await waitFor(() => expect(layoutCards().getAllByRole("button")).toHaveLength(1));
  fireEvent.click(bar().getByRole("button", { name: "Bar save-as-layout" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Could not save the Layout Library: Error: Disk full");
  expect(screen.queryByText("Saved Page 1 as a new Layout.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry Layout Library save" }));
  await waitFor(() => expect(readLayoutLibrary(library.store.json, albumWithContent().pageFormat).layouts).toHaveLength(2));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("deletes a Spread with content straight away, and undoes and redoes it while autosave writes the current state", async () => {
  const { ports, files } = disk();
  const onHistoryChange = vi.fn();
  const album = addTextSlot(createAlbum({ name: "Existing", pageCount: 4 }), "page-3");
  files.set("Existing", serializeAlbum(album));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} bar={{ onHistoryChange }} document={{ path: "Existing", album }} />);
  expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: false });
  fireEvent.click(screen.getByRole("button", { name: "Delete Spread 2" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText(/ OF 2$/)).toBeTruthy();
  expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages).toHaveLength(2));

  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(screen.getByText("PAGE 2 OF 4")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Page 3 Text Slot 1" })).toBeTruthy();
  expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: true });
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages.map((page) => page.slots.length)).toEqual([0, 0, 1, 0]));

  fireEvent.click(screen.getByRole("button", { name: "Bar redo" }));
  expect(screen.getByText(/ OF 2$/)).toBeTruthy();
  expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages).toHaveLength(2));
});

it("undoes and redoes adding Spreads, duplicating a Page and dragging a Page as one step each", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const album = addTextSlot(createAlbum({ name: "Existing", pageCount: 4 }), "page-2");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} onAlbumChange={onAlbumChange} document={{ path: "Existing", album }} />);
  const order = () => (onAlbumChange.mock.lastCall![0] as Album).pages.map((page) => `${page.id}:${page.slots.length}`);
  const original = order();
  const strip = () => within(screen.getByRole("navigation", { name: "Spreads" }));

  fireEvent.click(screen.getByRole("button", { name: "Bar add-spread" }));
  fireEvent.contextMenu(strip().getByRole("button", { name: "Select Page 2" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate Page onto New Spread" }));
  const duplicated = order();
  expect(duplicated).toHaveLength(8);
  const transfer = { setData: vi.fn(), effectAllowed: "none", dropEffect: "none" };
  fireEvent.dragStart(strip().getByRole("button", { name: "Select Page 2" }), { dataTransfer: transfer });
  fireEvent.dragOver(strip().getByRole("button", { name: "Select Page 5" }), { dataTransfer: transfer });
  fireEvent.drop(strip().getByRole("button", { name: "Select Page 5" }), { dataTransfer: transfer });
  const dragged = order();
  expect(dragged).not.toEqual(duplicated);

  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(order()).toEqual(duplicated);
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(order()).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(order()).toEqual(original);
  fireEvent.click(screen.getByRole("button", { name: "Bar redo" }));
  fireEvent.click(screen.getByRole("button", { name: "Bar redo" }));
  fireEvent.click(screen.getByRole("button", { name: "Bar redo" }));
  expect(order()).toEqual(dragged);
});

it("undoes a Slot deletion, restoring its Photo, position and rotation", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  const photo = { path: "a.jpg", width: 6000, height: 4000, orientation: 1 };
  const album = rotateSlot(placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1", { x: 0.3, y: 0.6 }), "page-1", "slot-1", photo), "page-1", "slot-1", 90);
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album }} />);
  fireEvent.click(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }));
  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 1" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 1" })).toBeTruthy();
  expect((onAlbumChange.mock.lastCall![0] as Album).pages[0].slots).toEqual(album.pages[0].slots);
});

it("counts a Slot drag and a session of typing as one undo step each", () => {
  const { ports } = disk();
  const onAlbumChange = vi.fn();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} fontPorts={{ list: async () => ["Arial"] }} onAlbumChange={onAlbumChange}
    document={{ path: "Existing", album: addPhotoSlot(createAlbum({ name: "Existing" }), "page-1") }} />);
  const slots = () => (onAlbumChange.mock.lastCall![0] as Album).pages[0].slots;
  const before = slots()[0];
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  for (const step of [10, 20, 30]) fireEvent.mouseMove(window, { clientX: 100 + step, clientY: 100 });
  fireEvent.mouseUp(window, { clientX: 159.4, clientY: 100 });
  expect(slots()[0].x).toBeCloseTo(before.x + 0.1);

  fireEvent.click(screen.getByRole("button", { name: "Add Text Slot" }));
  const editor = screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 2" });
  for (const text of ["H", "Hi", "Hi!"]) fireEvent.change(editor, { target: { value: text } });
  fireEvent.blur(editor);
  fireEvent.change(editor, { target: { value: "Hi!!" } });
  // The app's window-wide undo shortcut must see Ctrl+Z pressed while typing.
  const windowKeys = vi.fn();
  window.addEventListener("keydown", windowKeys);
  fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
  fireEvent.keyDown(editor, { key: "a" });
  window.removeEventListener("keydown", windowKeys);
  expect(windowKeys.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual(["z"]);
  // Closing the editor with Escape and reopening it starts a new step too.
  fireEvent.keyDown(editor, { key: "Escape" });
  fireEvent.doubleClick(screen.getByRole("button", { name: "Page 1 Text Slot 2" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 2" }), { target: { value: "Hi!!?" } });

  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(slots()[1]).toMatchObject({ text: "Hi!!" });

  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(slots()[1]).toMatchObject({ text: "Hi!" });
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(slots()[1]).toMatchObject({ text: "" });
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(slots()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
  expect(slots()[0]).toEqual(before);
});

describe("moving Photos while their Album is open", () => {
  const moves = [{ from: "a.jpg", to: "kids/a.jpg" }];
  function openWithPhoto() {
    const { ports, files } = disk();
    const album = placePhoto(addPhotoSlot(createAlbum({ name: "Existing" }), "page-1"), "page-1", "slot-1",
      { path: "a.jpg", width: 6000, height: 4000, orientation: 1 });
    files.set("Existing", serializeAlbum(album));
    const onAlbumChange = vi.fn<(album: Album | null) => void>();
    const onHistoryChange = vi.fn();
    const photoMoves: PhotoMoveLink = { current: null };
    render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange}
      bar={{ onHistoryChange }} photoMoves={photoMoves} document={{ path: "Existing", album }} />);
    const latest = () => onAlbumChange.mock.lastCall![0]!;
    return { ports, files, photoMoves, latest, onHistoryChange };
  }

  it("relinks the open Album and its undo steps without adding a step or saving over the move", async () => {
    const { ports, files, photoMoves, latest, onHistoryChange } = openWithPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Bar add-spread" }));
    let given: Album | undefined;
    await act(() => photoMoves.current!(async (album) => {
      given = album;
      files.set("Existing", serializeAlbum(relinkPlacements(album, moves)));
      return moves;
    }));
    expect(given!.pages).toHaveLength(4);
    expect([...photoUsage(latest())]).toEqual([["kids/a.jpg", 1]]);
    expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
    await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
    expect(ports.write).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Bar undo" }));
    expect(latest().pages).toHaveLength(2);
    expect([...photoUsage(latest())]).toEqual([["kids/a.jpg", 1]]);
    expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: true });
    await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages).toHaveLength(2));
    expect(photoUsage(deserializeAlbum(files.get("Existing")!)).get("kids/a.jpg")).toBe(1);
  });

  it("keeps the Album as it was when the move fails, then saves pending edits as usual", async () => {
    const { files, photoMoves, latest } = openWithPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Bar add-spread" }));
    await act(() => expect(photoMoves.current!(async () => { throw new Error("Album locked"); })).rejects.toThrow("Album locked"));
    expect([...photoUsage(latest())]).toEqual([["a.jpg", 1]]);
    await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages).toHaveLength(4));
  });
});

describe("Page Export", () => {
  function exportAlbum() {
    let album = createAlbum({ name: "Christmas", pageCount: 4 });
    album = addPhotoSlot(addPhotoSlot(album, "page-1"), "page-1");
    album = placePhoto(album, "page-1", album.pages[0].slots[0].id, { path: "a.jpg", width: 300, height: 200, orientation: 1 });
    album = addTextSlot(album, "page-2");
    album = setSlotText(album, "page-2", album.pages[1].slots[0].id, "Merry Christmas");
    return album;
  }

  function exportPorts() {
    const photo = document.createElement("canvas");
    return {
      photo,
      ports: {
        prepare: vi.fn<PageExportPorts["prepare"]>(async () => {}),
        missing: vi.fn<PageExportPorts["missing"]>(async () => []),
        openFolder: vi.fn<PageExportPorts["openFolder"]>(async () => {}),
        photo: vi.fn<PageExportPorts["photo"]>(async () => photo),
        render: vi.fn<PageExportPorts["render"]>(async () => ({ pixels: new Uint8Array(4), width: 1, height: 1 })),
        write: vi.fn<PageExportPorts["write"]>(async () => {}),
      },
    };
  }

  it("warns about empty Photo Slots and Pages, then writes every Page in order while showing progress", async () => {
    const album = exportAlbum();
    const { ports, photo } = exportPorts();
    let finishSecond!: () => void;
    ports.write.mockImplementation(async (_root, _name, fileName) => {
      if (fileName === "002.jpg") await new Promise<void>((resolve) => { finishSecond = resolve; });
    });
    render(<AlbumWorkspace root={"D:\\Photos"} ports={disk().ports} photoPorts={previews()} exportPorts={ports}
      document={{ path: "D:\\Photos\\Christmas 2026.phalbum", album }} />);

    fireEvent.click(bar().getByRole("button", { name: "Bar export-pages" }));
    const dialog = within(screen.getByRole("dialog", { name: "Export Pages" }));
    expect(dialog.getByText("4 Pages will be exported to Exports/Christmas 2026.")).toBeTruthy();
    expect(dialog.getByText("Page 1 has 1 empty Photo Slot.")).toBeTruthy();
    expect(dialog.getByText("Pages 3 and 4 are empty.")).toBeTruthy();
    expect(ports.prepare).not.toHaveBeenCalled();

    fireEvent.click(dialog.getByRole("button", { name: "Export" }));
    const progress = await dialog.findByRole("progressbar", { name: "Export progress" });
    await waitFor(() => expect(progress.getAttribute("aria-valuenow")).toBe("1"));
    expect(progress.getAttribute("aria-valuemax")).toBe("4");
    expect(dialog.getByText("Exporting Page 2 of 4…")).toBeTruthy();
    // The editor stays responsive underneath while a Page is being written.
    expect(screen.getByRole("region", { name: "Album Pages" })).toBeTruthy();

    act(() => finishSecond());
    expect(await dialog.findByText("Exported 4 Pages to Exports/Christmas 2026.")).toBeTruthy();
    expect(ports.prepare).toHaveBeenCalledWith("D:\\Photos", "Christmas 2026");
    expect(ports.photo).toHaveBeenCalledWith("D:\\Photos", expect.objectContaining({ photoPath: "a.jpg" }));
    expect(ports.render.mock.calls.map(([page]) => page)).toEqual(album.pages);
    expect(ports.render.mock.calls[0][2]).toEqual(new Map([[album.pages[0].slots[0].id, photo]]));
    expect(ports.write.mock.calls.map((call) => call.slice(0, 3)))
      .toEqual(["001.jpg", "002.jpg", "003.jpg", "004.jpg"].map((file) => ["D:\\Photos", "Christmas 2026", file]));
  });

  it("shows why an export failed and which Photo it could not read", async () => {
    const { ports } = exportPorts();
    ports.photo.mockRejectedValue("The system cannot find the file specified.");
    render(<AlbumWorkspace root={"D:\\Photos"} ports={disk().ports} photoPorts={previews()} exportPorts={ports}
      document={{ path: "D:\\Photos\\Christmas.phalbum", album: exportAlbum() }} />);
    fireEvent.click(bar().getByRole("button", { name: "Bar export-pages" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect((await screen.findByRole("alert")).textContent)
      .toBe("Could not export Pages: Could not read a.jpg for Page 1: The system cannot find the file specified.");
    expect(ports.write).not.toHaveBeenCalled();
  });

  it("opens the Export folder once the export has finished, and says why when it cannot", async () => {
    const { ports } = exportPorts();
    let finish!: () => void;
    ports.write.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AlbumWorkspace root={"D:\\Photos"} ports={disk().ports} photoPorts={previews()} exportPorts={ports}
      document={{ path: "D:\\Photos\\Christmas.phalbum", album: createAlbum({ name: "Christmas", pageCount: 2 }) }} />);
    fireEvent.click(bar().getByRole("button", { name: "Bar export-pages" }));
    const dialog = within(screen.getByRole("dialog", { name: "Export Pages" }));
    fireEvent.click(dialog.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(ports.write).toHaveBeenCalledTimes(1));
    expect(dialog.queryByRole("button", { name: "Open Export folder" })).toBeNull();
    ports.write.mockResolvedValue(undefined);
    act(() => finish());

    fireEvent.click(await dialog.findByRole("button", { name: "Open Export folder" }));
    await waitFor(() => expect(ports.openFolder).toHaveBeenCalledWith("D:\\Photos", "Christmas"));
    ports.openFolder.mockRejectedValueOnce("Access is denied.");
    fireEvent.click(dialog.getByRole("button", { name: "Open Export folder" }));
    expect((await dialog.findByRole("alert")).textContent).toBe("Could not open the Export folder: Access is denied.");
    expect(dialog.getByText("Exported 2 Pages to Exports/Christmas.")).toBeTruthy();
  });

  it("warns about Photos below the Effective Resolution threshold and still exports them", async () => {
    const { ports } = exportPorts();
    // a.jpg is 300 x 200 pixels in a Slot 84 mm tall: about 60 DPI.
    const photoSizes = new Map([["a.jpg", { width: 300, height: 200, orientation: 1 }]]);
    render(<AlbumWorkspace root={"D:\\Photos"} ports={disk().ports} photoPorts={previews()} exportPorts={ports}
      photoSizes={photoSizes} document={{ path: "D:\\Photos\\Christmas.phalbum", album: exportAlbum() }} />);
    fireEvent.click(bar().getByRole("button", { name: "Bar export-pages" }));
    const dialog = within(screen.getByRole("dialog", { name: "Export Pages" }));
    expect(dialog.getByText("Page 1 has a Photo at 60 DPI, below 150 DPI.")).toBeTruthy();

    fireEvent.click(dialog.getByRole("button", { name: "Export" }));
    expect(await dialog.findByText("Exported 4 Pages to Exports/Christmas.")).toBeTruthy();
  });

  it("leaves an earlier export alone when Photos are missing", async () => {
    const { ports } = exportPorts();
    ports.missing.mockResolvedValue(["a.jpg"]);
    render(<AlbumWorkspace root={"D:\\Photos"} ports={disk().ports} photoPorts={previews()} exportPorts={ports}
      document={{ path: "D:\\Photos\\Christmas.phalbum", album: exportAlbum() }} />);
    fireEvent.click(bar().getByRole("button", { name: "Bar export-pages" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect((await screen.findByRole("alert")).textContent)
      .toBe("Could not export Pages: Missing Photos must be relinked or replaced first: a.jpg");
    expect(ports.missing).toHaveBeenCalledWith("D:\\Photos", ["a.jpg"]);
    expect(ports.prepare).not.toHaveBeenCalled();
  });
});

describe("Effective Resolution", () => {
  it("badges Photo Slots below the threshold and rechecks when the Crop or the threshold changes", async () => {
    let album = createAlbum({ name: "Christmas", pageCount: 2 });
    album = addPhotoSlot(addPhotoSlot(album, "page-1"), "page-1");
    // Both Slots print 84 mm (3.31 inches) tall and are filled edge to edge by the Photo's height.
    album = placePhoto(album, "page-1", "slot-1", { path: "small.jpg", width: 300, height: 200, orientation: 1 });
    album = placePhoto(album, "page-1", "slot-2", { path: "medium.jpg", width: 780, height: 520, orientation: 1 });
    const photoSizes = new Map([
      ["small.jpg", { width: 300, height: 200, orientation: 1 }],
      ["medium.jpg", { width: 780, height: 520, orientation: 1 }],
    ]);
    render(<AlbumWorkspace root={"D:\\Photos"} ports={disk().ports} photoPorts={previews()} photoSizes={photoSizes}
      document={{ path: "D:\\Photos\\Christmas.phalbum", album }} />);
    const small = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
    const medium = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
    const badge = (slot: HTMLElement) => within(slot).queryByRole("img", { name: /^Low Effective Resolution/ });
    expect(badge(small)?.getAttribute("aria-label")).toBe("Low Effective Resolution: 60 DPI, below 150 DPI");
    // 520 pixels over 3.31 inches is 157 DPI.
    expect(badge(medium)).toBeNull();

    fireEvent.click(medium);
    fireEvent.click(within(bar().getByRole("group", { name: "Photo Slot tools" })).getByRole("button", { name: "Zoom in" }));
    // 520 pixels zoomed by 1.1 over 3.31 inches is 142.96 DPI, shown rounded down.
    expect(badge(medium)?.getAttribute("aria-label")).toBe("Low Effective Resolution: 142 DPI, below 150 DPI");

    fireEvent.click(bar().getByRole("button", { name: "Bar album-settings" }));
    fireEvent.change(screen.getByLabelText("Effective Resolution warning below (DPI)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply print settings" }));
    expect(badge(small)).toBeNull();
    expect(badge(medium)).toBeNull();
  });
});
