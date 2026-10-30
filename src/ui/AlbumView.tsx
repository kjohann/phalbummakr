import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";

export default function AlbumView() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

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

  const pageHeight = Math.min(viewport.height * 0.82, (viewport.width * 0.62) / 0.707);
  const pageWidth = pageHeight * 0.707;

  return (
    <section className="workspace" aria-label="Album workspace">
      <div className="workspace-label">UNTITLED ALBUM</div>
      <div className="canvas-viewport" ref={viewportRef}>
        {viewport.width > 0 && viewport.height > 0 && (
          <Stage width={viewport.width} height={viewport.height} aria-label="Empty page">
            <Layer>
              <Rect
                x={(viewport.width - pageWidth) / 2}
                y={(viewport.height - pageHeight) / 2}
                width={pageWidth}
                height={pageHeight}
                fill="#fffefa"
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
        <span>PAGE 01</span>
        <span>EMPTY PAGE</span>
      </div>
    </section>
  );
}
