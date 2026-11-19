import { useEffect, useRef, useState } from "react";
import { exportWarnings, lowResolutionPlacements, type Album, type PhotoSize } from "../core";
import { plural } from "./LayoutLibraryPane";
import ModalDialog from "./ModalDialog";
import { exportPages, type ExportProgress, type PageExportPorts } from "./pageExport";

type Phase =
  | { name: "confirm" }
  | { name: "running"; progress: ExportProgress }
  | { name: "done"; progress: ExportProgress }
  | { name: "cancelled"; progress: ExportProgress }
  | { name: "error"; message: string };

function listed(numbers: number[]) {
  return numbers.length === 1 ? String(numbers[0]) : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** Low Effective Resolution Placements per Page, with the lowest Effective Resolution on each, in Page order. */
function lowResolutionByPage(album: Album, photoSizes: ReadonlyMap<string, PhotoSize>) {
  const pages = new Map<number, { count: number; lowest: number }>();
  for (const { page, effectiveResolution } of lowResolutionPlacements(album, photoSizes)) {
    const current = pages.get(page);
    pages.set(page, { count: (current?.count ?? 0) + 1, lowest: Math.min(current?.lowest ?? Infinity, effectiveResolution) });
  }
  // Rounded down, so a flagged Photo never reads as being at the threshold.
  return [...pages].map(([page, { count, lowest }]) => ({ page, count, lowest: Math.floor(lowest) }));
}

/** Confirms a Page Export with its warnings, then exports every Page while showing progress. */
export default function ExportDialog({ album, root, name, ports, photoSizes, onClose }: {
  album: Album; root: string; name: string; ports: PageExportPorts; photoSizes: ReadonlyMap<string, PhotoSize>; onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "confirm" });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const warnings = exportWarnings(album);
  const lowResolution = lowResolutionByPage(album, photoSizes);
  const destination = `Exports/${name}`;
  const running = phase.name === "running";
  const [openError, setOpenError] = useState<string | null>(null);

  async function openFolder() {
    setOpenError(null);
    try {
      await ports.openFolder(root, name);
    } catch (cause) {
      setOpenError(`Could not open the Export folder: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function run() {
    const abort = new AbortController();
    controller.current = abort;
    let progress: ExportProgress = { done: 0, total: album.pages.length };
    setPhase({ name: "running", progress });
    try {
      await exportPages({
        album, root, name, ports, signal: abort.signal,
        onProgress: (next) => {
          progress = next;
          if (!abort.signal.aborted) setPhase({ name: "running", progress: next });
        },
      });
      if (!abort.signal.aborted || progress.done === progress.total) setPhase({ name: "done", progress });
      else setPhase({ name: "cancelled", progress });
    } catch (cause) {
      if (abort.signal.aborted) setPhase({ name: "cancelled", progress });
      else setPhase({ name: "error", message: `Could not export Pages: ${cause instanceof Error ? cause.message : String(cause)}` });
    }
  }

  return (
    <ModalDialog label="Export Pages" onClose={onClose} closeDisabled={running}>
      <div className="export-dialog">
        <h2>Export Pages</h2>
        {phase.name === "confirm" && <>
          <p>{plural(album.pages.length, "Page")} will be exported to {destination}.</p>
          {(warnings.emptyPages.length > 0 || warnings.emptyPhotoSlots.length > 0 || lowResolution.length > 0) && (
            <ul className="export-warnings" aria-label="Export warnings">
              {warnings.emptyPages.length > 0 && <li>{warnings.emptyPages.length === 1
                ? `Page ${warnings.emptyPages[0]} is empty.` : `Pages ${listed(warnings.emptyPages)} are empty.`}</li>}
              {warnings.emptyPhotoSlots.map(({ page, count }) => (
                <li key={page}>{`Page ${page} has ${plural(count, "empty Photo Slot")}.`}</li>
              ))}
              {lowResolution.map(({ page, count, lowest }) => (
                <li key={`resolution-${page}`}>{count === 1
                  ? `Page ${page} has a Photo at ${lowest} DPI, below ${album.pageFormat.minEffectiveDpi} DPI.`
                  : `Page ${page} has ${count} Photos below ${album.pageFormat.minEffectiveDpi} DPI, the lowest at ${lowest} DPI.`}</li>
              ))}
            </ul>
          )}
        </>}
        {phase.name !== "confirm" && phase.name !== "error" && <>
          <progress aria-label="Export progress" max={phase.progress.total} value={phase.progress.done}
            aria-valuemin={0} aria-valuemax={phase.progress.total} aria-valuenow={phase.progress.done} />
          <p role="status">
            {phase.name === "running" ? `Exporting Page ${Math.min(phase.progress.done + 1, phase.progress.total)} of ${phase.progress.total}…`
              : phase.name === "done" ? `Exported ${plural(phase.progress.total, "Page")} to ${destination}.`
                : `Export cancelled after ${phase.progress.done} of ${plural(phase.progress.total, "Page")}.`}
          </p>
        </>}
        {phase.name === "error" && <p className="error-banner" role="alert">{phase.message}</p>}
        {openError && <p className="error-banner" role="alert">{openError}</p>}
        <div className="album-toolbar">
          {phase.name === "confirm" && <>
            <button type="button" className="button-primary" onClick={() => void run()}>Export</button>
            <button type="button" className="button-quiet" onClick={onClose}>Cancel</button>
          </>}
          {running && <button type="button" className="button-quiet" onClick={() => controller.current?.abort()}>Cancel</button>}
          {phase.name === "done" && <button type="button" className="button-primary" onClick={() => void openFolder()}>Open Export folder</button>}
          {!running && phase.name !== "confirm" && <button type="button" className="button-quiet" onClick={onClose}>Close</button>}
        </div>
      </div>
    </ModalDialog>
  );
}
