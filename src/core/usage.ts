import type { Album } from "./album";

export type PhotoIdentity =
  | { path: string; status: "pending" }
  | { path: string; status: "ready"; hash: string }
  | { path: string; status: "missing"; hash: string | null }
  | { path: string; status: "error"; message: string };

export interface ContentIndexBatch {
  identities: Exclude<PhotoIdentity, { status: "pending" }>[];
  hashedFiles: number;
  hashedBytes: number;
  cacheHits: number;
  elapsedMs: number;
}

export type ContentIndexStats = Omit<ContentIndexBatch, "identities">;

export type PhotoUsageState =
  | { status: "ready"; count: number }
  | { status: "pending" | "error"; count: number | null; message: string };

export function contentPhotoUsage(album: Album | null, identities: ReadonlyMap<string, PhotoIdentity>): Map<string, PhotoUsageState> {
  const counts = new Map<string, number>();
  let incomplete: { status: "pending" | "error"; message: string } | null = null;
  if (album) {
    for (const [path, count] of photoUsage(album)) {
      const identity = identities.get(path);
      const hash = identity?.status === "ready" || identity?.status === "missing" ? identity.hash : null;
      if (hash) {
        counts.set(hash, (counts.get(hash) ?? 0) + count);
      } else if (identity?.status === "error") {
        incomplete = { status: "error", message: `Duplicate check incomplete for ${path}: ${identity.message}` };
      } else if (incomplete?.status !== "error") {
        incomplete = { status: "pending", message: identity?.status === "missing"
          ? `Duplicate check incomplete: Missing Photo ${path} has no known content identity.`
          : "Checking..." };
      }
    }
  }
  const usage = new Map<string, PhotoUsageState>();
  for (const [path, identity] of identities) {
    const hash = identity.status === "ready" || identity.status === "missing" ? identity.hash : null;
    if (identity.status === "error") usage.set(path, { status: "error", count: null, message: identity.message });
    else if (hash) usage.set(path, incomplete
      ? { ...incomplete, count: counts.get(hash) ?? 0 }
      : { status: "ready", count: counts.get(hash) ?? 0 });
    else usage.set(path, { status: "pending", count: null, message: identity.status === "missing"
      ? `Missing Photo ${path} has no known content identity.` : "Checking..." });
  }
  return usage;
}

export function usageForPhoto(usage: ReadonlyMap<string, PhotoUsageState>, path: string): PhotoUsageState {
  return usage.get(path) ?? { status: "pending", count: null, message: "Checking..." };
}

export function photoUsage(album: Album): Map<string, number> {
  const usage = new Map<string, number>();
  for (const page of album.pages) {
    for (const slot of page.slots) {
      const path = slot.placement?.photoPath;
      if (path) usage.set(path, (usage.get(path) ?? 0) + 1);
    }
  }
  return usage;
}