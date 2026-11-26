import { invoke } from "@tauri-apps/api/core";
import type Konva from "konva";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Layer, Rect, Stage } from "react-konva";
import {
  exportPageSize, exportPlan, pageDimensions,
  type Album, type ExportPhoto, type Page, type PageFormat,
} from "../core";
import { PhotoImage, SlotFrame, TextContent, type PhotoSource } from "./pageCanvas";

/** An exported Page's RGBA pixels. */
export interface RenderedPage {
  pixels: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/** Where Page Export reads originals, draws Pages and writes files. */
export interface PageExportPorts {
  /** Creates `Exports/<name>` under the Library root and removes Page files from earlier exports. */
  prepare(root: string, name: string): Promise<void>;
  /** Which of these Photos no longer exist in the Library. */
  missing(root: string, photoPaths: string[]): Promise<string[]>;
  /** Shows `Exports/<name>` in the system file manager. */
  openFolder(root: string, name: string): Promise<void>;
  /** The upright original of a Photo, cropped and resampled to the pixel box it fills. */
  photo(root: string, photo: ExportPhoto): Promise<PhotoSource>;
  render(page: Page, format: PageFormat, photos: ReadonlyMap<string, PhotoSource>): Promise<RenderedPage>;
  write(root: string, name: string, fileName: string, page: RenderedPage, dpi: number): Promise<void>;
}

export interface ExportProgress {
  done: number;
  total: number;
}

/**
 * Exports every Page of the Album to `Exports/<name>/` under the Library root, one Page at a time,
 * so the UI keeps responding. Stops before the next Page once `signal` is aborted.
 */
export async function exportPages({ album, root, name, ports, onProgress, signal }: {
  album: Album; root: string; name: string; ports: PageExportPorts;
  onProgress: (progress: ExportProgress) => void; signal?: AbortSignal;
}): Promise<void> {
  const plan = exportPlan(album);
  // Checked before the folder is cleared, so a Missing Photo never costs the earlier export.
  const missing = await ports.missing(root, [...new Set(plan.flatMap(({ photos }) => photos.map((photo) => photo.photoPath)))]);
  if (missing.length > 0) throw new Error(`Missing Photos must be relinked or replaced first: ${missing.join(", ")}`);
  await ports.prepare(root, name);
  onProgress({ done: 0, total: plan.length });
  for (const [index, { page, fileName, photos }] of plan.entries()) {
    signal?.throwIfAborted();
    const images = new Map<string, PhotoSource>();
    for (const photo of photos) {
      try {
        images.set(photo.slotId, await ports.photo(root, photo));
      } catch (cause) {
        throw new Error(`Could not read ${photo.photoPath} for Page ${index + 1}: ${String(cause)}`);
      }
    }
    const rendered = await ports.render(page, album.pageFormat, images);
    await ports.write(root, name, fileName, rendered, album.pageFormat.dpi);
    onProgress({ done: index + 1, total: plan.length });
  }
}

function ExportStage({ page, format, photos, onReady }: {
  page: Page; format: PageFormat; photos: ReadonlyMap<string, PhotoSource>; onReady: (stage: Konva.Stage) => void;
}) {
  const { width, height, pixelsPerMm } = exportPageSize(format);
  const { widthMm, heightMm } = pageDimensions(format);
  const bleedX = format.bleedMm.x * pixelsPerMm;
  const bleedY = format.bleedMm.y * pixelsPerMm;
  const trimWidth = widthMm * pixelsPerMm;
  const trimHeight = heightMm * pixelsPerMm;
  const background = useRef<Konva.Rect>(null);
  return (
    <Stage width={width} height={height} listening={false}>
      <Layer>
        <Rect ref={background} x={0} y={0} width={width} height={height} fill={page.background} />
        {page.slots.map((slot) => {
          const rect = { x: bleedX + slot.x * trimWidth, y: bleedY + slot.y * trimHeight, width: slot.width * trimWidth, height: slot.height * trimHeight };
          const image = photos.get(slot.id);
          return <SlotFrame key={slot.id} slot={slot} rect={rect}>
            {(local) => slot.type === "text"
              ? <TextContent slot={slot} id={slot.id} rect={local} scale={pixelsPerMm} format={format} hidden={false}
                showPlaceholder={false} onOverflow={ignoreOverflow} />
              // The original arrives already cropped to the box, so it is drawn whole.
              : image && <PhotoImage {...local} image={image} crop={{ x: 0, y: 0, width: 1, height: 1 }} fit={slot.placement?.fit ?? false} />}
          </SlotFrame>;
        })}
        <Drawn onDrawn={() => onReady(background.current!.getStage()!)} />
      </Layer>
    </Stage>
  );
}

/** Calls `onDrawn` once the Konva nodes before it exist. */
function Drawn({ onDrawn }: { onDrawn: () => void }) {
  useEffect(onDrawn, [onDrawn]);
  return null;
}

function ignoreOverflow() {}

/** Draws a Page off screen with the editor's renderer, without guides, warnings or selection, and reads its pixels. */
export async function renderExportPage(page: Page, format: PageFormat, photos: ReadonlyMap<string, PhotoSource>): Promise<RenderedPage> {
  await document.fonts?.ready;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position: fixed; left: -100000px; top: 0; visibility: hidden; pointer-events: none;";
  document.body.append(host);
  const root = createRoot(host);
  try {
    const stage = await new Promise<Konva.Stage>((resolve) => {
      root.render(<ExportStage page={page} format={format} photos={photos} onReady={resolve} />);
    });
    // Konva sizes layers for the screen's pixel density; an export is drawn once at exactly one pixel per pixel.
    const layer = stage.getLayers()[0];
    layer.getCanvas().setPixelRatio(1);
    layer.draw();
    const canvas = layer.getNativeCanvasElement();
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return { pixels, width: canvas.width, height: canvas.height };
  } finally {
    root.unmount();
    host.remove();
  }
}

function photoCanvas(bytes: ArrayBuffer): HTMLCanvasElement {
  const header = new DataView(bytes, 0, 8);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(bytes, 8, width * height * 4), width, height), 0, 0);
  return canvas;
}

export const tauriPageExportPorts: PageExportPorts = {
  prepare: (root, name) => invoke("prepare_export", { root, name }),
  missing: (root, photoPaths) => invoke<string[]>("missing_photos", { root, paths: photoPaths }),
  openFolder: (root, name) => invoke("open_export_folder", { root, name }),
  async photo(root, { photoPath, crop, fit, width, height }) {
    return photoCanvas(await invoke<ArrayBuffer>("export_photo", { root, path: photoPath, request: { crop, fit, width, height } }));
  },
  render: renderExportPage,
  async write(root, name, fileName, { pixels, width, height }, dpi) {
    // A raw body keeps the Page's pixels out of JSON: header length, header, then RGBA.
    const header = new TextEncoder().encode(JSON.stringify({
      root, name, fileName, width, height, dpi: Math.min(65535, Math.max(1, Math.round(dpi))),
    }));
    const body = new Uint8Array(4 + header.length + pixels.length);
    new DataView(body.buffer).setUint32(0, header.length, true);
    body.set(header, 4);
    body.set(pixels, 4 + header.length);
    await invoke("write_export_page", body);
  },
};
