import { invoke } from "@tauri-apps/api/core";
import type { Photo, PhotoScan } from "../core";

const pending: (() => Promise<void>)[] = [];
let running = 0;

function drain() {
  while (running < 4 && pending.length > 0) {
    const job = pending.shift()!;
    running++;
    void job().finally(() => {
      running--;
      drain();
    });
  }
}

export const tauriPhotoPorts = {
  scan: (root: string) => invoke<PhotoScan>("scan_photos", { root }),
  thumbnail(root: string, photo: Photo, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      pending.push(async () => {
        if (signal.aborted) {
          reject(new DOMException("Thumbnail request cancelled", "AbortError"));
          return;
        }
        try {
          resolve(await invoke<string>("photo_thumbnail", {
            root,
            path: photo.path,
            revision: photo.revision,
          }));
        } catch (error) {
          reject(error);
        }
      });
      drain();
    });
  },
};
