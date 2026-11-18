export type Mode = "album" | "layouts" | "sort";

export const MODES: { id: Mode; label: string }[] = [
  { id: "album", label: "Album" },
  { id: "layouts", label: "Layouts" },
  { id: "sort", label: "Sort" },
];
