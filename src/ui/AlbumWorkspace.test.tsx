// @vitest-environment jsdom
import { useState, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addPhotoSlot, addTextSlot, createAlbum, deserializeAlbum, photoUsage, placePhoto, readLayoutLibrary, rotateSlot, serializeAlbum, serializeLayoutLibrary, setSlotPlaceholder, setSlotText, type Album, type AlbumPorts, type Layout, type LayoutPorts } from "../core";
import Workspace, { type AlbumCommand, type AlbumCommandName } from "./AlbumWorkspace";
import PhotoBrowser from "./PhotoBrowser";
import { PhotoSlotTools } from "./SlotTools";
import { tauriPhotoPorts } from "./tauriPhotoPorts";
import { useLayoutLibrary } from "./useLayoutLibrary";
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
      {(["album-settings", "add-spread", "save-as-layout"] as const).map((name) => (
        <button key={name} type="button" onClick={() => send(name)}>Bar {name}</button>
      ))}
    </div>
    <Workspace {...props} bar={{ ...props.bar, command, toolsHost }} />
  </>;
}

const MenuHarness = AlbumWorkspace;
const bar = () => within(screen.getByRole("toolbar", { name: "Commands" }));

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

it("asks before discarding a Spread with content and can disable future prompts", async () => {
  const { ports } = disk();
  const setConfirmSpreadDeletion = vi.fn(async () => {});
  const album = addTextSlot(createAlbum({ name: "Existing", pageCount: 4 }), "page-3");
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={{ path: "Existing", album }}
    setConfirmSpreadDeletion={setConfirmSpreadDeletion} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Spread 2" }));
  const dialog = within(screen.getByRole("dialog", { name: "Discard Spread and its content?" }));
  expect(dialog.getByLabelText("Never ask again")).toBe(document.activeElement);
  screen.getByRole("button", { name: "Add Photo Slot" }).focus();
  expect(dialog.getByLabelText("Never ask again")).toBe(document.activeElement);
  fireEvent.click(dialog.getByLabelText("Never ask again"));
  fireEvent.click(dialog.getByRole("button", { name: "Discard Spread" }));
  await waitFor(() => expect(setConfirmSpreadDeletion).toHaveBeenCalledWith(false));
  await waitFor(() => expect(screen.getByText(/ OF 2$/)).toBeTruthy());
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

it("cancels a destructive Spread deletion and honors the disabled preference", () => {
  const { ports } = disk();
  let album = createAlbum({ name: "Existing", pageCount: 4 });
  album = addTextSlot(addTextSlot(album, "page-1"), "page-2");
  const document = { path: "Existing", album };
  const { rerender } = render(<AlbumWorkspace root="D:\\Photos" ports={ports} document={document} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Spread 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText(/ OF 4$/)).toBeTruthy();
  rerender(<AlbumWorkspace root="D:\\Photos" ports={ports} document={document} confirmSpreadDeletion={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Spread 2" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText(/ OF 2$/)).toBeTruthy();
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
  fireEvent.click(within(controls).getByText("Format"));
  fireEvent.click(within(controls).getByLabelText("Underline"));
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
  expect((screen.getByLabelText("Bold") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Italic") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Underline") as HTMLInputElement).checked).toBe(true);
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
  fireEvent.click(screen.getByText("Format"));
  fireEvent.click(screen.getByLabelText("Bold"));
  fireEvent.click(screen.getByLabelText("Italic"));
  fireEvent.change(screen.getByLabelText("Text alignment"), { target: { value: "center" } });
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
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} confirmSlotDeletion={false} />);
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

it("snaps a Text Slot's width to the Safe Zone after releasing Alt", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { target: { value: "One\nTwo" } });

  const slot = screen.getByRole("button", { name: "Page 1 Text Slot 1" });
  const handle = screen.getByRole("button", { name: "Resize Page 1 Text Slot 1" });
  const safeRight = 1 - 5 / 297;
  const endX = 100 + (safeRight - 0.7) * 594 + 3;
  fireEvent.mouseDown(handle, { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: endX, clientY: 180, altKey: true });
  expect(parseFloat(slot.style.width)).toBeCloseTo((safeRight - 0.3) * 594 + 3);
  expect(screen.queryByLabelText("Snap to Safe Zone")).toBeNull();

  fireEvent.keyUp(window, { key: "Alt", altKey: false });
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
  fireEvent.change(screen.getByLabelText("Bleed (mm)"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("Safe Zone (mm)"), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("Export resolution (DPI)"), { target: { value: "600" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await waitForAutosave();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.queryByLabelText("Bleed (mm)")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  expect(screen.queryByLabelText("Page 1 side")).toBeNull();
  expect((screen.getByLabelText("Bleed (mm)") as HTMLInputElement).value).toBe("4");
  expect((screen.getByLabelText("Safe Zone (mm)") as HTMLInputElement).value).toBe("7");
  expect((screen.getByLabelText("Export resolution (DPI)") as HTMLInputElement).value).toBe("600");
  fireEvent.change(screen.getByLabelText("Safe Zone (mm)"), { target: { value: "105" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  expect(screen.getByRole("alert").textContent).toContain("Safe Zone");
  expect(screen.getByText("Safe Zone: 7 mm")).toBeTruthy();
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
  fireEvent.change(screen.getByLabelText("Bleed (mm)"), { target: { value: "4" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await act(() => vi.advanceTimersByTimeAsync(300));
  fireEvent.change(screen.getByLabelText("Bleed (mm)"), { target: { value: "6" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  expect((screen.getByRole("button", { name: "New Album" }) as HTMLButtonElement).disabled).toBe(true);
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(() => vi.advanceTimersByTimeAsync(499));
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm).toBe(3);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm).toBe(6);
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(false);
  expect(ports.write).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Open Album Existing" }));
  await waitFor(() => expect(screen.queryByLabelText("Bleed (mm)")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings" }));
  await waitFor(() => expect((screen.getByLabelText("Bleed (mm)") as HTMLInputElement).value).toBe("6"));
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
  fireEvent.change(screen.getByLabelText("Bleed (mm)"), { target: { value: "4" } });
  fireEvent.submit(screen.getByRole("form", { name: "Album settings" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(screen.getByRole("alert").textContent).toContain("Disk full");
  expect(screen.queryByText("Not saved")).toBeNull();
  expect((screen.getByRole("button", { name: "Insert Spread before Spread 2" }) as HTMLButtonElement).disabled).toBe(true);
  expect(within(screen.getByRole("navigation", { name: "Spreads" }))
    .getByRole("button", { name: "Select Page 1" }).draggable).toBe(false);
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm).toBe(3);
  expect((screen.getByRole("button", { name: "Open Album Existing" }) as HTMLButtonElement).disabled).toBe(true);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).pageFormat.bleedMm).toBe(4);
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

  for (const button of [toolbar.getByText("Format"), toolbar.getByRole("button", { name: "Rotate Slot clockwise" })]) {
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

it("asks before deleting the selected Slot from the toolbar or Delete key and can stop asking", async () => {
  const { ports } = disk();
  const setConfirmSlotDeletion = vi.fn(async () => {});
  const { rerender } = render(<AlbumWorkspace root="D:\\Photos" ports={ports} setConfirmSlotDeletion={setConfirmSlotDeletion}
    fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit Page 1 Text Slot 1" }), { key: "Delete" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.click(bar().getByRole("button", { name: "Delete Slot" }));
  let dialog = within(screen.getByRole("dialog", { name: "Delete Slot?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Page 1 Photo Slot 2" })).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "Delete" });
  dialog = within(screen.getByRole("dialog", { name: "Delete Slot?" }));
  fireEvent.click(dialog.getByLabelText("Never ask again"));
  fireEvent.click(dialog.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 2" })).toBeNull());
  expect(setConfirmSlotDeletion).toHaveBeenCalledWith(false);
  rerender(<AlbumWorkspace root="D:\\Photos" ports={ports} setConfirmSlotDeletion={setConfirmSlotDeletion}
    fontPorts={{ list: async () => ["Arial"] }} confirmSlotDeletion={false} />);
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
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rotate left", "Rotate right", "Delete"]);
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
  expect(screen.getByRole("dialog", { name: "Delete Slot?" })).toBeTruthy();
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
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Slot?" })).getByRole("button", { name: "Delete" }));
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
  expect(screen.queryByRole("dialog", { name: "Delete Slot?" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Bar album-settings", hidden: true }));
  expect(screen.getByRole("dialog", { name: "Album settings" }).closest("[hidden]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  rerender(<div><AlbumWorkspace {...props} active /></div>);
  fireEvent.keyDown(window, { key: "Delete" });
  expect(screen.getByRole("dialog", { name: "Delete Slot?" })).toBeTruthy();
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

it("temporarily bypasses and restores snapping with Alt during a Slot drag", async () => {
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

  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  expect(parseFloat(slot.style.left)).toBeCloseTo(trimLeft + 4);
  expect(screen.queryByLabelText("Snap to Page edge")).toBeNull();
  fireEvent.keyUp(window, { key: "Alt", altKey: false });
  expect(parseFloat(slot.style.left)).toBeCloseTo(trimLeft);
  expect(screen.getByLabelText("Snap to Page edge")).toBeTruthy();

  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  fireEvent.mouseUp(window, { clientX: endX, clientY: 100, altKey: true });
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].x).toBeCloseTo(4 / 594, 9);
  });
});

it("shows every aligned Slot edge and center during a drag and clears them with Alt", async () => {
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
  expect(guidePositions()).toEqual([trimTop + 105, trimTop + 157.5, trimTop + 210]);

  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  expect(screen.queryByLabelText("Snap to Slot")).toBeNull();
  fireEvent.keyUp(window, { key: "Alt", altKey: false });
  expect(guidePositions()).toEqual([trimTop + 105, trimTop + 157.5, trimTop + 210]);
  fireEvent.mouseUp(window, { clientX: 100, clientY: endY });
  expect(screen.queryByLabelText("Snap to Slot")).toBeNull();
  await waitFor(() => {
    expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].y).toBeCloseTo(0.25, 9);
  });
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
  const album = createAlbum({ name: "Existing", pageCount: 2, bleedMm: 2 });
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
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} photoPorts={previews()} confirmSlotDeletion={false} />);
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
  fireEvent.click(screen.getByRole("checkbox", { name: "Unused in this Album" }));
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
  const store = { json: serializeLayoutLibrary({ schemaVersion: 1, layouts }) as string | null };
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
});

const canvasPage = (number: number) =>
  within(screen.getByRole("group", { name: "Spread editor" })).getByRole("button", { name: `Select Page ${number}` });

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
