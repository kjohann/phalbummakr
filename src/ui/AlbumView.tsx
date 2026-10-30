import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import { addPage, albumSpreads, deletePage, duplicatePage, movePage, pageDimensions, type Album } from "../core";

interface Props {
  album: Album;
  onChange: (update: (album: Album) => Album) => void;
  disabled: boolean;
}

export default function AlbumView({ album, onChange, disabled }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const draggedId = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState(album.pages[0].id);
  const visiblePageIndex = Math.max(0, album.pages.findIndex((page) => page.id === selectedId));
  const selectedPage = album.pages[visiblePageIndex];
  const spreads = albumSpreads(album);
  const spreadIndex = spreads.findIndex((spread) => spread.left?.id === selectedPage.id || spread.right?.id === selectedPage.id);
  const spread = spreads[spreadIndex];
  const pageNumbers = new Map(album.pages.map((page, index) => [page.id, index + 1]));

  useEffect(() => {
    stripRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedPage.id, visiblePageIndex, album.startingSide]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const dimensions = pageDimensions(album.pageFormat);
  const { bleedMm, safeZoneMm } = album.pageFormat;
  const fullWidth = dimensions.widthMm + 2 * bleedMm;
  const fullHeight = dimensions.heightMm + 2 * bleedMm;
  const gap = 18;
  const scale = Math.max(0, Math.min((viewport.width - 48 - gap) / (2 * fullWidth), (viewport.height - 48) / fullHeight));
  const pageWidth = fullWidth * scale;
  const pageHeight = fullHeight * scale;
  const originX = (viewport.width - 2 * pageWidth - gap) / 2;
  const originY = (viewport.height - pageHeight) / 2;

  function editPages(operation: (album: Album) => Album, nextIndex: number) {
    onChange((current) => {
      const updated = operation(current);
      setSelectedId(updated.pages[Math.min(nextIndex, updated.pages.length - 1)].id);
      return updated;
    });
  }

  return (
    <section className="album-editor" aria-label="Album Pages">
      <div className="page-toolbar">
        <label className="workspace-label">Page{" "}
          <select value={selectedPage.id} onChange={(event) => setSelectedId(event.target.value)}>
            {album.pages.map((page, index) => <option key={page.id} value={page.id}>{index + 1}</option>)}
          </select>
        </label>
        <button type="button" className="button-quiet" disabled={disabled || album.pages.length >= 10000}
          onClick={() => editPages((current) => addPage(current, selectedPage.id), visiblePageIndex + 1)}>Add Page</button>
        <button type="button" className="button-quiet" disabled={disabled || album.pages.length >= 10000}
          onClick={() => editPages((current) => duplicatePage(current, selectedPage.id), visiblePageIndex + 1)}>Duplicate Page</button>
        <button type="button" className="button-quiet" disabled={disabled || album.pages.length === 1}
          onClick={() => editPages((current) => deletePage(current, selectedPage.id), visiblePageIndex)}>Delete Page</button>
        <button type="button" className="button-quiet" aria-label="Move Page earlier" disabled={disabled || visiblePageIndex === 0}
          onClick={() => editPages((current) => movePage(current, selectedPage.id, visiblePageIndex - 1), visiblePageIndex - 1)}>
          Earlier
        </button>
        <button type="button" className="button-quiet" aria-label="Move Page later" disabled={disabled || visiblePageIndex === album.pages.length - 1}
          onClick={() => editPages((current) => movePage(current, selectedPage.id, visiblePageIndex + 1), visiblePageIndex + 1)}>
          Later
        </button>
      </div>
      <div className="canvas-viewport" ref={viewportRef} role="group" aria-label="Spread editor">
        {viewport.width > 0 && viewport.height > 0 && (
          <Stage width={viewport.width} height={viewport.height}>
            <Layer>
              {[spread.left, spread.right].map((page, side) => page && (
                <LayerPage key={page.id} x={originX + side * (pageWidth + gap)} y={originY}
                  width={pageWidth} height={pageHeight} bleed={bleedMm * scale}
                  safeZone={safeZoneMm * scale} />
              ))}
            </Layer>
          </Stage>
        )}
        {[spread.left, spread.right].map((page, side) => {
          const style = {
            left: originX + side * (pageWidth + gap), top: originY, width: pageWidth, height: pageHeight,
          };
          return page ? (
            <button type="button" className="canvas-page-hit" key={page.id} style={style}
              aria-label={`Select Page ${pageNumbers.get(page.id)}`} aria-pressed={page.id === selectedPage.id}
              onClick={() => setSelectedId(page.id)}>
              <span className="canvas-page-number">Page {pageNumbers.get(page.id)}</span>
            </button>
          ) : (
            <div className="canvas-blocked-page" key={`blocked-${side}`} style={style}>
              {spreadIndex === 0 ? "Inside cover" : "No Page"}
            </div>
          );
        })}
      </div>
      <div className="workspace-footer">
        <span>PAGE {visiblePageIndex + 1} OF {album.pages.length}</span>
        <span className="guide-legend"><span>Bleed: {bleedMm} mm</span><span>Trim edge</span><span>Safe Zone: {safeZoneMm} mm</span></span>
      </div>
      <nav className="spread-strip" aria-label="Spreads" ref={stripRef} onDragOver={(event) => {
        if (disabled || !draggedId.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left + 32) event.currentTarget.scrollLeft -= 16;
        else if (event.clientX > bounds.right - 32) event.currentTarget.scrollLeft += 16;
      }}>
        {spreads.map((item, index) => (
          <div className="spread-thumbnail" key={index} role="group" aria-label={`Spread ${index + 1}`}>
            {[item.left, item.right].map((page, side) => page ? (
              <button type="button" key={page.id} className="page-thumbnail"
                style={{ aspectRatio: `${dimensions.widthMm} / ${dimensions.heightMm}` }}
                aria-label={`Select Page ${pageNumbers.get(page.id)}`} aria-pressed={page.id === selectedPage.id}
                draggable={!disabled}
                onDragStart={(event) => {
                  if (disabled) { event.preventDefault(); return; }
                  draggedId.current = page.id;
                  setSelectedId(page.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", page.id);
                }}
                onDragOver={(event) => {
                  if (disabled || !draggedId.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (disabled || !draggedId.current) return;
                  event.preventDefault();
                  const id = draggedId.current;
                  draggedId.current = null;
                  onChange((current) => movePage(current, id, current.pages.findIndex((target) => target.id === page.id)));
                }}
                onDragEnd={() => { draggedId.current = null; }}
                onClick={() => setSelectedId(page.id)}>{pageNumbers.get(page.id)}</button>
            ) : (
              <span key={`blocked-${side}`} className="page-thumbnail page-thumbnail-blocked">
                {index === 0 ? "Inside cover" : "No Page"}
              </span>
            ))}
          </div>
        ))}
      </nav>
    </section>
  );
}

function LayerPage({ x, y, width, height, bleed, safeZone }: {
  x: number; y: number; width: number; height: number; bleed: number; safeZone: number;
}) {
  return (
    <>
      <Rect x={x} y={y} width={width} height={height} fill="#ffffff" stroke="#b89176" strokeWidth={1}
        shadowColor="#1e2926" shadowBlur={12} shadowOpacity={0.1} shadowOffsetY={4} />
      <Rect x={x + bleed} y={y + bleed} width={width - 2 * bleed} height={height - 2 * bleed}
        stroke="#9e6d4e" strokeWidth={1} dash={[5, 4]} />
      <Rect x={x + bleed + safeZone} y={y + bleed + safeZone}
        width={width - 2 * (bleed + safeZone)} height={height - 2 * (bleed + safeZone)}
        stroke="#56829d" strokeWidth={1} dash={[3, 3]} />
    </>
  );
}
