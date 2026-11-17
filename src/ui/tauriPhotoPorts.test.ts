import { expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { tauriPhotoPorts } from "./tauriPhotoPorts";

it("limits concurrent thumbnail generation and skips cancelled queued Pages", async () => {
  const finish: Array<(value: string) => void> = [];
  invoke.mockImplementation(() => new Promise<string>((resolve) => finish.push(resolve)));
  const controller = new AbortController();
  const requests = Array.from({ length: 5 }, (_, index) =>
    tauriPhotoPorts.pageThumbnail("D:\\Photos", `${index}.jpg`, index === 4 ? controller.signal : new AbortController().signal));
  const cancelled = expect(requests[4]).rejects.toMatchObject({ name: "AbortError" });
  expect(invoke).toHaveBeenCalledTimes(4);
  controller.abort();
  finish[0]("first");
  await requests[0];
  await cancelled;
  expect(invoke).toHaveBeenCalledTimes(4);
  for (const resolve of finish.slice(1)) resolve("done");
  await Promise.all(requests.slice(1, 4));
});
