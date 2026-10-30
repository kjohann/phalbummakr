import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";
import type { LibraryPorts } from "../core";

export const tauriLibraryPorts: LibraryPorts = {
  async pickFolder() {
    const folder = await open({ directory: true, multiple: false, title: "Open Library" });
    return typeof folder === "string" ? folder : null;
  },
  isLibrary: (folder) => invoke<boolean>("is_library", { folder }),
  confirmCreate: (folder) =>
    ask(`"${folder}" is not a Library yet.\n\nMake it a Library? This adds a .phalbummakr folder to it.`, {
      title: "Make this folder a Library?",
      kind: "info",
      okLabel: "Make Library",
      cancelLabel: "Cancel",
    }),
  createLibrary: (folder) => invoke<void>("create_library", { folder }),
  rememberLibrary: (root) => invoke<void>("remember_library", { root }),
  recallLibrary: () => invoke<string | null>("recall_library"),
};
