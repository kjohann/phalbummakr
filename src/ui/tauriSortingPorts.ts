import { invoke } from "@tauri-apps/api/core";
import type { SortingPorts } from "../core";

export const tauriSortingPorts: SortingPorts = {
  folderNames: (root, folder) => invoke<string[]>("folder_names", { root, folder }),
  rootAlbums: (root) => invoke<{ name: string; json: string }[]>("root_albums", { root }),
  movePhotos: (root, moves, albums) => invoke<void>("move_photos", { root, moves, albums }),
};

/** Creates the Folder `name` inside `parent` ("" is the Library root), returning its Library-relative path. */
export const createFolder = (root: string, parent: string, name: string) =>
  invoke<string>("create_folder", { root, parent, name });
