import { useState, type FormEvent } from "react";
import ModalDialog from "./ModalDialog";

/**
 * Asks for a Folder name, for "New Folder…" or "Rename…". With `confirm`, a valid name is
 * confirmed in a second step before `onSubmit` runs.
 */
export default function FolderNameDialog({ label, description, initialName = "", submitLabel, problem: nameProblem, confirm, onSubmit, onClose }: {
  label: string;
  description: string;
  initialName?: string;
  submitLabel: string;
  /** Why `name` can't be used, or null if it can. */
  problem: (name: string) => string | null;
  /** What confirming `name` will do. */
  confirm?: (name: string) => string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const reason = nameProblem(name);
    if (reason) { setProblem(reason); return; }
    if (confirm && !confirming) { setConfirming(true); return; }
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit(name.trim());
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return <ModalDialog label={label} onClose={onClose} closeDisabled={busy}>
    <form className="send-to-folder" onSubmit={(event) => void submit(event)}>
      <h2>{label}</h2>
      {confirming && confirm ? <p>{confirm(name.trim())}</p> : <>
        <p>{description}</p>
        <label>Folder name
          <input type="text" value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setProblem(null); }} />
        </label>
      </>}
      {problem && <p className="error-banner" role="alert">{problem}</p>}
      <div className="album-toolbar">
        <button type="submit" className="button-primary" disabled={busy || !name.trim()}>{submitLabel}</button>
        <button type="button" className="button-quiet" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </ModalDialog>;
}
