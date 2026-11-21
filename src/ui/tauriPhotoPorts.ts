import { invoke } from "@tauri-apps/api/core";
import type { ContentIndexBatch, Photo, PhotoScan } from "../core";

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

function queuedThumbnail(root: string, path: string, signal: AbortSignal, revision?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    pending.push(async () => {
      if (signal.aborted) {
        reject(new DOMException("Thumbnail request cancelled", "AbortError"));
        return;
      }
      try {
        const command = revision === undefined ? "photo_page_thumbnail" : "photo_thumbnail";
        resolve(await invoke<string>(command, { root, path, ...(revision === undefined ? {} : { revision }) }));
      } catch (error) {
        reject(error);
      }
    });
    drain();
  });
}

export const tauriPhotoPorts = {
  index: (root: string, paths: string[]) => invoke<ContentIndexBatch>("index_photo_contents", { root, paths }),
  scan: (root: string) => invoke<PhotoScan>("scan_photos", { root }),
  /** Reads the Photos at `paths` as a scan would, such as after they were moved. */
  read: (root: string, paths: string[]) => invoke<Photo[]>("read_photos", { root, paths }),
  preview: (root: string, path: string) => previewRequest(root, path),
  prewarmPreview: (root: string, photo: Photo) => previewRequest(root, photo.path, photo.revision),
  pageThumbnail: (root: string, path: string, signal: AbortSignal) => queuedThumbnail(root, path, signal),
  thumbnail(root: string, photo: Photo, signal: AbortSignal): Promise<string> {
    return queuedThumbnail(root, photo.path, signal, photo.revision);
  },
};
