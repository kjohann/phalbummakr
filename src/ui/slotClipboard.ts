import { invoke } from "@tauri-apps/api/core";
export { readText } from "@tauri-apps/plugin-clipboard-manager";

export async function writeText(text: string): Promise<void> {
  await invoke("write_slot_clipboard", { text });
}

export async function isSlotClipboardCurrent(text: string): Promise<boolean> {
  return invoke("is_slot_clipboard_current", { text });
}
