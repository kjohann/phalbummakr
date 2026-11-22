import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { gridLayoutProblem, type PageFormat } from "../core";
import ModalDialog from "./ModalDialog";

function dimensionsLabel(columns: number, rows: number) {
  return `${columns} ${columns === 1 ? "column" : "columns"} x ${rows} ${rows === 1 ? "row" : "rows"}`;
}

export default function GridLayoutDialog({ format, action, disabled = false, onSubmit, onClose }: {
  format: PageFormat;
  action: "Apply" | "Create";
  disabled?: boolean;
  onSubmit: (columns: number, rows: number) => void;
  onClose: () => void;
}) {
  const [columns, setColumns] = useState("2");
  const [rows, setRows] = useState("2");
  const [preview, setPreview] = useState<{ columns: number; rows: number } | null>(null);
  const id = useId();
  const columnCount = Number(columns);
  const rowCount = Number(rows);
  const problem = gridLayoutProblem(format, columnCount, rowCount);
  const shown = preview ?? { columns: columnCount, rows: rowCount };
  const selectedCell = columnCount >= 1 && columnCount <= 6 && rowCount >= 1 && rowCount <= 6
    && Number.isInteger(columnCount) && Number.isInteger(rowCount) ? `${id}-${columnCount}-${rowCount}` : undefined;

  function choose(column: number, row: number) {
    setColumns(String(column));
    setRows(String(row));
    setPreview(null);
  }

  function stepGrid(event: KeyboardEvent<HTMLDivElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const step = directions[event.key];
    if (!step) return;
    event.preventDefault();
    const currentColumn = Number.isInteger(columnCount) ? Math.min(6, Math.max(1, columnCount)) : 1;
    const currentRow = Number.isInteger(rowCount) ? Math.min(6, Math.max(1, rowCount)) : 1;
    choose(Math.min(6, Math.max(1, currentColumn + step[0])), Math.min(6, Math.max(1, currentRow + step[1])));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!problem && !disabled) onSubmit(columnCount, rowCount);
  }

  return <ModalDialog label={`${action} grid layout`} onClose={onClose}>
    <form className="grid-layout-form" onSubmit={submit}>
      <h2>{action} grid layout</h2>
      <div className="grid-dimensions" role="grid" aria-label="Grid dimensions" aria-activedescendant={selectedCell}
        tabIndex={0} onKeyDown={stepGrid} onMouseLeave={() => setPreview(null)}>
        {Array.from({ length: 6 }, (_, rowIndex) => {
          const row = rowIndex + 1;
          return <div role="row" className="grid-dimensions-row" key={row}>
            {Array.from({ length: 6 }, (_, columnIndex) => {
              const column = columnIndex + 1;
              return <div key={column} id={`${id}-${column}-${row}`} role="gridcell" aria-label={dimensionsLabel(column, row)}
                aria-selected={column === columnCount && row === rowCount}
                className={column <= shown.columns && row <= shown.rows ? "grid-dimension-cell grid-dimension-cell--preview" : "grid-dimension-cell"}
                onMouseEnter={() => setPreview({ columns: column, rows: row })} onClick={() => choose(column, row)} />;
            })}
          </div>;
        })}
      </div>
      <p className="grid-dimensions-label" aria-live="polite">
        {Number.isInteger(shown.columns) && shown.columns > 0 && Number.isInteger(shown.rows) && shown.rows > 0
          ? dimensionsLabel(shown.columns, shown.rows) : "Choose columns and rows"}
      </p>
      <div className="grid-dimensions-inputs">
        <label>Columns<input type="number" min="1" max="12" step="1" value={columns} aria-invalid={!!problem}
          aria-describedby={problem ? `${id}-problem` : undefined} onChange={(event) => { setColumns(event.target.value); setPreview(null); }} /></label>
        <label>Rows<input type="number" min="1" max="12" step="1" value={rows} aria-invalid={!!problem}
          aria-describedby={problem ? `${id}-problem` : undefined} onChange={(event) => { setRows(event.target.value); setPreview(null); }} /></label>
      </div>
      {problem && <p id={`${id}-problem`} className="error-banner" role="alert">{problem}</p>}
      <div className="album-toolbar">
        <button type="submit" className="button-primary" disabled={!!problem || disabled}>{action}</button>
        <button type="button" className="button-quiet" onClick={onClose}>Cancel</button>
      </div>
    </form>
  </ModalDialog>;
}
