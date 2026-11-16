// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addTextSlot, createAlbum, deserializeAlbum, photoUsage, serializeAlbum, type Album, type AlbumPorts } from "../core";
import AlbumWorkspace from "./AlbumWorkspace";
import PhotoBrowser from "./PhotoBrowser";
import TextSlotControls from "./TextSlotControls";
import { tauriPhotoPorts } from "./tauriPhotoPorts";

vi.mock("react-konva", () => ({
  Stage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children: ReactNode }) => <>{children}</>,
  Rect: () => null,
  Text: () => null,
  Group: ({ children }: { children: ReactNode }) => <>{children}</>,
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("text-slot-controls")
      ? new DOMRect(0, 0, 440, 40)
      : new DOMRect();
  });
  // A 1278 x 800 editor gives a scale of 2 px per mm, so an A4 trim Page is 594 x 420 px.
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const controls = target.classList.contains("text-slot-controls");
      this.callback([{ target, contentRect: new DOMRectReadOnly(0, 0, controls ? 440 : 1278, controls ? 40 : 800) } as ResizeObserverEntry], this);
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

function setExactFontSize(points: string) {
  fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "custom" } });
  const input = screen.getByLabelText("Font size (pt)");
  fireEvent.change(input, { target: { value: points } });
  fireEvent.keyDown(input, { key: "Enter" });
}

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

it("positions right-page text controls before the first ResizeObserver notification", () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, 440, 40));
  render(<TextSlotControls anchor={{ x: 1100, y: 50, width: 100, height: 20 }}
    viewport={{ width: 1278, height: 800 }}
    style={{ fontFamily: "Arial", fontSize: 18, color: "#000000", bold: false, italic: false, underline: false, align: "left" }}
    fonts={["Arial"]} fontError={null} disabled={false}
    onStyle={vi.fn()} onRetryFonts={vi.fn()} onShortcut={vi.fn()} />);
  const controls = screen.getByRole("toolbar", { name: "Text Slot controls" });
  expect(controls.style.left).toBe("830px");
  expect(controls.style.top).toBe("8px");

  bounds.mockReturnValue(new DOMRect(0, 0, 500, 80));
  fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "custom" } });
  expect(controls.style.left).toBe("770px");
  expect(controls.style.top).toBe("78px");
});

it("keeps the text toolbar beside a tall Slot when it cannot fit above or below", () => {
  render(<TextSlotControls anchor={{ x: 800, y: 10, width: 20, height: 380 }}
    viewport={{ width: 1278, height: 400 }}
    style={{ fontFamily: "Arial", fontSize: 18, color: "#000000", bold: false, italic: false, underline: false, align: "left" }}
    fonts={["Arial"]} fontError={null} disabled={false}
    onStyle={vi.fn()} onRetryFonts={vi.fn()} onShortcut={vi.fn()} />);
  const controls = screen.getByRole("toolbar", { name: "Text Slot controls" });
  expect(parseFloat(controls.style.left) + 440).toBeLessThanOrEqual(800);
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

it("attaches compact text controls to the box with presets and an exact point size", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root={"D:\\Photos"} ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Text Slot" }));
  const controls = screen.getByRole("toolbar", { name: "Text Slot controls" });
  expect(screen.getByRole("group", { name: "Spread editor" }).contains(controls)).toBe(true);
  expect(document.querySelector(".page-toolbar")?.contains(screen.getByLabelText("Font family"))).toBe(false);
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
  fireEvent.keyDown(screen.getByRole("toolbar", { name: "Text Slot controls" }), { key: "i", ctrlKey: true });
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

it("pans a rotated Photo in the direction dragged on the Page", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot clockwise" }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].rotation).toBe(90));
  const before = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  drag(slot, 20, 0);
  await waitFor(() => {
    const crop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
    expect(crop.x).toBeCloseTo(before.x);
    expect(crop.y).toBeCloseTo(before.y + before.height * 0.1);
  });
});

it("keeps the sibling Photo browser in sync with edits and Album switches", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 1 })));
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
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  fireEvent.drop(screen.getByRole("button", { name: "Page 1 Photo Slot 1" }), photoDrop(photo));
  expect(screen.getByLabelText("Used 1 time in this Album")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Unused in this Album" }));
  expect(screen.queryByText("tree.jpg")).toBeNull();
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Open Album Other" }));
  await screen.findByRole("heading", { name: "Other" });
  expect(await screen.findByText("tree.jpg")).toBeTruthy();
  expect(screen.queryByLabelText("Used 1 time in this Album")).toBeNull();
});

it("keeps a duplicate drop and its Usage while a wheel Crop gesture is pending", async () => {
  const { ports, files } = disk();
  const photo = { path: "tree.jpg", width: 6000, height: 4000, orientation: 1, captureDate: 0, revision: "1" };
  const photoPorts = previews();
  vi.spyOn(tauriPhotoPorts, "scan").mockResolvedValue({ photos: [photo], folders: [], warnings: [] });
  vi.spyOn(tauriPhotoPorts, "thumbnail").mockResolvedValue("data:image/png;base64,dGVzdA==");
  function Workspace() {
    const [album, setAlbum] = useState<Album | null>(null);
    return <><PhotoBrowser root="D:\\Photos" album={album} />
      <AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={photoPorts} onAlbumChange={setAlbum} /></>;
  }
  render(<Workspace />);
  await screen.findByText("tree.jpg");
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const firstSlot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(firstSlot, photoDrop(photo));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const secondSlot = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  const originalCrop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;

  vi.useFakeTimers();
  fireEvent.click(firstSlot);
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  fireEvent.wheel(firstSlot, { deltaY: -100 });
  fireEvent.drop(secondSlot, photoDrop(photo));
  expect(screen.getByText("tree.jpg is already used in this Album.")).toBeTruthy();
  expect(screen.getByLabelText("Used 2 times in this Album")).toBeTruthy();

  await act(() => vi.advanceTimersByTimeAsync(220));
  expect(screen.getByLabelText("Used 2 times in this Album")).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(500));
  const saved = deserializeAlbum(files.get("Existing")!);
  expect(photoUsage(saved).get(photo.path)).toBe(2);
  expect(saved.pages[0].slots[0].placement!.crop.width).toBeLessThan(originalCrop.width);
});

it("keeps the replacement Photo's centred Crop when a wheel gesture was pending", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  fireEvent.wheel(slot, { deltaY: -100 });
  fireEvent.drop(slot, photoDrop({ path: "portrait.jpg", width: 4000, height: 6000, orientation: 1 }));
  await act(() => vi.advanceTimersByTimeAsync(220));
  await act(() => vi.advanceTimersByTimeAsync(500));

  const placement = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!;
  expect(placement.photoPath).toBe("portrait.jpg");
  expect(placement.crop.x).toBe(0);
  expect(placement.crop.y).toBeCloseTo(0.264310, 5);
  expect(placement.crop.width).toBe(1);
  expect(placement.crop.height).toBeCloseTo(0.471380, 5);
});

it("keeps Album switching locked until a wheel Crop gesture is saved", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 1 })));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  const originalWidth = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop.width;

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  fireEvent.wheel(slot, { deltaY: -100 });
  const otherAlbum = screen.getByRole("button", { name: "Open Album Other" }) as HTMLButtonElement;
  expect(otherAlbum.disabled).toBe(true);
  expect(screen.getByText("Saving...")).toBeTruthy();

  await act(() => vi.advanceTimersByTimeAsync(220));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop.width).toBeLessThan(originalWidth);
  expect(otherAlbum.disabled).toBe(false);
  fireEvent.click(otherAlbum);
  await act(async () => {});
  expect(screen.getByRole("heading", { name: "Other" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("combines a wheel Crop gesture with an immediate Zoom in command", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  fireEvent.wheel(slot, { deltaY: -100 });
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await act(() => vi.advanceTimersByTimeAsync(220));
  await act(() => vi.advanceTimersByTimeAsync(500));

  const crop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(crop.width).toBeCloseTo(0.64328845, 6);
});

it("preserves wheel Crop gestures when moving between Photo Slots", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const firstSlot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(firstSlot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const secondSlot = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.drop(secondSlot, photoDrop({ path: "portrait.jpg", width: 4000, height: 6000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  const original = deserializeAlbum(files.get("Existing")!).pages[0].slots.map((slot) => slot.placement!.crop.width);

  vi.useFakeTimers();
  fireEvent.click(firstSlot);
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  fireEvent.wheel(firstSlot, { deltaY: -100 });
  fireEvent.click(secondSlot);
  fireEvent.wheel(secondSlot, { deltaY: -100 });
  await act(() => vi.advanceTimersByTimeAsync(220));
  await act(() => vi.advanceTimersByTimeAsync(500));

  const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  expect(saved[0].placement!.crop.width).toBeLessThan(original[0]);
  expect(saved[1].placement!.crop.width).toBeLessThan(original[1]);
});

it("deletes a Photo Slot safely while its wheel Crop gesture is pending", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  fireEvent.wheel(slot, { deltaY: -100 });
  fireEvent.click(screen.getByRole("button", { name: "Delete Slot" }));
  await act(() => vi.advanceTimersByTimeAsync(500));

  expect(screen.queryByRole("button", { name: "Page 1 Photo Slot 1" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(deserializeAlbum(files.get("Existing")!).pages[0].slots).toEqual([]);
});

it("does not start an earlier save during a Crop pan", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());

  vi.useFakeTimers();
  const writesBefore = vi.mocked(ports.write).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore);
  fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore);

  fireEvent.mouseUp(window, { clientX: 80, clientY: 100 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(ports.write).toHaveBeenCalledTimes(writesBefore + 1);
  const crop = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(crop.width).toBeCloseTo(0.785714, 5);
  expect(crop.x).toBeGreaterThan(0.107);
});

it("finishes a Crop pan when the window loses focus", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 1 })));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  const original = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100 });
  fireEvent.mouseMove(window, { clientX: 80, clientY: 100 });
  fireEvent.blur(window);
  await act(() => vi.advanceTimersByTimeAsync(500));

  const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots[0].placement!.crop;
  expect(saved.x).toBeGreaterThan(original.x);
  expect((screen.getByRole("button", { name: "Open Album Other" }) as HTMLButtonElement).disabled).toBe(false);
});

it("serializes saves when a Slot drag ends during an earlier Crop save", async () => {
  const { ports, files } = disk();
  files.set("Other", serializeAlbum(createAlbum({ name: "Other", pageCount: 1 })));
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const slot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(slot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());

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
  expect(saved.placement!.crop.width).toBeCloseTo(0.785714, 5);
  expect((screen.getByRole("button", { name: "Open Album Other" }) as HTMLButtonElement).disabled).toBe(false);
});

it("wheel-zooms only the selected Photo Slot in Crop mode and prevents scrolling", async () => {
  const { ports, files } = disk();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const firstSlot = screen.getByRole("button", { name: "Page 1 Photo Slot 1" });
  fireEvent.drop(firstSlot, photoDrop({ path: "tree.jpg", width: 6000, height: 4000, orientation: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Add Photo Slot" }));
  const secondSlot = screen.getByRole("button", { name: "Page 1 Photo Slot 2" });
  fireEvent.drop(secondSlot, photoDrop({ path: "portrait.jpg", width: 4000, height: 6000, orientation: 1 }));
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  const original = deserializeAlbum(files.get("Existing")!).pages[0].slots.map((slot) => slot.placement!.crop);

  vi.useFakeTimers();
  fireEvent.click(firstSlot);
  const withoutCrop = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
  fireEvent(firstSlot, withoutCrop);
  expect(withoutCrop.defaultPrevented).toBe(false);
  expect(screen.queryByText("Saving...")).toBeNull();

  fireEvent.click(screen.getByRole("checkbox", { name: "Crop photo" }));
  const unselected = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
  fireEvent(secondSlot, unselected);
  expect(unselected.defaultPrevented).toBe(false);
  expect(screen.queryByText("Saving...")).toBeNull();

  const selected = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
  fireEvent(firstSlot, selected);
  expect(selected.defaultPrevented).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(220));
  await act(() => vi.advanceTimersByTimeAsync(500));
  const saved = deserializeAlbum(files.get("Existing")!).pages[0].slots;
  expect(saved[0].placement!.crop.width).toBeLessThan(original[0].width);
  expect(saved[1].placement!.crop).toEqual(original[1]);
});

it("reports Album changes and warns without blocking duplicate drops on Slots and Pages", async () => {
  const { ports, files } = disk();
  const onAlbumChange = vi.fn<(album: Album | null) => void>();
  render(<AlbumWorkspace root="D:\\Photos" ports={ports} photoPorts={previews()} onAlbumChange={onAlbumChange} />);
  expect(onAlbumChange).toHaveBeenLastCalledWith(null);
  fireEvent.click(await screen.findByRole("button", { name: "Open Album Existing" }));
  await screen.findByRole("heading", { name: "Existing" });
  await waitFor(() => expect(onAlbumChange.mock.lastCall?.[0]?.name).toBe("Existing"));
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
  await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
  expect(photoUsage(deserializeAlbum(files.get("Existing")!)).get("tree.jpg")).toBe(3);
});

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
  const writesBeforePan = vi.mocked(ports.write).mock.calls.length;
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
  const writesBeforeZoom = vi.mocked(ports.write).mock.calls.length;
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
