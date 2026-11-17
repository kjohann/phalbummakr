import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export type Mode = "album" | "layouts" | "sort";

export const MODES: { id: Mode; label: string }[] = [
  { id: "album", label: "Album" },
  { id: "layouts", label: "Layouts" },
  { id: "sort", label: "Sort" },
];

export interface BarCommand {
  id: string;
  label: string;
  run: () => void;
  disabled?: boolean;
  /** Set for toggles; shown as aria-pressed. */
  pressed?: boolean;
  /** Shortcut in aria-keyshortcuts syntax, e.g. "Control+B". */
  shortcut?: string;
  /** Low-priority commands move into the "⋯" menu when the bar is too narrow, highest number first. */
  overflow?: number;
}

interface Props {
  /** Absent while no Album is open. */
  mode?: { current: Mode; onChange: (mode: Mode) => void; disabled?: boolean };
  context: BarCommand[];
  document: BarCommand[];
}

function shortcutLabel(shortcut: string) {
  return shortcut.replace("Control", "Ctrl");
}

function CommandButton({ command, measure }: { command: BarCommand; measure: boolean }) {
  return <button type="button" className="command" tabIndex={measure ? -1 : undefined} data-command={command.id}
    disabled={command.disabled} aria-pressed={command.pressed} aria-keyshortcuts={command.shortcut}
    title={command.shortcut ? `${command.label} (${shortcutLabel(command.shortcut)})` : undefined}
    onClick={command.run}>{command.label}</button>;
}

/** Which overflowable commands must move into the "⋯" menu for the bar to fit. */
function overflowing(bar: HTMLElement, measure: HTMLElement, more: HTMLElement, commands: BarCommand[]): string[] {
  const available = bar.clientWidth;
  let needed = measure.offsetWidth;
  if (needed <= available) return [];
  const gap = parseFloat(getComputedStyle(measure.querySelector(".command-group") ?? measure).columnGap) || 0;
  needed += more.offsetWidth + gap;
  const widths = new Map(Array.from(measure.querySelectorAll<HTMLElement>("[data-command]"),
    (element) => [element.dataset.command, element.offsetWidth]));
  const hidden: string[] = [];
  for (const command of commands.filter((entry) => entry.overflow !== undefined).sort((a, b) => b.overflow! - a.overflow!)) {
    if (needed <= available) break;
    hidden.push(command.id);
    needed -= (widths.get(command.id) ?? 0) + gap;
  }
  return hidden;
}

function OverflowMenu({ commands }: { commands: BarCommand[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const enabled = items();
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      enabled[(index + step + enabled.length) % enabled.length]?.focus();
    }
  }

  return <div className="command-more" ref={rootRef}>
    <button type="button" className="command" ref={buttonRef} aria-label="More commands" aria-haspopup="menu"
      aria-expanded={open} onClick={() => setOpen((value) => !value)}>⋯</button>
    {open && <div className="command-menu" role="menu" aria-label="More commands" ref={menuRef} onKeyDown={keyDown}>
      {commands.map((command) => (
        <button key={command.id} type="button" role={command.pressed === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={command.pressed} disabled={command.disabled} aria-keyshortcuts={command.shortcut}
          onClick={() => { setOpen(false); buttonRef.current?.focus(); command.run(); }}>
          <span className="command-check" aria-hidden="true">{command.pressed ? "✓" : ""}</span>
          <span>{command.label}</span>
          <span className="command-shortcut" aria-hidden="true">{command.shortcut ? shortcutLabel(command.shortcut) : ""}</span>
        </button>
      ))}
    </div>}
  </div>;
}

export default function CommandBar({ mode, context, document: documentCommands }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const all = [...context, ...documentCommands];
  const commandsRef = useRef(all);
  commandsRef.current = all;
  const layoutKey = `${mode ? "modes" : ""}|${all.map((command) => `${command.id}:${command.label}`).join("|")}`;

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    const more = moreRef.current;
    if (!bar || !measure || !more) return;
    const update = () => {
      const next = overflowing(bar, measure, more, commandsRef.current);
      setHidden((current) => current.join("|") === next.join("|") ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [layoutKey]);

  const shown = (commands: BarCommand[], measure: boolean) => measure ? commands : commands.filter((command) => !hidden.includes(command.id));
  const overflowed = all.filter((command) => hidden.includes(command.id));
  const groups = (measure: boolean) => <>
    {mode && <div className="command-group command-modes" role="group" aria-label="Mode">
      {MODES.map(({ id, label }) => (
        <button key={id} type="button" className="command" tabIndex={measure ? -1 : undefined}
          aria-pressed={mode.current === id} disabled={mode.disabled} onClick={() => mode.onChange(id)}>{label}</button>
      ))}
    </div>}
    <div className="command-group command-context">
      {shown(context, measure).map((command) => <CommandButton key={command.id} command={command} measure={measure} />)}
    </div>
    <div className="command-group command-document">
      {shown(documentCommands, measure).map((command) => <CommandButton key={command.id} command={command} measure={measure} />)}
      {!measure && overflowed.length > 0 && <OverflowMenu commands={overflowed} />}
    </div>
  </>;

  return (
    <div className="command-bar" role="toolbar" aria-label="Commands" ref={barRef}>
      {groups(false)}
      {/* Lays every command out invisibly, so the bar knows the room each one needs. */}
      <div className="command-bar command-bar--measure" aria-hidden="true" ref={measureRef}>{groups(true)}</div>
      <span className="command command-more-measure" aria-hidden="true" data-more="" ref={moreRef}>⋯</span>
    </div>
  );
}
