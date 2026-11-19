import { useState, type FormEvent } from "react";
import { folderNameProblem } from "../core";
import ModalDialog from "./ModalDialog";

function folderLabel(folder: string) {
  return folder ? folder.split("/").pop()! : "the Library";
}

/** Orders Folders as a tree, each followed by its subfolders, so indentation reads correctly. */
function treeOrder(folders: string[]) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...folders].sort((a, b) => {
    const left = a.split("/");
    const right = b.split("/");
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const order = collator.compare(left[index], right[index]);
      if (order !== 0) return order;
    }
    return left.length - right.length;
  });
}

/**
 * Picks the Folder to send Photos to, optionally creating a new Folder inside it. Given a `parent`,
 * it only asks for the name of a new Folder there, as "New Folder…" in the Send to Folder menu does.
 */
export default function SendToFolderDialog({ count, folders, parent, siblings, alreadyIn, onSend, onClose }: {
  count: number;
  /** Every Folder the Photos can be sent to, except the Library root, which is always offered. */
  folders: string[];
  parent?: string;
  /** The names already used inside a Folder, which a new Folder there can't take. */
  siblings: (folder: string) => string[];
  /** Whether every Photo is already in `folder`, so sending there would do nothing. */
  alreadyIn: (folder: string) => boolean;
  /** Sends the Photos to `folder`, or to a new Folder `name` inside it. */
  onSend: (folder: string, name: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const naming = parent !== undefined;
  const [selected, setSelected] = useState<string | null>(parent ?? null);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photos = count === 1 ? "1 Photo" : `${count} Photos`;
  const newName = name.trim();
  const label = naming ? "New Folder" : "Send to Folder";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (selected === null || busy) return;
    if (naming || newName) {
      const reason = folderNameProblem(newName, siblings(selected));
      if (reason) { setProblem(reason); return; }
    }
    setBusy(true);
    setProblem(null);
    try {
      await onSend(selected, naming || newName ? newName : null);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  const nameField = <label>{naming ? "Folder name" : "New Folder (optional)"}
    <input type="text" value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setProblem(null); }} />
  </label>;
  return <ModalDialog label={label} onClose={onClose} closeDisabled={busy}>
    <form className="send-to-folder" onSubmit={(event) => void submit(event)}>
      <h2>{label}</h2>
      {naming ? <>
        <p>Creates a Folder inside {folderLabel(parent)} and moves {photos} into it.</p>
        {nameField}
      </> : <>
        <p>Moves {photos}.</p>
        <fieldset className="folder-choices" disabled={busy}>
          <legend>Folder</legend>
          {["", ...treeOrder(folders)].map((folder) => (
            <label key={folder} style={{ paddingLeft: folder ? folder.split("/").length * 16 : 0 }} title={folder || "Library"}>
              <input type="radio" name="folder" checked={selected === folder}
                onChange={() => { setSelected(folder); setProblem(null); }} />
              {folder ? folder.split("/").pop() : "Library"}
            </label>
          ))}
        </fieldset>
        {nameField}
        {selected !== null && newName && <p>Creates "{newName}" inside {folderLabel(selected)}.</p>}
      </>}
      {problem && <p className="error-banner" role="alert">{problem}</p>}
      <div className="album-toolbar">
        <button type="submit" className="button-primary"
          disabled={busy || selected === null || (naming ? !newName : alreadyIn(selected) && !newName)}>
          {naming ? "Create and Move" : "Send"}</button>
        <button type="button" className="button-quiet" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </ModalDialog>;
}
