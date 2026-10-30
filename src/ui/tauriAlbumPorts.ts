import { invoke } from "@tauri-apps/api/core";
import type { AlbumPorts } from "../core";

export const tauriAlbumPorts: AlbumPorts = {
  list: (root) => invoke<string[]>("list_albums", { root }),
  read: (root, name) => invoke<string>("read_album", { root, name }),
  write: (root, name, json, create) => invoke<void>("write_album", { root, name, json, create }),
};
