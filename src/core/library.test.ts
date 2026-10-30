import { describe, expect, it } from "vitest";
import { libraryName, openLibrary, restoreLastLibrary, type LibraryPorts } from "./library";

function fakePorts(overrides: Partial<LibraryPorts> & { libraries?: string[]; picked?: string | null } = {}) {
  const libraries = new Set(overrides.libraries ?? []);
  const created: string[] = [];
  let remembered: string | null = null;
  const ports: LibraryPorts = {
    pickFolder: async () => (overrides.picked === undefined ? "D:/Photos" : overrides.picked),
    isLibrary: async (folder) => libraries.has(folder),
    confirmCreate: async () => true,
    createLibrary: async (folder) => {
      created.push(folder);
      libraries.add(folder);
    },
    rememberLibrary: async (root) => {
      remembered = root;
    },
    recallLibrary: async () => remembered,
    ...overrides,
  };
  return { ports, created, remembered: () => remembered };
}

describe("openLibrary", () => {
  it("opens a picked folder that is already a Library and remembers it", async () => {
    const { ports, created, remembered } = fakePorts({ libraries: ["D:/Photos"] });

    expect(await openLibrary(ports)).toEqual({ root: "D:/Photos" });
    expect(created).toEqual([]);
    expect(remembered()).toBe("D:/Photos");
  });

  it("makes a folder a Library when the user confirms", async () => {
    const asked: string[] = [];
    const { ports, created, remembered } = fakePorts({
      confirmCreate: async (folder) => {
        asked.push(folder);
        return true;
      },
    });

    expect(await openLibrary(ports)).toEqual({ root: "D:/Photos" });
    expect(asked).toEqual(["D:/Photos"]);
    expect(created).toEqual(["D:/Photos"]);
    expect(remembered()).toBe("D:/Photos");
  });

  it("leaves a folder untouched when the user declines to make it a Library", async () => {
    const { ports, created, remembered } = fakePorts({ confirmCreate: async () => false });

    expect(await openLibrary(ports)).toBeNull();
    expect(created).toEqual([]);
    expect(remembered()).toBeNull();
  });

  it("opens nothing when the folder picker is cancelled", async () => {
    const { ports, remembered } = fakePorts({ picked: null });

    expect(await openLibrary(ports)).toBeNull();
    expect(remembered()).toBeNull();
  });

  it("still opens the Library when it cannot be remembered", async () => {
    const { ports } = fakePorts({
      libraries: ["D:/Photos"],
      rememberLibrary: async () => {
        throw new Error("app data is read-only");
      },
    });

    expect(await openLibrary(ports)).toEqual({ root: "D:/Photos" });
  });
});

describe("libraryName", () => {
  it("is the last folder of the Library root", () => {
    expect(libraryName({ root: "D:\\Photos\\Family\\" })).toBe("Family");
    expect(libraryName({ root: "/home/kris/Holidays" })).toBe("Holidays");
  });
});

describe("restoreLastLibrary", () => {
  it("reopens the remembered Library", async () => {
    const { ports } = fakePorts({ libraries: ["D:/Photos"], recallLibrary: async () => "D:/Photos" });

    expect(await restoreLastLibrary(ports)).toEqual({ root: "D:/Photos" });
  });

  it("opens nothing when no Library has been opened before", async () => {
    const { ports } = fakePorts();

    expect(await restoreLastLibrary(ports)).toBeNull();
  });

  it("does not reopen a remembered folder that is no longer a Library, and never creates one", async () => {
    const { ports, created } = fakePorts({ recallLibrary: async () => "D:/Moved" });

    expect(await restoreLastLibrary(ports)).toBeNull();
    expect(created).toEqual([]);
  });
});
