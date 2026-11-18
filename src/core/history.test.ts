import { describe, expect, it } from "vitest";
import { canRedo, canUndo, emptyHistory, endGroup, recordChange, redo, undo } from "./history";

describe("undo history", () => {
  it("undoes and redoes recorded changes in order", () => {
    let history = recordChange(emptyHistory<string>(), "a");
    history = recordChange(history, "b");
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);

    const first = undo(history, "c")!;
    expect(first.state).toBe("b");
    const second = undo(first.history, first.state)!;
    expect(second.state).toBe("a");
    expect(undo(second.history, second.state)).toBeNull();

    const again = redo(second.history, second.state)!;
    expect(again.state).toBe("b");
    expect(redo(again.history, again.state)!.state).toBe("c");
  });

  it("forgets undone states once a new change is made", () => {
    const undone = undo(recordChange(emptyHistory<string>(), "a"), "b")!;
    expect(canRedo(recordChange(undone.history, undone.state))).toBe(false);
  });

  it("keeps consecutive changes in the same group as one step until the group ends", () => {
    // Typing "Hi" in one Text Slot, then once more after leaving it.
    let history = recordChange(emptyHistory<string>(), "", "text");
    history = recordChange(history, "H", "text");
    history = endGroup(history);
    history = recordChange(history, "Hi", "text");
    const first = undo(history, "Hi!")!;
    expect(first.state).toBe("Hi");
    expect(undo(first.history, first.state)!.state).toBe("");
  });

  it("ends a group when another change, an undo or a redo comes between", () => {
    let history = recordChange(emptyHistory<string>(), "a", "text");
    history = recordChange(history, "b");
    history = recordChange(history, "c", "text");
    expect(undo(history, "d")!.state).toBe("c");

    const undone = undo(recordChange(emptyHistory<string>(), "a", "text"), "b")!;
    const redone = redo(undone.history, undone.state)!;
    expect(undo(recordChange(redone.history, "b", "text"), "c")!.state).toBe("b");
  });
});
