// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CommandBar, { type BarCommand } from "./CommandBar";

let barWidth = 1000;
let resize: () => void = () => {};

beforeEach(() => {
  // The measured bar needs 600 px with every command shown: 100 px per command and 30 px for "⋯".
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("command-bar--measure")) return 600;
    if (this.dataset.command) return 100;
    if (this.dataset.more !== undefined) return 30;
    return 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("command-bar") && !this.classList.contains("command-bar--measure") ? barWidth : 0;
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = () => callback([], this as unknown as ResizeObserver); }
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

function commands() {
  const run = vi.fn();
  const context: BarCommand[] = [
    { id: "add-photo", label: "Add Photo Slot", run },
    { id: "add-spread", label: "Add Spread", overflow: 1, run },
  ];
  const document: BarCommand[] = [
    { id: "toggle", label: "Toggle Photos", overflow: 2, pressed: true, shortcut: "Control+B", run },
    { id: "compact", label: "Compact Photos", overflow: 4, pressed: false, run },
    { id: "settings", label: "Album Settings…", overflow: 3, disabled: true, run },
  ];
  return { run, context, document };
}

const bar = () => within(screen.getByRole("toolbar", { name: "Commands" }));
const shown = () => bar().getAllByRole("button").map((button) => button.textContent);

it("moves the lowest-priority commands into the ⋯ menu when the bar is too narrow", () => {
  const { context, document } = commands();
  render(<CommandBar context={context} document={document} />);
  expect(shown()).toEqual(["Add Photo Slot", "Add Spread", "Toggle Photos", "Compact Photos", "Album Settings…"]);

  // 600 + 30 for "⋯" is 210 px too wide, so three 100 px commands move, lowest priority first.
  barWidth = 420;
  act(() => resize());
  expect(shown()).toEqual(["Add Photo Slot", "Add Spread", "⋯"]);

  barWidth = 430;
  act(() => resize());
  expect(shown()).toEqual(["Add Photo Slot", "Add Spread", "Toggle Photos", "⋯"]);

  barWidth = 600;
  act(() => resize());
  expect(bar().queryByRole("button", { name: "More commands" })).toBeNull();
});

it("hosts the selected Slot's tools in the middle group and leaves room for them before overflowing", () => {
  const { document } = commands();
  let host: HTMLElement | null = null;
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("command-tools") ? 250 : 0;
  });
  render(<CommandBar context={[]} document={document} toolsRef={(element) => { host = element; }} />);
  expect(host).not.toBeNull();
  expect(screen.getByRole("toolbar", { name: "Commands" }).querySelector(".command-context")!.contains(host)).toBe(true);

  // 600 measured + 250 of tools + 30 for "⋯" is 280 px too wide for 600, so all three document commands move.
  barWidth = 600;
  act(() => resize());
  expect(shown()).toEqual(["⋯"]);
});

it("runs overflowed commands from the ⋯ menu with their enabled and pressed states", () => {
  const { run, context, document: documentCommands } = commands();
  barWidth = 420;
  render(<CommandBar context={context} document={documentCommands} />);
  const more = bar().getByRole("button", { name: "More commands" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(more);
  const menu = within(screen.getByRole("menu", { name: "More commands" }));
  expect(Array.from(screen.getByRole("menu").children, (item) => item.textContent))
    .toEqual(["✓Toggle PhotosCtrl+B", "Compact Photos", "Album Settings…"]);
  expect(menu.getByRole("menuitemcheckbox", { name: "Toggle Photos" }).getAttribute("aria-checked")).toBe("true");
  expect(menu.getByRole("menuitemcheckbox", { name: "Compact Photos" }).getAttribute("aria-checked")).toBe("false");
  expect((menu.getByRole("menuitem", { name: "Album Settings…" }) as HTMLButtonElement).disabled).toBe(true);
  expect(document.activeElement).toBe(menu.getByRole("menuitemcheckbox", { name: "Toggle Photos" }));

  fireEvent.click(menu.getByRole("menuitemcheckbox", { name: "Compact Photos" }));
  expect(run).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).toBeNull();

  fireEvent.click(more);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(window.document.activeElement).toBe(more);
});
