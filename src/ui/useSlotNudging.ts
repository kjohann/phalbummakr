import { useEffect, useRef, useState } from "react";
import { pageDimensions, type Album } from "../core";
import { nudgeSlots } from "./pageCanvas";
import { keyboardTaken } from "./slotShortcuts";
import type { SnapGuide } from "./slotSnapping";

let nextGroup = 0;

export function useSlotNudging({ active, enabled, pageId, slotIds, change, endGroup }: {
  active: boolean;
  enabled: boolean;
  pageId: string;
  slotIds: readonly string[];
  change: (update: (album: Album) => Album, group: string) => void;
  endGroup: () => void;
}) {
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const run = useRef<{ group: string; key: string; remaining: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const latest = useRef({ active, enabled, pageId, slotIds, change, endGroup });
  latest.current = { active, enabled, pageId, slotIds, change, endGroup };
  const selection = `${pageId}:${slotIds.join(":")}`;

  useEffect(() => {
    const finish = () => {
      if (!run.current) return;
      clearTimeout(run.current.timer);
      run.current = null;
      latest.current.endGroup();
      setGuides([]);
    };
    finishRef.current = finish;
    const keyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
      const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
      const target = event.target;
      const control = target instanceof Element
        ? target.closest("button, a, [role='button'], [role='menu'], [role='slider'], [tabindex]") : null;
      const otherControl = control !== null && !control.classList.contains("slot-overlay");
      if (!current.active || !current.slotIds.length || !isArrow || event.ctrlKey || event.metaKey || event.altKey
        || event.defaultPrevented || keyboardTaken(event) || otherControl) {
        finish();
        return;
      }
      if (!current.enabled) return;
      event.preventDefault();
      const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
      const sign = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      if (!run.current) {
        run.current = { group: `nudge:${++nextGroup}`, key: event.key, remaining: 0, timer: setTimeout(finish, 1000) };
      }
      const ongoing = run.current;
      clearTimeout(ongoing.timer);
      if (ongoing.key !== event.key) ongoing.remaining = 0;
      ongoing.key = event.key;
      current.change((album) => {
        const dimensions = pageDimensions(album.pageFormat);
        const step = sign * (event.shiftKey ? 10 : 1) / (axis === "x" ? dimensions.widthMm : dimensions.heightMm);
        const requested = ongoing.remaining || step;
        const result = nudgeSlots(album, current.pageId, current.slotIds, axis, requested);
        ongoing.remaining = result.guides.length && Math.abs(requested - result.moved) > 1e-9
          ? requested - result.moved : 0;
        if (result.guides.length) setGuides(result.guides);
        return result.album;
      }, ongoing.group);
      ongoing.timer = setTimeout(finish, 1000);
    };
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("pointerdown", finish, true);
    window.addEventListener("mousedown", finish, true);
    window.addEventListener("click", finish, true);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("pointerdown", finish, true);
      window.removeEventListener("mousedown", finish, true);
      window.removeEventListener("click", finish, true);
      window.removeEventListener("blur", finish);
      finish();
      finishRef.current = () => {};
    };
  }, [selection, active]);

  return { guides, finish: () => finishRef.current() };
}
