import { useCallback, useEffect, useRef, useState } from "react";
import { readSortProgress, serializeSortProgress, type SortProgress, type SortProgressPorts } from "../core";
import { tauriSortProgressPorts } from "./tauriSortProgressPorts";

type ProgressChange = (progress: SortProgress) => SortProgress;

export interface SortProgressState {
  /** Null until it has been loaded, and after loading failed. */
  progress: SortProgress | null;
  error: string | null;
  /**
   * Applies a change to the latest progress and saves it soon after. Before it has been loaded, the
   * change is kept and applied once it is, and loading starts, unless `ifLoaded` drops it instead.
   */
  update: (change: ProgressChange, options?: { ifLoaded?: boolean }) => void;
}

const SAVE_DELAY = 300;

/**
 * The Library's Reviewed Photos and Folder positions, loaded from and saved to `.phalbummakr/`.
 * Nothing is read until `enabled` is first true, such as when Sort mode is first opened, or until
 * a change must be kept, such as a Photo moved in Album mode.
 */
export function useSortProgress(root: string, enabled: boolean, ports: SortProgressPorts = tauriSortProgressPorts): SortProgressState {
  const [wanted, setWanted] = useState(enabled);
  if (enabled && !wanted) setWanted(true);
  const [progress, setProgressState] = useState<SortProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef<SortProgress | null>(null);
  const savedJson = useRef<string | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;
  // Changes made before loading finished, for the Library they were made in.
  const queued = useRef<{ root: string; changes: ProgressChange[] }>({ root, changes: [] });
  // Writes run one after another, so an older write never lands after a newer one.
  const writes = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback((library: string) => {
    const current = progressRef.current;
    if (!current) return;
    const json = serializeSortProgress(current);
    if (json === savedJson.current) return;
    savedJson.current = json;
    writes.current = writes.current.then(() => ports.write(library, json)).then(
      () => setError(null),
      (cause: unknown) => {
        savedJson.current = null;
        setError(`Could not save which Photos are reviewed: ${String(cause)}`);
      },
    );
  }, [ports]);

  useEffect(() => {
    if (!wanted) return;
    let active = true;
    progressRef.current = null;
    savedJson.current = null;
    setProgressState(null);
    setError(null);
    ports.read(root).then((json) => {
      if (!active) return;
      const read = readSortProgress(json);
      // Saved only once something changes, so `.phalbummakr/` isn't created just by looking.
      savedJson.current = serializeSortProgress(read);
      const changes = queued.current.root === root ? queued.current.changes : [];
      queued.current = { root, changes: [] };
      const loaded = changes.reduce((current, change) => change(current), read);
      progressRef.current = loaded;
      setProgressState(loaded);
    }).catch((cause: unknown) => {
      // Nothing is saved over progress that couldn't be read.
      if (active) setError(`Could not load which Photos are reviewed: ${String(cause)}`);
    });
    return () => {
      active = false;
      save(root);
    };
  }, [root, ports, save, wanted]);

  useEffect(() => {
    if (!progress) return;
    const timer = window.setTimeout(() => save(root), SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [progress, root, save]);

  const update = useCallback((change: ProgressChange, { ifLoaded = false } = {}) => {
    const previous = progressRef.current;
    if (!previous) {
      if (ifLoaded) return;
      if (queued.current.root !== rootRef.current) queued.current = { root: rootRef.current, changes: [] };
      queued.current.changes.push(change);
      setWanted(true);
      return;
    }
    const next = change(previous);
    if (next === previous) return;
    progressRef.current = next;
    setProgressState(next);
  }, []);

  return { progress, error, update };
}
