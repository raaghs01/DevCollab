import * as Y from "yjs";
import { TemplateFile, TemplateFolder } from "@/modules/playground/lib/path-to-json";

export interface FileTreeEntry {
  type: "file" | "folder";
  name: string; // filename (files) or folderName (folders) — no extension
  fileExtension?: string;
}

const FILE_TREE_KEY = "fileTree";
const FILES_KEY = "files";

export function getFileTreeMap(ydoc: Y.Doc): Y.Map<FileTreeEntry> {
  return ydoc.getMap<FileTreeEntry>(FILE_TREE_KEY);
}

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function fileEntryName(file: TemplateFile): string {
  return file.fileExtension ? `${file.filename}.${file.fileExtension}` : file.filename;
}

function flattenInto(map: Y.Map<FileTreeEntry>, folder: TemplateFolder, parentPath: string) {
  for (const item of folder.items) {
    if ("folderName" in item) {
      const path = joinPath(parentPath, item.folderName);
      map.set(path, { type: "folder", name: item.folderName });
      flattenInto(map, item, path);
    } else {
      const path = joinPath(parentPath, fileEntryName(item));
      map.set(path, { type: "file", name: item.filename, fileExtension: item.fileExtension });
    }
  }
}

// Seeds the shared tree from the last-loaded DB snapshot. No-ops if the room
// already has tree state — a late joiner must see the live CRDT state, not
// stomp it with a possibly-stale snapshot (mirrors F4.8 for file content).
export function seedFileTree(ydoc: Y.Doc, root: TemplateFolder) {
  const map = getFileTreeMap(ydoc);
  if (map.size > 0) return;
  ydoc.transact(() => {
    flattenInto(map, root, "");
  });
}

// Reconstructs the nested tree the UI renders from the flat path -> entry
// map, pulling each file's live content from the `files` Y.Text map so a
// freshly-built node's `content` matches what Monaco will actually show
// (otherwise a newly-opened file's `originalContent` would default to ""
// and immediately register as a false "unsaved change").
export function buildTemplateFolder(ydoc: Y.Doc, rootFolderName: string): TemplateFolder {
  const treeMap = getFileTreeMap(ydoc);
  const filesMap = ydoc.getMap<Y.Text>(FILES_KEY);

  const root: TemplateFolder = { folderName: rootFolderName, items: [] };
  const folders = new Map<string, TemplateFolder>([["", root]]);

  const parentPathOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

  const ensureFolder = (path: string): TemplateFolder => {
    const existing = folders.get(path);
    if (existing) return existing;
    const parent = ensureFolder(parentPathOf(path));
    const node: TemplateFolder = { folderName: nameOf(path), items: [] };
    parent.items.push(node);
    folders.set(path, node);
    return node;
  };

  // Shallowest paths first so every parent is materialized before a child
  // needs to attach to it.
  const entries = Array.from(treeMap.entries()).sort(
    (a, b) => a[0].split("/").length - b[0].split("/").length
  );

  for (const [path, entry] of entries) {
    if (entry.type === "folder") ensureFolder(path);
  }
  for (const [path, entry] of entries) {
    if (entry.type !== "file") continue;
    const parent = ensureFolder(parentPathOf(path));
    parent.items.push({
      filename: entry.name,
      fileExtension: entry.fileExtension || "",
      content: filesMap.get(path)?.toString() ?? "",
    });
  }

  return root;
}

export function addFileEntry(
  ydoc: Y.Doc,
  path: string,
  filename: string,
  fileExtension: string,
  initialContent: string
) {
  const treeMap = getFileTreeMap(ydoc);
  const filesMap = ydoc.getMap<Y.Text>(FILES_KEY);
  ydoc.transact(() => {
    treeMap.set(path, { type: "file", name: filename, fileExtension });
    if (!filesMap.has(path)) {
      const ytext = new Y.Text();
      if (initialContent) ytext.insert(0, initialContent);
      filesMap.set(path, ytext);
    }
  });
}

export function addFolderEntry(ydoc: Y.Doc, path: string, folderName: string, children?: TemplateFolder) {
  const treeMap = getFileTreeMap(ydoc);
  ydoc.transact(() => {
    treeMap.set(path, { type: "folder", name: folderName });
    if (children && children.items.length > 0) {
      flattenInto(treeMap, children, path);
    }
  });
}

function collectDescendantPaths(map: Y.Map<FileTreeEntry>, path: string): string[] {
  const prefix = `${path}/`;
  const result: string[] = [];
  map.forEach((_entry, key) => {
    if (key.startsWith(prefix)) result.push(key);
  });
  return result;
}

export function deleteEntry(ydoc: Y.Doc, path: string) {
  const treeMap = getFileTreeMap(ydoc);
  const filesMap = ydoc.getMap<Y.Text>(FILES_KEY);
  const entry = treeMap.get(path);
  if (!entry) return;

  ydoc.transact(() => {
    const paths = entry.type === "folder" ? [path, ...collectDescendantPaths(treeMap, path)] : [path];
    for (const p of paths) {
      treeMap.delete(p);
      filesMap.delete(p);
    }
  });
}

// Renames are decomposed into delete + create rather than tracked as an
// atomic move — correct, if not history-preserving; true atomic renames
// need a custom Yjs type beyond Y.Map (see PRD open question 5).
export function renameEntry(ydoc: Y.Doc, oldPath: string, newPath: string, newEntry: FileTreeEntry) {
  const treeMap = getFileTreeMap(ydoc);
  const filesMap = ydoc.getMap<Y.Text>(FILES_KEY);
  const entry = treeMap.get(oldPath);
  if (!entry) return;

  const moveText = (from: string, to: string) => {
    const ytext = filesMap.get(from);
    if (!ytext) return;
    // Deleting a Y.Map key that holds a nested shared type cascades to clear
    // that type's own content — the string must be captured before delete,
    // not after, or the moved file ends up empty.
    const content = ytext.toString();
    filesMap.delete(from);
    filesMap.set(to, new Y.Text(content));
  };

  ydoc.transact(() => {
    if (entry.type === "file") {
      treeMap.delete(oldPath);
      treeMap.set(newPath, newEntry);
      moveText(oldPath, newPath);
      return;
    }

    const descendants = collectDescendantPaths(treeMap, oldPath);
    treeMap.delete(oldPath);
    treeMap.set(newPath, newEntry);
    for (const oldDescendantPath of descendants) {
      const relative = oldDescendantPath.slice(oldPath.length);
      const newDescendantPath = `${newPath}${relative}`;
      const descendantEntry = treeMap.get(oldDescendantPath)!;
      treeMap.delete(oldDescendantPath);
      treeMap.set(newDescendantPath, descendantEntry);
      moveText(oldDescendantPath, newDescendantPath);
    }
  });
}
