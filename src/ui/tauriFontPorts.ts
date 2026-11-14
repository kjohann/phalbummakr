import { invoke } from "@tauri-apps/api/core";

export interface FontPorts {
  list(): Promise<string[]>;
}

export const tauriFontPorts: FontPorts = {
  list: () => invoke<string[]>("list_system_fonts"),
};
