import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** A submenu, opened by hovering or →. Clicking the item still runs `onSelect` if it has one. */
  items?: MenuItem[];
}

const ITEM_SELECTOR = ":scope > .context-menu-entry > [role='menuitem']";

function MenuList({ label, items, style, className, onClose, onBack }: {
  label: string;
  items: MenuItem[];
  style?: CSSProperties;
  className: string;
  onClose: () => void;
  /** Closes this submenu and returns focus to its item; absent at the top level. */
  onBack?: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusSubmenu = useRef(false);
  const entries = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Keeps the menu on screen: the top level moves in, submenus open to the left instead.
    const bounds = list.getBoundingClientRect();
    if (onBack) {
      if (bounds.right > window.innerWidth) list.classList.add("context-submenu--left");
      const overflow = bounds.bottom - window.innerHeight;
      if (overflow > 0) list.style.top = `${list.offsetTop - Math.min(overflow, bounds.top)}px`;
    } else {
      if (bounds.right > window.innerWidth) list.style.left = `${Math.max(0, window.innerWidth - bounds.width)}px`;
      if (bounds.bottom > window.innerHeight) list.style.top = `${Math.max(0, window.innerHeight - bounds.height)}px`;
    }
    entries().find((entry) => entry.getAttribute("aria-disabled") !== "true" && !entry.disabled)?.focus();
  }, [onBack]);

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = entries();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(index + step + all.length) % all.length].focus();
    } else if (event.key === "ArrowRight" && items[index].items) {
      focusSubmenu.current = true;
      setOpen(index);
    } else if (event.key === "ArrowLeft" && onBack) {
      onBack();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div role="menu" aria-label={label} className={className} style={style} ref={listRef} onKeyDown={keyDown}>
      {items.map((item, index) => {
        const unavailable = item.disabled || (!item.onSelect && !item.items);
        return (
          <div key={`${index}:${item.label}`} className="context-menu-entry"
            onMouseEnter={() => { focusSubmenu.current = false; setOpen(item.items ? index : null); }}>
            <button type="button" role="menuitem" className={item.items ? "context-menu-parent" : undefined}
              // A disabled item with a submenu stays focusable, so its submenu can still be reached.
              disabled={unavailable && !item.items} aria-disabled={unavailable && item.items ? true : undefined}
              aria-haspopup={item.items ? "menu" : undefined} aria-expanded={item.items ? open === index : undefined}
              onClick={() => {
                if (item.onSelect && !item.disabled) {
                  onClose();
                  item.onSelect();
                } else if (item.items) {
                  focusSubmenu.current = true;
                  setOpen(open === index ? null : index);
                }
              }}>{item.label}</button>
            {item.items && open === index && <MenuList label={item.label} items={item.items} className="strip-menu context-submenu"
              onClose={onClose} onBack={() => { setOpen(null); entries()[index]?.focus(); }} />}
          </div>
        );
      })}
    </div>
  );
}

/** A right-click menu at the pointer, with nested submenus. Closes on Escape, a click elsewhere or a choice. */
export default function ContextMenu({ label, x, y, items, onClose }: {
  label: string;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const outside = (event: MouseEvent) => {
      if (!(event.target instanceof Node && rootRef.current?.contains(event.target))) closeRef.current();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeRef.current();
    };
    const close = () => closeRef.current();
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      const focusLost = document.activeElement === document.body || rootRef.current?.contains(document.activeElement);
      if (previous?.isConnected && focusLost) previous.focus();
    };
  }, []);
  return createPortal(<div ref={rootRef}>
    <MenuList label={label} items={items} className="strip-menu context-menu" style={{ left: x, top: y }} onClose={onClose} />
  </div>, document.body);
}
