import { useEffect, useMemo, useState } from "react";
import { photoUsage, type Album, type ContentIndexStats, type Photo, type PhotoIdentity } from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";

export function usePhotoIdentities(root: string, photos: readonly Photo[] | null, album: Album | null) {
  const paths = [...new Set([
    ...(photos?.map((photo) => photo.path) ?? []), ...(album ? photoUsage(album).keys() : []),
  ])].sort();
  const pathsJson = JSON.stringify(paths);
  const [retry, setRetry] = useState(0);
  const key = useMemo(() => ({}), [root, photos, pathsJson, retry]);
  const pending = useMemo(() => new Map<string, PhotoIdentity>(
    paths.map((path) => [path, { path, status: "pending" }]),
  ), [pathsJson]);
  const [state, setState] = useState<{
    key: object; identities: ReadonlyMap<string, PhotoIdentity>; stats: ContentIndexStats;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const paths = [...pending.keys()];
    const identities = new Map(pending);
    const stats = { hashedFiles: 0, hashedBytes: 0, cacheHits: 0, elapsedMs: 0 };
    setState({ key, identities: new Map(identities), stats: { ...stats } });
    if (!photos) return;
    async function index() {
      for (let start = 0; start < paths.length && active; start += 8) {
        const batch = paths.slice(start, start + 8);
        try {
          const result = await tauriPhotoPorts.index(root, batch);
          if (!active) return;
          if (result.identities.length !== batch.length || batch.some((path) => !result.identities.some((identity) => identity.path === path))) {
            throw new Error("The content index did not return every requested Photo.");
          }
          for (const identity of result.identities) identities.set(identity.path, identity);
          stats.hashedFiles += result.hashedFiles;
          stats.hashedBytes += result.hashedBytes;
          stats.cacheHits += result.cacheHits;
          stats.elapsedMs += result.elapsedMs;
        } catch (cause) {
          if (!active) return;
          for (const path of batch) identities.set(path, { path, status: "error", message: String(cause) });
        }
        setState({ key, identities: new Map(identities), stats: { ...stats } });
      }
    }
    void index();
    return () => { active = false; };
  }, [root, key, pending, photos]);
  return {
    identities: state?.key === key ? state.identities : pending,
    stats: state?.key === key ? state.stats : null,
    retry: () => setRetry((value) => value + 1),
  };
}
