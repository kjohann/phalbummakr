import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { libraryName, openLibrary, restoreLastLibrary, type Library } from "../core";
import AlbumWorkspace from "./AlbumWorkspace";
import PhotoBrowser from "./PhotoBrowser";
import { tauriLibraryPorts } from "./tauriLibraryPorts";

type BridgeState = "connecting" | "connected" | "unavailable";

type LibraryState =
  | { status: "restoring" }
  | { status: "closed" }
  | { status: "open"; library: Library };

export default function App() {
  const [bridgeState, setBridgeState] = useState<BridgeState>("connecting");
  const [libraryState, setLibraryState] = useState<LibraryState>({ status: "restoring" });
  const [opening, setOpening] = useState(false);
  const [albumBusy, setAlbumBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const albumBusyRef = useRef(false);

  useEffect(() => {
    albumBusyRef.current = albumBusy;
  }, [albumBusy]);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onCloseRequested((event) => {
      if (albumBusyRef.current) {
        event.preventDefault();
        setError("Please wait for the Album operation to finish, or retry its failed save, before closing.");
      }
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch((cause: unknown) => {
      if (active) setError(`Could not protect unsaved Albums on close: ${String(cause)}`);
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    invoke<string>("greet", { name: "phalbummakr" })
      .then(() => {
        if (active) setBridgeState("connected");
      })
      .catch(() => {
        if (active) setBridgeState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    restoreLastLibrary(tauriLibraryPorts)
      .then((library) => {
        if (active) setLibraryState(library ? { status: "open", library } : { status: "closed" });
      })
      .catch(() => {
        if (active) setLibraryState({ status: "closed" });
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleOpenLibrary() {
    setOpening(true);
    setError(null);
    try {
      const library = await openLibrary(tauriLibraryPorts);
      if (library) setLibraryState({ status: "open", library });
    } catch (cause) {
      setError(`Could not open the Library: ${String(cause)}`);
    } finally {
      setOpening(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="wordmark" aria-label="phalbummakr">
          <span className="wordmark-mark" aria-hidden="true" />
          <span>phalbummakr</span>
          {libraryState.status === "open" && (
            <span className="library-name" title={libraryState.library.root}>
              {libraryName(libraryState.library)}
            </span>
          )}
        </div>
        <div className="topbar-actions">
          {libraryState.status === "open" && (
            <button type="button" className="button-quiet" onClick={handleOpenLibrary} disabled={opening || albumBusy}>
              Open another Library…
            </button>
          )}
          <div className={`bridge-status bridge-status-${bridgeState}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            {bridgeState === "connecting" && "Connecting to desktop"}
            {bridgeState === "connected" && "Desktop ready"}
            {bridgeState === "unavailable" && "Browser preview"}
          </div>
        </div>
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {libraryState.status === "open" && (
        <div className="library-workspace" key={libraryState.library.root}>
          <PhotoBrowser root={libraryState.library.root} />
          <AlbumWorkspace root={libraryState.library.root} onBusyChange={setAlbumBusy} />
        </div>
      )}
      {libraryState.status === "closed" && (
        <section className="welcome" aria-label="Open a Library">
          <h1>Open a Library</h1>
          <p>Pick the folder that holds your Photos. If it isn't a Library yet, you can make it one.</p>
          <button type="button" className="button-primary" onClick={handleOpenLibrary} disabled={opening}>
            Open Library…
          </button>
        </section>
      )}
    </main>
  );
}
