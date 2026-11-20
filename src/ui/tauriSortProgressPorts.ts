import { invoke } from "@tauri-apps/api/core";
import type { SortProgressPorts } from "../core";

export const tauriSortProgressPorts: SortProgressPorts = {
  read: (root) => invoke<string | null>("read_sort_progress", { root }),
  write: (root, json) => invoke<void>("write_sort_progress", { root, json }),
};
