import { useEffect, useState, type MouseEvent } from "react";
import type { Photo } from "../core";
import { tauriPhotoPorts } from "./tauriPhotoPorts";

export function usageLabel(usage: number) {
  return `Used ${usage} ${usage === 1 ? "time" : "times"} in this Album`;
}

function SortPhoto({ root, photo, usage }: { root: string; photo: Photo; usage: number }) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSource(null);
    setError(null);
    tauriPhotoPorts.prewarmPreview(root, photo)
      .then((url) => { if (active) setSource(url); })
      .catch((cause: unknown) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [root, photo]);
  return <div className="sort-photo-image">
    {source && <img src={source} alt={photo.path} draggable={false} />}
    {!source && !error && <span className="photo-placeholder">Loading...</span>}
    {error && <span className="photo-failure" role="alert" title={error}>Preview unavailable.</span>}
    {usage > 0 && <span className="photo-usage" aria-label={usageLabel(usage)}>{usage}</span>}
  </div>;
}

/** Sort mode's work area: one Photo shown large, or a Comparison of up to four side by side. */
export default function SortView({ root, photos, chosen, usage, leaving = [], onToggleChosen, onContextMenu }: {
  root: string;
  photos: Photo[];
  /** Paths of the chosen Photos; ignored for a single Photo, which always counts as chosen. */
  chosen: readonly string[];
  usage: Map<string, number>;
  /** Photos being moved away, which fade out until the move is done. */
  leaving?: readonly string[];
  onToggleChosen: (path: string) => void;
  onContextMenu: (path: string, event: MouseEvent) => void;
}) {
  if (photos.length === 0) {
    return <div className="sort-view sort-view--empty">
      <p>Click a Photo to show it here. Ctrl-click Photos to compare up to four.</p>
    </div>;
  }
  const comparing = photos.length > 1;
  return <div className={`sort-view sort-view--${photos.length}`} role="group" aria-label={comparing ? "Comparison" : "Shown Photo"}>
    {photos.map((photo) => {
      const name = photo.path.split("/").pop()!;
      const isChosen = comparing && chosen.includes(photo.path);
      const content = <>
        <SortPhoto root={root} photo={photo} usage={usage.get(photo.path) ?? 0} />
        <span className="sort-photo-caption">
          <span className="photo-name">{name}</span>
          {isChosen && <span className="sort-photo-chosen">Chosen</span>}
        </span>
      </>;
      const menu = (event: MouseEvent) => { event.preventDefault(); onContextMenu(photo.path, event); };
      const className = ["sort-photo", isChosen && "sort-photo--chosen", leaving.includes(photo.path) && "sort-photo--leaving"]
        .filter(Boolean).join(" ");
      return comparing
        ? <button key={photo.path} type="button" className={className}
          aria-pressed={isChosen} aria-label={`${isChosen ? "Unchoose" : "Choose"} ${name}`} title={photo.path}
          onClick={() => onToggleChosen(photo.path)} onContextMenu={menu}>{content}</button>
        : <figure key={photo.path} className={className} title={photo.path} onContextMenu={menu}>{content}</figure>;
    })}
  </div>;
}
