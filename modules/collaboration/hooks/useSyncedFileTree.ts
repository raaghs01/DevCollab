"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { buildTemplateFolder, getFileTreeMap, seedFileTree } from "../lib/file-tree-sync";

// Keeps the file explorer's rendered tree (zustand) in sync with the shared
// Yjs file tree, so creates/renames/deletes from any collaborator show up in
// everyone's sidebar immediately (F4.7). Falls back to mirroring the raw DB
// snapshot when there's no room to sync through (e.g. missing roomId).
export function useSyncedFileTree(ydoc: Y.Doc | null, initialTemplateData: TemplateFolder | null) {
  const setTemplateData = useFileExplorer((s) => s.setTemplateData);
  const openFilesLength = useFileExplorer((s) => s.openFiles.length);
  const rootFolderNameRef = useRef("Root");
  const hasSeededRef = useRef(false);

  useEffect(() => {
    if (!ydoc) {
      if (initialTemplateData && openFilesLength === 0) {
        setTemplateData(initialTemplateData);
      }
      return;
    }

    if (!hasSeededRef.current && initialTemplateData) {
      rootFolderNameRef.current = initialTemplateData.folderName || "Root";
      seedFileTree(ydoc, initialTemplateData);
      hasSeededRef.current = true;
    }

    const map = getFileTreeMap(ydoc);
    const applyFromMap = () => {
      setTemplateData(buildTemplateFolder(ydoc, rootFolderNameRef.current));
    };
    applyFromMap();
    map.observe(applyFromMap);
    return () => map.unobserve(applyFromMap);
  }, [ydoc, initialTemplateData, openFilesLength, setTemplateData]);
}
