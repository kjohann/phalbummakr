export interface Library {
  /** The only absolute path the tool keeps; everything else is relative to it. */
  root: string;
}

export interface LibraryPorts {
  pickFolder(): Promise<string | null>;
  isLibrary(folder: string): Promise<boolean>;
  confirmCreate(folder: string): Promise<boolean>;
  createLibrary(folder: string): Promise<void>;
  rememberLibrary(root: string): Promise<void>;
  recallLibrary(): Promise<string | null>;
}

export async function openLibrary(ports: LibraryPorts): Promise<Library | null> {
  const folder = await ports.pickFolder();
  if (folder === null) return null;
  if (!(await ports.isLibrary(folder))) {
    if (!(await ports.confirmCreate(folder))) return null;
    await ports.createLibrary(folder);
  }
  // Failing to remember a preference must not stop the user working in a valid Library.
  await ports.rememberLibrary(folder).catch((error: unknown) => {
    console.warn("Could not remember the Library", error);
  });
  return { root: folder };
}

export function libraryName(library: Library): string {
  return library.root.split(/[\\/]/).filter(Boolean).pop() ?? library.root;
}

export async function restoreLastLibrary(ports: LibraryPorts): Promise<Library | null> {
  const root = await ports.recallLibrary();
  if (root === null || !(await ports.isLibrary(root))) return null;
  return { root };
}
