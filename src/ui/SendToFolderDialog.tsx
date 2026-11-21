import { useState, type FormEvent } from "react";
import { folderNameProblem } from "../core";
import ModalDialog from "./ModalDialog";

/** Creates a new Folder and moves or copies the Photos into it. */
export default function SendToFolderDialog({ count, parent, copy = false, siblings, onSend, onClose }: {
  count: number;
  copy?: boolean;
  /** The Folder the new Folder is created in ("" is the Library root). */
  parent: string;
  /** The names already used inside a Folder, which a new Folder there can't take. */
  siblings: (folder: string) => string[];
  /** Creates Folder `name` inside `parent` and sends the Photos there. */
  onSend: (parent: string, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photos = count === 1 ? "1 Photo" : `${count} Photos`;
  const newName = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const reason = folderNameProblem(newName, siblings(parent));
    if (reason) { setProblem(reason); return; }
    setBusy(true);
    setProblem(null);
    try {
      await onSend(parent, newName);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return <ModalDialog label="New Folder" onClose={onClose} closeDisabled={busy}>
    <form className="send-to-folder" onSubmit={(event) => void submit(event)}>
      <h2>New Folder</h2>
      <p>Creates a Folder inside {parent ? parent.split("/").pop() : "the Library"} and {copy ? "copies" : "moves"} {photos} into it.</p>
      <label>Folder name
        <input type="text" value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setProblem(null); }} />
      </label>
      {problem && <p className="error-banner" role="alert">{problem}</p>}
      <div className="album-toolbar">
        <button type="submit" className="button-primary" disabled={busy || !newName}>Create and {copy ? "Copy" : "Move"}</button>
        <button type="button" className="button-quiet" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </ModalDialog>;
}