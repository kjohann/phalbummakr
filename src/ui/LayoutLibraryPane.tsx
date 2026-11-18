import type { DragEvent, MouseEvent } from "react";
import { madeForOtherAspectRatio, type Layout, type PageFormat } from "../core";
import type { LayoutLibraryState } from "./useLayoutLibrary";

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function layoutLabel(layout: Layout, index: number) {
  const photos = layout.slots.filter((slot) => slot.type === "photo").length;
  const texts = layout.slots.length - photos;
  const parts = [photos && plural(photos, "Photo Slot"), texts && plural(texts, "Text Slot")].filter(Boolean);
  return `Layout ${index + 1}: ${parts.length ? parts.join(", ") : "empty"}`;
}

function LayoutPreview({ layout }: { layout: Layout }) {
  const width = 100 * layout.aspectRatio;
  return (
    <svg className="layout-preview" viewBox={`0 0 ${width} 100`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect className="layout-preview-page" x={0} y={0} width={width} height={100} />
      {layout.slots.map((slot) => {
        const rect = { x: slot.x * width, y: slot.y * 100, width: slot.width * width, height: slot.height * 100 };
        return slot.type === "photo"
          ? <rect key={slot.id} className="layout-preview-photo" {...rect} />
          : <g key={slot.id}>
            <rect className="layout-preview-text" {...rect} />
            <line className="layout-preview-text-line" x1={rect.x + rect.width * 0.2} x2={rect.x + rect.width * 0.8}
              y1={rect.y + rect.height / 2} y2={rect.y + rect.height / 2} />
          </g>;
      })}
    </svg>
  );
}

/** The Layout Library as cards with previews, as listed in the Side pane. */
export default function LayoutLibraryPane({ layouts, format, emptyText, selectedId, title, onClick, onContextMenu, onDragStart }: {
  layouts: LayoutLibraryState;
  format: PageFormat;
  emptyText: string;
  /** Marks the card of the Layout being edited; omit where cards are not selectable. */
  selectedId?: string | null;
  /** The card tooltip; defaults to the card's label. */
  title?: (label: string) => string;
  onClick: (layout: Layout, event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (layout: Layout, event: MouseEvent<HTMLButtonElement>) => void;
  /** Makes the cards draggable. */
  onDragStart?: (layout: Layout, event: DragEvent<HTMLButtonElement>) => void;
}) {
  const { library, loadError, retryLoad } = layouts;
  return (
    <div className="layout-pane">
      <div className="photo-browser-header">
        <h2 className="layout-pane-title">Layouts</h2>
        {library && <span className="photo-count">{plural(library.layouts.length, "Layout")}</span>}
      </div>
      {loadError ? (
        <div className="photo-empty" role="alert">
          {loadError}{" "}
          <button type="button" className="button-quiet" onClick={retryLoad}>Retry</button>
        </div>
      ) : !library ? <p className="photo-empty">Loading Layouts…</p>
        : library.layouts.length === 0 ? <p className="photo-empty">{emptyText}</p>
          : <ul className="layout-grid" aria-label="Layout Library">
            {library.layouts.map((item, index) => {
              const label = layoutLabel(item, index);
              return (
                <li key={item.id}>
                  <button type="button" className="layout-card" aria-label={label}
                    aria-pressed={selectedId === undefined ? undefined : item.id === selectedId}
                    aria-haspopup={onContextMenu ? "menu" : undefined} title={title ? title(label) : label}
                    draggable={onDragStart ? true : undefined}
                    onDragStart={onDragStart && ((event) => onDragStart(item, event))}
                    onClick={(event) => onClick(item, event)}
                    onContextMenu={onContextMenu && ((event) => onContextMenu(item, event))}>
                    <LayoutPreview layout={item} />
                    {madeForOtherAspectRatio(item, format) && <span className="layout-badge">Other aspect ratio</span>}
                  </button>
                </li>
              );
            })}
          </ul>}
    </div>
  );
}
