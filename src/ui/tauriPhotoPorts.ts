import { invoke } from "@tauri-apps/api/core";
import type { Photo, PhotoScan } from "../core";

const pending: (() => Promise<void>)[] = [];
let running = 0;
const previewRequests = new Map<string, { revision: string | null; pending: boolean; promise: Promise<string> }>();
const MAX_CACHED_PREVIEWS = 8;

function trimPreviewRequests() {
  while (previewRequests.size > MAX_CACHED_PREVIEWS) {
    const oldestCompleted = [...previewRequests].find(([, request]) => !request.pending);
    if (!oldestCompleted) return;
    previewRequests.delete(oldestCompleted[0]);
  }
}

function previewRequest(root: string, path: string, revision?: string): Promise<string> {
  const key = `${root}\0${path}`;
  const cached = previewRequests.get(key);
  if (cached?.pending) {
    if (revision) cached.revision = revision;
    previewRequests.delete(key);
    previewRequests.set(key, cached);
    return cached.promise;
  }
  if (cached && revision !== undefined && cached.revision === revision) {
    previewRequests.delete(key);
    previewRequests.set(key, cached);
    return cached.promise;
  }

  const request = invoke<string>("photo_preview", { root, path });
  const entry = { revision: revision ?? null, pending: true, promise: request };
  entry.promise = request.then((url) => {
    entry.pending = false;
    trimPreviewRequests();
    return url;
  }, (error: unknown) => {
    if (previewRequests.get(key) === entry) previewRequests.delete(key);
    throw error;
  });
  previewRequests.set(key, entry);
  trimPreviewRequests();
  return entry.promise;
}

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
  preview: (root: string, path: string) => previewRequest(root, path),
  prewarmPreview: (root: string, photo: Photo) => previewRequest(root, photo.path, photo.revision),
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
