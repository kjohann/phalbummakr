// @vitest-environment jsdom
import { useState, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAlbum, readLayoutLibrary, serializeLayoutLibrary, type LayoutPorts } from "../core";
import LayoutWorkspace, { type LayoutCommand, type LayoutCommandName } from "./LayoutWorkspace";
import { useLayoutLibrary } from "./useLayoutLibrary";

vi.mock("react-konva", () => ({
  Stage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children: ReactNode }) => <>{children}</>,
  Rect: () => null,
  Text: ({ text }: { text: string }) => <span>{text}</span>,
  Group: ({ children, rotation }: { children: ReactNode; rotation?: number }) =>
    <div data-slot-rotation={rotation}>{children}</div>,
}));

vi.mock("konva/lib/shapes/Text", () => ({
  Text: class {
    constructor(private options: { text: string; fontSize: number; lineHeight: number }) {}
    height() { return Math.max(1, Math.ceil(this.options.text.length / 20)) * this.options.fontSize * this.options.lineHeight; }
    measureSize() { return { width: this.options.fontSize * 0.6 }; }
    destroy() {}
  },
}));

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  // A 654 x 480 canvas gives a scale of 2 px per mm, so an A4 trim Page is 594 x 420 px.
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: new DOMRectReadOnly(0, 0, 654, 480) } as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const format = createAlbum({ name: "Summer" }).pageFormat;
const captionIndex = readLayoutLibrary(null, format).layouts.findIndex((layout) =>
  layout.slots.length === 2 && layout.slots[0].type === "photo" && layout.slots[1].type === "text");

function disk(json: string | null = null) {
  const store = { json };
  const ports: LayoutPorts = {
    read: vi.fn(async () => store.json),
    write: vi.fn(async (_root: string, written: string) => { store.json = written; }),
  };
  return { ports, store };
}

/** Stands in for the Side pane, the command bar and the shared Layout Library around Layout mode. */
function Harness({ ports, ...props }: Omit<ComponentProps<typeof LayoutWorkspace>, "paneHost" | "active" | "format" | "layouts"> & { active?: boolean; ports: LayoutPorts }) {
  const [command, setCommand] = useState<LayoutCommand>();
  const [toolsHost, setToolsHost] = useState<HTMLElement | null>(null);
  const [paneHost, setPaneHost] = useState<HTMLElement | null>(null);
  const layouts = useLayoutLibrary({ root: "D:\\Photos", format, ports });
  const send = (name: LayoutCommandName) => setCommand((current) => ({ name, serial: (current?.serial ?? 0) + 1 }));
  return <>
    <section aria-label="Side pane" ref={setPaneHost} />
    <div role="toolbar" aria-label="Commands">
      <div ref={setToolsHost} />
      {(["new-layout", "make-grid-layout", "duplicate-layout", "delete-layout", "add-photo-slot", "add-text-slot", "undo", "redo"] as const).map((name) => (
        <button key={name} type="button" onClick={() => send(name)}>Bar {name}</button>
      ))}
    </div>
    <LayoutWorkspace format={format} layouts={layouts} paneHost={paneHost} active={props.active ?? true}
      {...props} bar={{ ...props.bar, command, toolsHost }} />
  </>;
}

const pane = () => within(screen.getByRole("region", { name: "Side pane" }));
const bar = () => within(screen.getByRole("toolbar", { name: "Commands" }));
const library = () => within(pane().getByRole("list", { name: "Layout Library" }));

it("lists the predefined Layouts in the pane and shows the first on the canvas, without saving anything", async () => {
  const { ports } = disk();
  render(<Harness ports={ports} />);
  const cards = await waitFor(() => {
    const found = library().getAllByRole("button");
    expect(found).toHaveLength(10);
    return found;
  });
  expect(cards[0].getAttribute("aria-label")).toBe("Layout 1: 1 Photo Slot");
  expect(cards[captionIndex].getAttribute("aria-label")).toBe(`Layout ${captionIndex + 1}: 1 Photo Slot, 1 Text Slot`);
  expect(cards[0].getAttribute("aria-pressed")).toBe("true");
  expect(cards.slice(4).map((card) => card.querySelectorAll("svg rect.layout-preview-photo").length))
    .toEqual([4, 5, 5, 4, 5, 6]);
  const canvas = within(screen.getByRole("group", { name: "Layout editor" }));
  expect(canvas.getAllByRole("button", { name: /^(Photo|Text) Slot \d+$/ })).toHaveLength(1);
  fireEvent.click(cards[captionIndex]);
  expect(canvas.getByRole("button", { name: "Text Slot 2" })).toBeTruthy();
  expect(canvas.getByText("Text")).toBeTruthy();
  expect(canvas.queryByText("Sample text")).toBeNull();
  await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
  expect(ports.write).not.toHaveBeenCalled();
});

async function cards() {
  return waitFor(() => {
    const found = library().getAllByRole("button");
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
}

function saved(store: { json: string | null }) {
  return readLayoutLibrary(store.json, format);
}

it("nudges in Layout mode, separates timed runs, and leaves controls and rotation in charge of their keys", async () => {
  const initial = readLayoutLibrary(null, format);
  const original = initial.layouts[0].slots[0];
  Object.assign(original, { x: 0.2, y: 0.2, width: 0.2, height: 0.2 });
  const { ports } = disk(serializeLayoutLibrary(initial));
  render(<Harness ports={ports} />);
  await cards();
  const slot = screen.getByRole("button", { name: "Photo Slot 1" });
  fireEvent.click(slot);
  const start = parseFloat(slot.style.top);
  vi.useFakeTimers();
  fireEvent.keyDown(slot, { key: "ArrowDown", shiftKey: true });
  expect(parseFloat(slot.style.top) - start).toBeCloseTo(20, 7);
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  fireEvent.keyDown(slot, { key: "ArrowDown" });
  expect(parseFloat(slot.style.top) - start).toBeCloseTo(22, 7);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(parseFloat(slot.style.top) - start).toBeCloseTo(20, 7);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(parseFloat(slot.style.top)).toBeCloseTo(start, 7);
  const command = bar().getByRole("button", { name: "Bar add-photo-slot" });
  fireEvent.keyDown(command, { key: "ArrowDown" });
  expect(parseFloat(slot.style.top)).toBeCloseTo(start, 7);
  fireEvent.keyDown(slot, { key: "ArrowRight", ctrlKey: true });
  expect(document.querySelector('[data-slot-rotation="90"]')).not.toBeNull();
});

it("does not create Layout history when a nudge is blocked at the Bleed", async () => {
  const initial = readLayoutLibrary(null, format);
  Object.assign(initial.layouts[0].slots[0], { x: -3 / 297, y: 0.2, width: 0.2, height: 0.2 });
  const { ports } = disk(serializeLayoutLibrary(initial));
  render(<Harness ports={ports} />);
  await cards();
  const slot = screen.getByRole("button", { name: "Photo Slot 1" });
  fireEvent.click(slot);
  const before = slot.style.left;
  fireEvent.keyDown(slot, { key: "ArrowLeft" });
  expect(slot.style.left).toBe(before);
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(slot.style.left).toBe(before);
  expect(ports.write).not.toHaveBeenCalled();
});

it("focuses a pointer-selected Layout Slot so arrow keys work after a toolbar action", async () => {
  const initial = readLayoutLibrary(null, format);
  Object.assign(initial.layouts[0].slots[0], { x: 0.2, y: 0.2, width: 0.2, height: 0.2 });
  const { ports } = disk(serializeLayoutLibrary(initial));
  render(<Harness ports={ports} />);
  await cards();
  const slot = screen.getByRole("button", { name: "Photo Slot 1" });
  bar().getByRole("button", { name: "Bar add-photo-slot" }).focus();
  fireEvent.mouseDown(slot, { button: 0 });
  fireEvent.mouseUp(window);
  fireEvent.click(slot);
  expect(document.activeElement).toBe(slot);
  const before = parseFloat(slot.style.top);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(parseFloat(slot.style.top) - before).toBeCloseTo(2, 7);
});

it("leaves Layout placeholder editing and dialogs in charge of arrow keys", async () => {
  const { ports } = disk();
  render(<Harness ports={ports} fontPorts={{ list: async () => ["Arial"] }} />);
  const choices = await cards();
  fireEvent.click(choices[captionIndex]);
  const slot = screen.getByRole("button", { name: "Text Slot 2" });
  fireEvent.doubleClick(slot);
  const editor = screen.getByRole("textbox", { name: "Edit the placeholder of Text Slot 2" });
  const before = slot.style.left;
  fireEvent.keyDown(editor, { key: "ArrowRight" });
  expect(slot.style.left).toBe(before);
  fireEvent.keyDown(editor, { key: "Escape" });
  fireEvent.click(bar().getByRole("button", { name: "Bar make-grid-layout" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  expect(slot.style.left).toBe(before);
});

it("persists a saved Library's mosaic migration and does not restore deleted additions on reopen", async () => {
  const original = readLayoutLibrary(null, format).layouts[1];
  const { ports, store } = disk(JSON.stringify({ schemaVersion: 1, layouts: [original] }));
  const { unmount } = render(<Harness ports={ports} />);
  await waitFor(() => expect(library().getAllByRole("button")).toHaveLength(7));
  await waitFor(() => expect(JSON.parse(store.json!).schemaVersion).toBe(2), { timeout: 2000 });
  expect(saved(store).layouts[0]).toEqual(original);

  fireEvent.click(library().getAllByRole("button")[1]);
  fireEvent.click(bar().getByRole("button", { name: "Bar delete-layout" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Layout?" })).getByRole("button", { name: "Delete Layout" }));
  await waitFor(() => expect(JSON.parse(store.json!).layouts).toHaveLength(6), { timeout: 2000 });
  const afterDeletion = store.json;
  const writes = vi.mocked(ports.write).mock.calls.length;
  unmount();

  render(<Harness ports={ports} />);
  await waitFor(() => expect(library().getAllByRole("button")).toHaveLength(6));
  await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
  expect(store.json).toBe(afterDeletion);
  expect(ports.write).toHaveBeenCalledTimes(writes);
});

it("reports and retries a failed mosaic migration without losing the saved Layouts", async () => {
  const original = readLayoutLibrary(null, format).layouts[1];
  const { ports, store } = disk(JSON.stringify({ schemaVersion: 1, layouts: [original] }));
  vi.mocked(ports.write).mockRejectedValueOnce(new Error("Disk full"));
  render(<Harness ports={ports} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Could not save the Layout Library: Error: Disk full");
  expect(JSON.parse(store.json!)).toEqual({ schemaVersion: 1, layouts: [original] });
  expect(library().getAllByRole("button")).toHaveLength(7);
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(JSON.parse(store.json!).schemaVersion).toBe(2), { timeout: 2000 });
  expect(saved(store).layouts[0]).toEqual(original);
  expect(saved(store).layouts).toHaveLength(7);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("creates and selects an editable grid Layout without changing the previous Layout", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  const before = await cards();
  const original = before[0].getAttribute("aria-label");
  const originalLayout = saved(store).layouts[0];
  fireEvent.click(bar().getByRole("button", { name: "Bar make-grid-layout" }));
  let dialog = within(screen.getByRole("dialog", { name: "Create grid layout" }));
  fireEvent.click(within(dialog.getByRole("grid", { name: "Grid dimensions" })).getByRole("gridcell", { name: "2 columns x 3 rows" }));
  expect(library().getAllByRole("button")).toHaveLength(10);
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(library().getAllByRole("button")).toHaveLength(10);
  expect(ports.write).not.toHaveBeenCalled();

  fireEvent.click(bar().getByRole("button", { name: "Bar make-grid-layout" }));
  dialog = within(screen.getByRole("dialog", { name: "Create grid layout" }));
  fireEvent.change(dialog.getByLabelText("Columns"), { target: { value: "2" } });
  fireEvent.change(dialog.getByLabelText("Rows"), { target: { value: "3" } });
  fireEvent.click(dialog.getByRole("button", { name: "Create" }));
  const created = library().getAllByRole("button")[10];
  expect(created.getAttribute("aria-label")).toBe("Layout 11: 6 Photo Slots");
  expect(created.getAttribute("aria-pressed")).toBe("true");
  expect(library().getAllByRole("button")[0].getAttribute("aria-label")).toBe(original);
  fireEvent.click(bar().getByRole("button", { name: "Bar add-photo-slot" }));
  expect(created.getAttribute("aria-label")).toBe("Layout 11: 7 Photo Slots");
  await waitFor(() => expect(saved(store).layouts[10].slots).toHaveLength(7));
  expect(saved(store).layouts[0]).toEqual(originalLayout);
});

it("reports and retries a failed grid Layout save", async () => {
  const { ports, store } = disk();
  vi.mocked(ports.write).mockRejectedValueOnce(new Error("Disk full"));
  render(<Harness ports={ports} />);
  await cards();
  fireEvent.click(bar().getByRole("button", { name: "Bar make-grid-layout" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Create grid layout" })).getByRole("button", { name: "Create" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Could not save the Layout Library: Error: Disk full");
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(saved(store).layouts[10].slots).toHaveLength(4));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("creates a new empty Layout, adds Slots to it and saves the Layout Library", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  await cards();
  fireEvent.click(bar().getByRole("button", { name: "Bar new-layout" }));
  const created = library().getAllByRole("button")[10];
  expect(created.getAttribute("aria-label")).toBe("Layout 11: empty");
  expect(created.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(bar().getByRole("button", { name: "Bar add-photo-slot" }));
  fireEvent.click(bar().getByRole("button", { name: "Bar add-text-slot" }));
  expect(library().getAllByRole("button")[10].getAttribute("aria-label")).toBe("Layout 11: 1 Photo Slot, 1 Text Slot");
  await waitFor(() => expect(ports.write).toHaveBeenCalled());
  const layout = saved(store).layouts[10];
  expect(layout.aspectRatio).toBeCloseTo(297 / 210);
  expect(layout.slots).toMatchObject([{ type: "photo", placement: null }, { type: "text", text: "" }]);
  expect(saved(store).layouts).toHaveLength(11);
});

it("Alt-drags a rotated Text Slot preserving its placeholder and formatting, with undo and redo", async () => {
  const initial = readLayoutLibrary(null, format);
  initial.layouts[captionIndex].slots[1].width = 0.3;
  initial.layouts[captionIndex].slots[1].y = 0.3;
  const { ports, store } = disk(serializeLayoutLibrary(initial));
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[captionIndex]);
  const canvas = within(screen.getByRole("group", { name: "Layout editor" }));
  const text = canvas.getByRole("button", { name: "Text Slot 2" });
  fireEvent.click(text);
  fireEvent.doubleClick(text);
  fireEvent.change(screen.getByRole("textbox", { name: "Edit the placeholder of Text Slot 2" }),
    { target: { value: "Caption" } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit the placeholder of Text Slot 2" }), { key: "Escape" });
  fireEvent.click(bar().getByRole("button", { name: "Bold" }));
  fireEvent.click(bar().getByRole("button", { name: "Rotate Slot clockwise" }));
  await waitFor(() => expect(saved(store).layouts[captionIndex].slots[1].rotation).toBe(90));
  const original = saved(store).layouts[captionIndex].slots[1];
  const left = text.style.left;
  fireEvent.mouseDown(text, { button: 0, clientX: 100, clientY: 100, altKey: true, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 120, clientY: 140, ctrlKey: true });
  expect(text.style.left).toBe(left);
  expect(canvas.getAllByText("Caption")).toHaveLength(2);
  fireEvent.mouseUp(window, { clientX: 120, clientY: 140, ctrlKey: true });
  expect(canvas.getByRole("button", { name: "Text Slot 3" }).getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(saved(store).layouts[captionIndex].slots).toHaveLength(3));
  const duplicate = saved(store).layouts[captionIndex].slots[2];
  expect(duplicate).toEqual({ ...original, id: duplicate.id, x: original.x + 20 / 594, y: original.y + 40 / 420 });
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(canvas.queryByRole("button", { name: "Text Slot 3" })).toBeNull();
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(canvas.getByRole("button", { name: "Text Slot 3" })).toBeTruthy();
});

it("cancels an empty Photo Slot duplicate when Layout mode is hidden", async () => {
  const { ports } = disk();
  const { rerender } = render(<Harness ports={ports} />);
  await cards();
  fireEvent.mouseDown(screen.getByRole("button", { name: "Photo Slot 1" }),
    { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: 150, clientY: 150 });
  expect(screen.getByRole("button", { name: "Photo Slot 2" })).toBeTruthy();
  rerender(<Harness ports={ports} active={false} />);
  fireEvent.mouseUp(window, { clientX: 150, clientY: 150 });
  expect(screen.queryByRole("button", { name: "Photo Slot 2" })).toBeNull();
  expect(ports.write).not.toHaveBeenCalled();
});

it("duplicates the selected Layout and deletes a Layout only after confirmation", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  const before = await cards();
  const duplicateDescription = before[1].getAttribute("aria-label")!.replace(/^Layout 2:/, "");
  const nextLabel = before[2].getAttribute("aria-label");
  fireEvent.click(before[1]);
  fireEvent.click(bar().getByRole("button", { name: "Bar duplicate-layout" }));
  let all = library().getAllByRole("button");
  expect(all).toHaveLength(11);
  expect(all[2].getAttribute("aria-label")).toBe(`Layout 3:${duplicateDescription}`);
  expect(all[2].getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(store.json && saved(store).layouts).toHaveLength(11));
  fireEvent.click(bar().getByRole("button", { name: "Bar delete-layout" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Layout?" })).getByRole("button", { name: "Cancel" }));
  expect(library().getAllByRole("button")).toHaveLength(11);
  fireEvent.click(bar().getByRole("button", { name: "Bar delete-layout" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Layout?" })).getByRole("button", { name: "Delete Layout" }));
  all = library().getAllByRole("button");
  expect(all).toHaveLength(10);
  expect(all[2].getAttribute("aria-label")).toBe(nextLabel);
  expect(all[2].getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(saved(store).layouts).toHaveLength(10));
  expect(saved(store).layouts.map((layout) => layout.id)).toEqual(readLayoutLibrary(null, format).layouts.map((layout) => layout.id));
});

it("does not bring deleted predefined Layouts back", async () => {
  const { ports } = disk(serializeLayoutLibrary({ schemaVersion: 2, layouts: [] }));
  render(<Harness ports={ports} />);
  expect(await pane().findByText("No Layouts yet. Use New Layout in the command bar.")).toBeTruthy();
  expect(pane().queryByRole("list", { name: "Layout Library" })).toBeNull();
});

it("moves a Slot with the mouse, as in Album mode", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[1]);
  const slot = screen.getByRole("button", { name: "Photo Slot 1" });
  const before = readLayoutLibrary(null, format).layouts[1].slots[0];
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 120, clientY: 100, ctrlKey: true });
  fireEvent.mouseUp(window, { clientX: 120, clientY: 100, ctrlKey: true });
  await waitFor(() => expect(store.json).not.toBeNull());
  // 20 px at 2 px per mm is 10 mm.
  expect(saved(store).layouts[1].slots[0].x * 297).toBeCloseTo(before.x * 297 + 10);
});

it("resizes a Photo Slot from its left side in Layout mode and persists one undoable change", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[1]);
  const slot = screen.getByRole("button", { name: "Photo Slot 1" });
  const original = readLayoutLibrary(null, format).layouts[1].slots[0];
  const before = { left: parseFloat(slot.style.left), width: parseFloat(slot.style.width), height: slot.style.height };
  expect(within(slot).getAllByRole("button", { name: /^Resize / })).toHaveLength(8);
  fireEvent.mouseDown(screen.getByRole("button", { name: "Resize Photo Slot 1 from left" }),
    { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 110, clientY: 140, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 120, clientY: 180, ctrlKey: true });
  expect(parseFloat(slot.style.left)).toBeCloseTo(before.left + 20, 9);
  expect(parseFloat(slot.style.width)).toBeCloseTo(before.width - 20, 9);
  expect(slot.style.height).toBe(before.height);
  fireEvent.mouseUp(window, { clientX: 120, clientY: 180, ctrlKey: true });
  await waitFor(() => {
    const resized = saved(store).layouts[1].slots[0];
    expect(resized.x).toBeCloseTo(original.x + 20 / 594, 9);
    expect(resized.width).toBeCloseTo(original.width - 20 / 594, 9);
    expect(resized.height).toBe(original.height);
  });
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(parseFloat(slot.style.left)).toBeCloseTo(before.left, 9);
  expect(parseFloat(slot.style.width)).toBeCloseTo(before.width, 9);
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(parseFloat(slot.style.width)).toBeCloseTo(before.width - 20, 9);
});

it("resizes a rotated placeholder from the top in Layout mode without manually changing its fitted height", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[captionIndex]);
  const slot = screen.getByRole("button", { name: "Text Slot 2" });
  fireEvent.click(slot);
  fireEvent.click(screen.getByRole("button", { name: "Rotate Slot clockwise" }));
  const before = { top: parseFloat(slot.style.top), height: parseFloat(slot.style.height), width: slot.style.width };
  expect(within(slot).getAllByRole("button", { name: /^Resize / })).toHaveLength(6);
  expect(within(slot).queryByRole("button", { name: "Resize Text Slot 2 from right" })).toBeNull();
  fireEvent.mouseDown(screen.getByRole("button", { name: "Resize Text Slot 2 from top" }),
    { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  fireEvent.mouseMove(window, { clientX: 180, clientY: 120, ctrlKey: true });
  fireEvent.mouseUp(window, { clientX: 180, clientY: 120, ctrlKey: true });
  expect(parseFloat(slot.style.top)).toBeCloseTo(before.top + 20, 9);
  expect(parseFloat(slot.style.height)).toBeCloseTo(before.height - 20, 9);
  expect(slot.style.width).toBe(before.width);
  await waitFor(() => {
    const resized = saved(store).layouts[captionIndex].slots[1];
    expect(resized.rotation).toBe(90);
    expect(resized.height * 420).toBeCloseTo(before.height - 20, 9);
  });
});

it("offers the Slot tools without content commands, and saves style, rotation and deletion", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[captionIndex]);
  fireEvent.click(screen.getByRole("button", { name: "Text Slot 2" }));
  const textTools = within(bar().getByRole("group", { name: "Text Slot tools" }));
  fireEvent.click(textTools.getByRole("button", { name: "Align right" }));
  fireEvent.click(textTools.getByRole("button", { name: "Italic" }));
  expect(textTools.getByRole("button", { name: "Italic" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Photo Slot 1" }));
  const photoTools = within(bar().getByRole("group", { name: "Photo Slot tools" }));
  expect(photoTools.queryByRole("button", { name: "Fit Photo" })).toBeNull();
  expect(photoTools.queryByRole("button", { name: "Zoom in" })).toBeNull();
  fireEvent.click(photoTools.getByRole("button", { name: "Rotate Slot clockwise" }));
  fireEvent.keyDown(document.body, { key: "ArrowRight", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "ArrowLeft", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "ArrowRight", ctrlKey: true });
  await waitFor(() => expect(store.json).not.toBeNull());
  await waitFor(() => expect(saved(store).layouts[captionIndex].slots[0].rotation).toBe(180));
  expect(saved(store).layouts[captionIndex].slots[1]).toMatchObject({ type: "text", text: "", style: { align: "right", italic: true } });
  fireEvent.click(within(bar().getByRole("group", { name: "Photo Slot tools" })).getByRole("button", { name: "Delete Slot" }));
  await waitFor(() => expect(saved(store).layouts[captionIndex].slots.map((slot) => slot.type)).toEqual(["text"]));
});

it("leaves the Delete key alone while another mode is shown", async () => {
  const { ports } = disk();
  const { rerender } = render(<Harness ports={ports} />);
  await cards();
  fireEvent.click(screen.getByRole("button", { name: "Photo Slot 1" }));
  rerender(<Harness ports={ports} active={false} />);
  fireEvent.keyDown(window, { key: "Delete" });
  fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
  expect(screen.getByRole("button", { name: "Photo Slot 1" })).toBeTruthy();
  expect(document.querySelector('[data-slot-rotation="90"]')).toBeNull();
  expect(bar().queryByRole("group", { name: "Photo Slot tools" })).toBeNull();
});

it("edits a Text Slot's placeholder in Layout mode", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[captionIndex]);
  fireEvent.doubleClick(screen.getByRole("button", { name: "Text Slot 2" }));
  const editor = screen.getByRole("textbox", { name: "Edit the placeholder of Text Slot 2" });
  const slot = screen.getByRole("button", { name: "Text Slot 2" });
  const oneLine = parseFloat(slot.style.height);
  fireEvent.change(editor, { target: { value: "Where and when was this taken?" } });
  // The Layout's Text Slot grows to fit its placeholder, as that is the text it shows.
  expect(parseFloat(screen.getByRole("button", { name: "Text Slot 2" }).style.height)).toBeCloseTo(2 * oneLine);
  fireEvent.change(editor, { target: { value: "Where and when?" } });
  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: /placeholder/ })).toBeNull();
  expect(within(screen.getByRole("group", { name: "Layout editor" })).getByText("Where and when?")).toBeTruthy();
  await waitFor(() => expect(store.json && saved(store).layouts[captionIndex].slots[1]).toMatchObject({ text: "", placeholder: "Where and when?" }));
});

it("keeps a separate undo history for each Layout", async () => {
  const { ports } = disk();
  const onStateChange = vi.fn();
  render(<Harness ports={ports} bar={{ onStateChange }} />);
  const canvas = () => within(screen.getByRole("group", { name: "Layout editor" }));
  const deleteSlot = (name: string) => {
    fireEvent.click(canvas().getByRole("button", { name }));
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(canvas().queryByRole("button", { name })).toBeNull();
  };
  await cards();
  deleteSlot("Photo Slot 1");
  fireEvent.click(library().getAllByRole("button")[captionIndex]);
  expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: false, canRedo: false }));
  deleteSlot("Text Slot 2");
  expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: true, canRedo: false }));

  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(canvas().getByRole("button", { name: "Text Slot 2" })).toBeTruthy();
  expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ canUndo: false, canRedo: true }));
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(canvas().getByRole("button", { name: "Photo Slot 1" })).toBeTruthy();

  fireEvent.click(library().getAllByRole("button")[0]);
  expect(canvas().queryByRole("button", { name: "Photo Slot 1" })).toBeNull();
  fireEvent.click(bar().getByRole("button", { name: "Bar undo" }));
  expect(canvas().getByRole("button", { name: "Photo Slot 1" })).toBeTruthy();
  fireEvent.click(bar().getByRole("button", { name: "Bar redo" }));
  expect(canvas().queryByRole("button", { name: "Photo Slot 1" })).toBeNull();
});
