import { useCallback, useEffect, useRef, useState } from "react";
import { readLayoutLibrary, serializeLayoutLibrary, type LayoutLibrary, type LayoutPorts, type PageFormat } from "../core";
import { tauriLayoutPorts } from "./tauriLayoutPorts";

/** The Library's Layout Library, shared by Album mode and Layout mode so both always see the same Layouts. */
export interface LayoutLibraryState {
  library: LayoutLibrary | null;
  loadError: string | null;
  retryLoad: () => void;
  /** The last failed update or save. */
  error: string | null;
  saveStatus: "saved" | "pending" | "saving" | "error";
  retrySave: () => void;
  /** True while the Layout Library cannot be changed: not loaded yet, saving, or after a failed save. */
  disabled: boolean;
  /** Applies an update to the latest Layout Library and saves it soon after. Returns false when it could not be applied. */
  change: (update: (library: LayoutLibrary) => LayoutLibrary) => boolean;
}

export function useLayoutLibrary({ root, format, ports = tauriLayoutPorts, onBusyChange }: {
  root: string;
  /** The open Album's Page Format, which the predefined Layouts are seeded for. */
  format: PageFormat;
  ports?: LayoutPorts;
  onBusyChange?: (busy: boolean) => void;
}): LayoutLibraryState {
  const [library, setLibraryState] = useState<LayoutLibrary | null>(null);
  const libraryRef = useRef<LayoutLibrary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<LayoutLibraryState["saveStatus"]>("saved");
  const [retry, setRetry] = useState(0);
  const savedJson = useRef<string | null>(null);
  const saveInFlight = useRef(false);
  const formatRef = useRef(format);
  formatRef.current = format;

  function setLibrary(next: LayoutLibrary | null) {
    libraryRef.current = next;
    setLibraryState(next);
  }

  useEffect(() => {
    let current = true;
    setLoadError(null);
    ports.read(root).then((json) => {
      if (!current) return;
      const loaded = readLayoutLibrary(json ?? null, formatRef.current);
      // A seeded Library is only written once it is edited, so `.phalbummakr/` is not created just by looking.
      savedJson.current = serializeLayoutLibrary(loaded);
      setLibrary(loaded);
    }).catch((cause: unknown) => {
      if (current) setLoadError(`Could not load the Layout Library: ${String(cause)}`);
    });
    return () => { current = false; };
  }, [root, ports, reload]);

  useEffect(() => {
    if (!library || saveInFlight.current || saveStatus === "error") return;
    const json = serializeLayoutLibrary(library);
    if (json === savedJson.current) {
      setSaveStatus("saved");
      return;
    }
    const timer = window.setTimeout(() => {
      saveInFlight.current = true;
      setSaveStatus("saving");
      ports.write(root, json).then(() => {
        saveInFlight.current = false;
        savedJson.current = json;
        const latest = libraryRef.current;
        setSaveStatus(latest && serializeLayoutLibrary(latest) === json ? "saved" : "pending");
      }).catch((cause: unknown) => {
        saveInFlight.current = false;
        setError(`Could not save the Layout Library: ${String(cause)}`);
        setSaveStatus("error");
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [library, root, ports, retry, saveStatus]);

  useEffect(() => {
    onBusyChange?.(saveStatus !== "saved");
  }, [saveStatus, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const disabled = library === null || saveStatus === "saving" || saveStatus === "error";
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const change = useCallback((update: (library: LayoutLibrary) => LayoutLibrary): boolean => {
    const previous = libraryRef.current;
    if (!previous || disabledRef.current) return false;
    try {
      const next = update(previous);
      serializeLayoutLibrary(next);
      setError(null);
      setSaveStatus(saveInFlight.current ? "saving" : "pending");
      setLibrary(next);
      return true;
    } catch (cause) {
      setError(`Could not update the Layout Library: ${String(cause)}`);
      return false;
    }
  }, []);
  const retryLoad = useCallback(() => setReload((value) => value + 1), []);
  const retrySave = useCallback(() => {
    setError(null);
    setSaveStatus("pending");
    setRetry((value) => value + 1);
  }, []);

  return { library, loadError, retryLoad, error, saveStatus, retrySave, disabled, change };
}
