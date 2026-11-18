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
      {(["new-layout", "duplicate-layout", "delete-layout", "add-photo-slot", "add-text-slot", "undo", "redo"] as const).map((name) => (
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
    expect(found).toHaveLength(11);
    return found;
  });
  expect(cards[0].getAttribute("aria-label")).toBe("Layout 1: 1 Photo Slot");
  expect(cards[9].getAttribute("aria-label")).toBe("Layout 10: 1 Photo Slot, 1 Text Slot");
  expect(cards[0].getAttribute("aria-pressed")).toBe("true");
  expect(cards[7].querySelectorAll("svg rect.layout-preview-photo")).toHaveLength(6);
  const canvas = within(screen.getByRole("group", { name: "Layout editor" }));
  expect(canvas.getAllByRole("button", { name: /^(Photo|Text) Slot \d+$/ })).toHaveLength(1);
  fireEvent.click(cards[9]);
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

it("creates a new empty Layout, adds Slots to it and saves the Layout Library", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  await cards();
  fireEvent.click(bar().getByRole("button", { name: "Bar new-layout" }));
  const created = library().getAllByRole("button")[11];
  expect(created.getAttribute("aria-label")).toBe("Layout 12: empty");
  expect(created.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(bar().getByRole("button", { name: "Bar add-photo-slot" }));
  fireEvent.click(bar().getByRole("button", { name: "Bar add-text-slot" }));
  expect(library().getAllByRole("button")[11].getAttribute("aria-label")).toBe("Layout 12: 1 Photo Slot, 1 Text Slot");
  await waitFor(() => expect(ports.write).toHaveBeenCalled());
  const layout = saved(store).layouts[11];
  expect(layout.aspectRatio).toBeCloseTo(297 / 210);
  expect(layout.slots).toMatchObject([{ type: "photo", placement: null }, { type: "text", text: "" }]);
  expect(saved(store).layouts).toHaveLength(12);
});

it("duplicates the selected Layout and deletes a Layout only after confirmation", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[1]);
  fireEvent.click(bar().getByRole("button", { name: "Bar duplicate-layout" }));
  let all = library().getAllByRole("button");
  expect(all).toHaveLength(12);
  expect(all[2].getAttribute("aria-label")).toBe("Layout 3: 2 Photo Slots");
  expect(all[2].getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(store.json && saved(store).layouts).toHaveLength(12));
  fireEvent.click(bar().getByRole("button", { name: "Bar delete-layout" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Layout?" })).getByRole("button", { name: "Cancel" }));
  expect(library().getAllByRole("button")).toHaveLength(12);
  fireEvent.click(bar().getByRole("button", { name: "Bar delete-layout" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Delete Layout?" })).getByRole("button", { name: "Delete Layout" }));
  all = library().getAllByRole("button");
  expect(all).toHaveLength(11);
  expect(all[2].getAttribute("aria-label")).toBe("Layout 3: 3 Photo Slots");
  expect(all[2].getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(saved(store).layouts).toHaveLength(11));
  expect(saved(store).layouts.map((layout) => layout.id)).toEqual(readLayoutLibrary(null, format).layouts.map((layout) => layout.id));
});

it("does not bring deleted predefined Layouts back", async () => {
  const { ports } = disk(serializeLayoutLibrary({ schemaVersion: 1, layouts: [] }));
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
  fireEvent.mouseDown(slot, { button: 0, clientX: 100, clientY: 100, altKey: true });
  fireEvent.mouseMove(window, { clientX: 120, clientY: 100, altKey: true });
  fireEvent.mouseUp(window, { clientX: 120, clientY: 100, altKey: true });
  await waitFor(() => expect(store.json).not.toBeNull());
  // 20 px at 2 px per mm is 10 mm.
  expect(saved(store).layouts[1].slots[0].x * 297).toBeCloseTo(before.x * 297 + 10);
});

it("offers the Slot tools without content commands, and saves style, rotation and deletion", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[9]);
  fireEvent.click(screen.getByRole("button", { name: "Text Slot 2" }));
  const textTools = within(bar().getByRole("group", { name: "Text Slot tools" }));
  fireEvent.change(textTools.getByLabelText("Text alignment"), { target: { value: "right" } });
  fireEvent.click(screen.getByRole("button", { name: "Photo Slot 1" }));
  const photoTools = within(bar().getByRole("group", { name: "Photo Slot tools" }));
  expect(photoTools.queryByRole("button", { name: "Fit Photo" })).toBeNull();
  expect(photoTools.queryByRole("button", { name: "Zoom in" })).toBeNull();
  fireEvent.click(photoTools.getByRole("button", { name: "Rotate Slot clockwise" }));
  await waitFor(() => expect(store.json).not.toBeNull());
  await waitFor(() => expect(saved(store).layouts[9].slots[0].rotation).toBe(90));
  expect(saved(store).layouts[9].slots[1]).toMatchObject({ type: "text", text: "", style: { align: "right" } });
  fireEvent.click(within(bar().getByRole("group", { name: "Photo Slot tools" })).getByRole("button", { name: "Delete Slot" }));
  await waitFor(() => expect(saved(store).layouts[9].slots.map((slot) => slot.type)).toEqual(["text"]));
});

it("leaves the Delete key alone while another mode is shown", async () => {
  const { ports } = disk();
  const { rerender } = render(<Harness ports={ports} />);
  await cards();
  fireEvent.click(screen.getByRole("button", { name: "Photo Slot 1" }));
  rerender(<Harness ports={ports} active={false} />);
  fireEvent.keyDown(window, { key: "Delete" });
  expect(screen.getByRole("button", { name: "Photo Slot 1" })).toBeTruthy();
  expect(bar().queryByRole("group", { name: "Photo Slot tools" })).toBeNull();
});

it("edits a Text Slot's placeholder in Layout mode", async () => {
  const { ports, store } = disk();
  render(<Harness ports={ports} />);
  fireEvent.click((await cards())[9]);
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
  await waitFor(() => expect(store.json && saved(store).layouts[9].slots[1]).toMatchObject({ text: "", placeholder: "Where and when?" }));
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
  fireEvent.click(library().getAllByRole("button")[9]);
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
