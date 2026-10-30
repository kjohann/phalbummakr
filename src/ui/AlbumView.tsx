import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import { pageDimensions, type Album } from "../core";

export default function AlbumView({ album }: { album: Album }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pageIndex, setPageIndex] = useState(0);
  const visiblePageIndex = Math.min(pageIndex, album.pages.length - 1);

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
  const ratio = dimensions.widthMm / dimensions.heightMm;
  const pageHeight = Math.min(viewport.height * 0.82, (viewport.width * 0.82) / ratio);
  const pageWidth = pageHeight * ratio;

  return (
    <section className="album-editor" aria-label="Album Pages">
      <label className="workspace-label">Page{" "}
        <select value={visiblePageIndex} onChange={(event) => setPageIndex(Number(event.target.value))}>
          {album.pages.map((page, index) => <option key={page.id} value={index}>{index + 1}</option>)}
        </select>
      </label>
      <div className="canvas-viewport" ref={viewportRef}>
        {viewport.width > 0 && viewport.height > 0 && (
          <Stage width={viewport.width} height={viewport.height} aria-label="Empty page">
            <Layer>
              <Rect
                x={(viewport.width - pageWidth) / 2}
                y={(viewport.height - pageHeight) / 2}
                width={pageWidth}
                height={pageHeight}
                fill={album.pages[visiblePageIndex].background}
                stroke="#d8d8d1"
                strokeWidth={1}
                shadowColor="#1e2926"
                shadowBlur={24}
                shadowOpacity={0.1}
                shadowOffsetY={8}
              />
            </Layer>
          </Stage>
        )}
      </div>
      <div className="workspace-footer">
        <span>PAGE {visiblePageIndex + 1} OF {album.pages.length}</span>
        <span>EMPTY PAGE</span>
      </div>
    </section>
  );
}
