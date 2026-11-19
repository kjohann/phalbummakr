// @vitest-environment jsdom
import { useState } from "react";
import { createPortal } from "react-dom";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TextStyle } from "../core";
import CommandBar, { type BarCommand } from "./CommandBar";
import TextSlotTools from "./TextSlotTools";

let barWidth = 1000;
let resize: () => void = () => {};

beforeEach(() => {
  // Commands need 300 px. The Text Slot tools need 500 px with inline buttons, of which the
  // formatting and alignment buttons take 200 px; folded into dropdowns those take 100 px.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("command-bar--measure")) return 300;
    if (this.dataset.command) return 100;
    if (this.dataset.more !== undefined) return 30;
    if (this.classList.contains("text-slot-tools")) return this.querySelector(".slot-tools-set") ? 500 : 400;
    if (this.classList.contains("slot-tools-set")) return 100;
    if (this.classList.contains("slot-tools-fold")) return 50;
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("command-bar") && !this.classList.contains("command-bar--measure") ? barWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("command-tools") ? this.querySelector<HTMLElement>(".text-slot-tools")?.offsetWidth ?? 0 : 0;
  });
  const callbacks = new Set<() => void>();
  resize = () => callbacks.forEach((callback) => callback());
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { callbacks.add(() => callback([], this as unknown as ResizeObserver)); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  barWidth = 1000;
});

const style: TextStyle = { fontFamily: "Arial", fontSize: 18, color: "#000000", bold: true, italic: false, underline: false, align: "center" };

function Harness({ onStyle }: { onStyle: (style: Partial<TextStyle>) => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const settings: BarCommand = { id: "settings", label: "Album Settings…", overflow: 1, run: vi.fn() };
  return <>
    <CommandBar context={[]} document={[settings]} toolsRef={setHost} />
    {host && createPortal(<TextSlotTools style={style} fonts={["Arial"]} fontError={null} disabled={false}
      onStyle={onStyle} onCommit={vi.fn()} onRetryFonts={vi.fn()} onShortcut={vi.fn()} />, host)}
  </>;
}

const tools = () => within(screen.getByRole("group", { name: "Text Slot tools" }));

it("folds the formatting and alignment buttons into dropdowns before commands move into ⋯, and unfolds when there is room", () => {
  const onStyle = vi.fn();
  barWidth = 700;
  render(<Harness onStyle={onStyle} />);
  // 300 px of commands and 500 px of inline tools don't fit in 700 px, so the buttons fold, leaving 400 px of tools.
  expect(tools().queryByRole("button", { name: "Bold" })).toBeNull();
  expect(screen.queryByRole("button", { name: "More commands" })).toBeNull();
  fireEvent.click(tools().getByText("Format"));
  expect((tools().getByRole("checkbox", { name: "Bold" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(tools().getByRole("checkbox", { name: "Italic" }));
  expect(onStyle).toHaveBeenLastCalledWith({ italic: true });
  const alignment = tools().getByRole("combobox", { name: "Text alignment" }) as HTMLSelectElement;
  expect(alignment.value).toBe("center");
  fireEvent.change(alignment, { target: { value: "right" } });
  expect(onStyle).toHaveBeenLastCalledWith({ align: "right" });

  barWidth = 799;
  act(() => resize());
  expect(tools().queryByRole("button", { name: "Bold" })).toBeNull();

  barWidth = 800;
  act(() => resize());
  expect(tools().getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
  expect(tools().getByRole("button", { name: "Align centre" }).getAttribute("aria-pressed")).toBe("true");
  expect(tools().queryByText("Format")).toBeNull();
});
