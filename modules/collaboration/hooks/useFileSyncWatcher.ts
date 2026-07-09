"use client";

import { useEffect } from "react";
import * as Y from "yjs";
import type { WebContainer } from "@webcontainer/api";
import { getFileTreeMap, type FileTreeEntry } from "../lib/file-tree-sync";

const FILES_KEY = "files";
const WRITE_DEBOUNCE_MS = 250;

function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

// F3.4/F5.4: each user runs their own independent WebContainer (see the
// terminal/preview architecture note — WebContainer preview URLs can't be
// shared across tabs, so every user boots their own). Without this, a
// collaborator's file changes would show up in the editor and sidebar but
// never actually reach *your* running dev server or preview. This watches
// the shared Yjs file tree and content maps and mirrors every change into
// this browser's own WebContainer filesystem.
export function useFileSyncWatcher(ydoc: Y.Doc | null, instance: WebContainer | null, enabled: boolean) {
  useEffect(() => {
    if (!ydoc || !instance || !enabled) return;

    const filesMap = ydoc.getMap<Y.Text>(FILES_KEY);
    const treeMap = getFileTreeMap(ydoc);
    const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

    const writeFileNow = (path: string, content: string) => {
      const dir = dirOf(path);
      const ensureDir = dir ? instance.fs.mkdir(dir, { recursive: true }).catch(() => {}) : Promise.resolve();
      ensureDir.then(() => instance.fs.writeFile(path, content).catch(() => {}));
    };

    // Debounced per file so a burst of keystrokes (local or remote) collapses
    // into one write instead of one per keystroke.
    const scheduleWrite = (path: string, content: string) => {
      const existing = pendingWrites.get(path);
      if (existing) clearTimeout(existing);
      pendingWrites.set(
        path,
        setTimeout(() => {
          pendingWrites.delete(path);
          writeFileNow(path, content);
        }, WRITE_DEBOUNCE_MS)
      );
    };

    const removePath = (path: string) => {
      const pending = pendingWrites.get(path);
      if (pending) {
        clearTimeout(pending);
        pendingWrites.delete(path);
      }
      // @ts-ignore - force is supported at runtime even if the installed
      // @webcontainer/api types for this version don't declare it.
      instance.fs.rm(path, { recursive: true, force: true }).catch(() => {});
    };

    const handleFilesDeepChange = (events: Y.YEvent<any>[]) => {
      const changedPaths = new Set<string>();
      const deletedPaths = new Set<string>();

      for (const event of events) {
        if (event.target === filesMap) {
          event.changes.keys.forEach((change, key) => {
            if (change.action === "delete") deletedPaths.add(key);
            else changedPaths.add(key);
          });
        } else {
          const key = event.path[event.path.length - 1];
          if (typeof key === "string") changedPaths.add(key);
        }
      }

      deletedPaths.forEach((path) => removePath(path));
      changedPaths.forEach((path) => {
        if (deletedPaths.has(path)) return;
        const ytext = filesMap.get(path);
        if (ytext) scheduleWrite(path, ytext.toString());
      });
    };

    const handleTreeChange = (event: Y.YMapEvent<FileTreeEntry>) => {
      event.changes.keys.forEach((change, path) => {
        if (change.action === "delete") {
          removePath(path);
          return;
        }
        const entry = treeMap.get(path);
        if (entry?.type === "folder") {
          instance.fs.mkdir(path, { recursive: true }).catch(() => {});
        }
        // File entries are content-driven and handled by handleFilesDeepChange.
      });
    };

    // Catch up on anything created before this watcher attached (e.g. a
    // room that already had files when this user's WebContainer finished
    // booting).
    treeMap.forEach((entry, path) => {
      if (entry.type === "folder") {
        instance.fs.mkdir(path, { recursive: true }).catch(() => {});
      }
    });
    filesMap.forEach((ytext, path) => {
      writeFileNow(path, ytext.toString());
    });

    filesMap.observeDeep(handleFilesDeepChange);
    treeMap.observe(handleTreeChange);

    return () => {
      filesMap.unobserveDeep(handleFilesDeepChange);
      treeMap.unobserve(handleTreeChange);
      pendingWrites.forEach((timer) => clearTimeout(timer));
    };
  }, [ydoc, instance, enabled]);
}
