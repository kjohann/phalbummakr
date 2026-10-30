// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAlbum, deserializeAlbum, serializeAlbum, type AlbumPorts } from "../core";
import AlbumWorkspace from "./AlbumWorkspace";

vi.mock("react-konva", () => ({
  Stage: () => null,
  Layer: () => null,
  Rect: () => null,
}));

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
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
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
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
