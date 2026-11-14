import type { Album } from "./album";

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