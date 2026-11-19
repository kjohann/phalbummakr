import { describe, expect, it } from "vitest";
import { historyAfterRename, historyAfterRescan, canStepFolder, currentFolder, START_FOLDER_HISTORY, stepFolder, visitFolder, type FolderHistory } from "./folderHistory";

function visitAll(...folders: string[]): FolderHistory {
  return folders.reduce(visitFolder, START_FOLDER_HISTORY);
}

it("starts at the Library root with nowhere to go", () => {
  expect(currentFolder(START_FOLDER_HISTORY)).toBe("");
  expect(canStepFolder(START_FOLDER_HISTORY, -1)).toBe(false);
  expect(canStepFolder(START_FOLDER_HISTORY, 1)).toBe(false);
});

it("goes back and forward through visited Folders like a web browser", () => {
  let history = visitAll("trips", "trips/kids");
  history = stepFolder(history, -1);
  expect(currentFolder(history)).toBe("trips");
  history = stepFolder(history, -1);
  expect(currentFolder(history)).toBe("");
  expect(canStepFolder(history, -1)).toBe(false);
  expect(stepFolder(history, -1)).toBe(history);
  history = stepFolder(stepFolder(history, 1), 1);
  expect(currentFolder(history)).toBe("trips/kids");
  expect(canStepFolder(history, 1)).toBe(false);
});

it("doesn't add a step for the current Folder, and drops forward steps when going somewhere new", () => {
  let history = visitAll("trips", "trips");
  expect(history.steps).toEqual(["", "trips"]);
  history = visitFolder(stepFolder(visitAll("trips", "trips/kids"), -1), "pets");
  expect(currentFolder(history)).toBe("pets");
  expect(canStepFolder(history, 1)).toBe(false);
  expect(currentFolder(stepFolder(history, -1))).toBe("trips");
});

describe("after a rescan", () => {
  it("keeps the history when every Folder in it still exists", () => {
    const history = stepFolder(visitAll("trips", "pets"), -1);
    expect(historyAfterRescan(history, ["trips", "pets", "other"])).toEqual({ history, fellBackFrom: null });
  });

  it("replaces a missing current Folder with its nearest existing parent, keeping the other steps", () => {
    const history = stepFolder(visitAll("pets", "trips/kids/small", "other"), -1);
    const { history: after, fellBackFrom } = historyAfterRescan(history, ["pets", "trips", "other"]);
    expect(fellBackFrom).toBe("trips/kids/small");
    expect(after.steps).toEqual(["", "pets", "trips", "other"]);
    expect(currentFolder(after)).toBe("trips");
  });

  it("clears the history when a back or forward step no longer exists", () => {
    const history = stepFolder(visitAll("pets", "trips/kids", "other"), -1);
    expect(historyAfterRescan(history, ["trips/kids", "trips", "other"])).toEqual({
      history: { steps: ["trips/kids"], index: 0 }, fellBackFrom: null,
    });
    expect(historyAfterRescan(history, ["trips", "other"])).toEqual({
      history: { steps: ["trips"], index: 0 }, fellBackFrom: "trips/kids",
    });
  });
});

describe("after renaming a Folder", () => {
  const rename = { from: "trips", to: "travels" };

  it("clears the history when it includes the Folder or anything under it, following the rename", () => {
    expect(historyAfterRename(stepFolder(visitAll("trips/kids", "pets"), -1), rename)).toEqual({ steps: ["travels/kids"], index: 0 });
    expect(historyAfterRename(visitAll("trips", "pets"), rename)).toEqual({ steps: ["pets"], index: 0 });
  });

  it("keeps a history that only shares the start of the name", () => {
    const history = visitAll("trips-old", "pets");
    expect(historyAfterRename(history, rename)).toBe(history);
  });
});
