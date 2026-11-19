import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

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
  context: BarCommand[];
  document: BarCommand[];
  /** Receives the element in the middle group where the selected Slot's tools are rendered. */
  toolsRef?: (element: HTMLDivElement | null) => void;
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

/** The gap between commands, measured on the bar's invisible copy. */
function commandGap(measure: HTMLElement) {
  return parseFloat(getComputedStyle(measure.querySelector(".command-group") ?? measure).columnGap) || 0;
}

/** Which overflowable commands must move into the "⋯" menu for the bar to fit. */
function overflowing(bar: HTMLElement, measure: HTMLElement, more: HTMLElement, tools: HTMLElement, commands: BarCommand[]): string[] {
  const available = bar.clientWidth;
  // The tools are rendered from outside the bar, so the invisible copy cannot lay them out.
  let needed = measure.offsetWidth + tools.scrollWidth;
  if (needed <= available) return [];
  const gap = commandGap(measure);
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

/**
 * Reports the room that Slot tools rendered in `element` have in its command bar with every command shown,
 * now and whenever the bar or its commands resize. Reports nothing outside a command bar.
 */
export function observeToolsRoom(element: HTMLElement, onRoom: (room: number) => void): () => void {
  const bar = element.closest<HTMLElement>(".command-bar");
  const measure = bar?.querySelector<HTMLElement>(".command-bar--measure");
  if (!bar || !measure) return () => {};
  const update = () => onRoom(bar.clientWidth - measure.offsetWidth - commandGap(measure));
  update();
  const observer = new ResizeObserver(update);
  observer.observe(bar);
  observer.observe(measure);
  return () => observer.disconnect();
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

export default function CommandBar({ context, document: documentCommands, toolsRef }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const toolsElement = useRef<HTMLDivElement | null>(null);
  const toolsRefRef = useRef(toolsRef);
  toolsRefRef.current = toolsRef;
  const setTools = useCallback((element: HTMLDivElement | null) => {
    toolsElement.current = element;
    toolsRefRef.current?.(element);
  }, []);
  const [hidden, setHidden] = useState<string[]>([]);
  const all = [...context, ...documentCommands];
  const commandsRef = useRef(all);
  commandsRef.current = all;
  const layoutKey = all.map((command) => `${command.id}:${command.label}`).join("|");

  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    const more = moreRef.current;
    const tools = toolsElement.current;
    if (!bar || !measure || !more || !tools) return;
    const update = () => {
      const next = overflowing(bar, measure, more, tools, commandsRef.current);
      setHidden((current) => current.join("|") === next.join("|") ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    observer.observe(measure);
    observer.observe(tools);
    return () => observer.disconnect();
  }, [layoutKey]);

  const shown = (commands: BarCommand[], measure: boolean) => measure ? commands : commands.filter((command) => !hidden.includes(command.id));
  const overflowed = all.filter((command) => hidden.includes(command.id));
  const groups = (measure: boolean) => <>
    <div className="command-group command-context">
      {!measure && <div className="command-tools" ref={setTools} />}
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
