import { invoke } from "@tauri-apps/api/core";
import type { SortingPorts } from "../core";

export const tauriSortingPorts: SortingPorts = {
  folderNames: (root, folder) => invoke<string[]>("folder_names", { root, folder }),
  rootAlbums: (root) => invoke<{ name: string; json: string }[]>("root_albums", { root }),
  movePhotos: (root, moves, albums) => invoke<void>("move_photos", { root, moves, albums }),
};
