import { invoke } from "@tauri-apps/api/core";
import type { LayoutPorts } from "../core";

export const tauriLayoutPorts: LayoutPorts = {
  read: (root) => invoke<string | null>("read_layout_library", { root }),
  write: (root, json) => invoke<void>("write_layout_library", { root, json }),
};
