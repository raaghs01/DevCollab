"use client";

import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import { findFileByPath } from "@/modules/playground/lib";
import { TemplateFile, TemplateFolder } from "@/modules/playground/lib/path-to-json";

interface UseFollowModeParams {
  awareness: Awareness | null;
  templateData: TemplateFolder | null;
  activeFileId: string | null;
  openFile: (file: TemplateFile) => void;
}

// Following a collaborator (F4.6) means: whenever their awareness state says
// they're on a different file than we are, switch to it too. Cursor-level
// following within a shared file is handled separately by y-monaco's own
// awareness-driven decorations (Phase 2) — this only drives navigation.
export function useFollowMode({ awareness, templateData, activeFileId, openFile }: UseFollowModeParams) {
  const [followingClientId, setFollowingClientId] = useState<number | null>(null);

  const toggleFollow = (clientId: number) => {
    setFollowingClientId((current) => (current === clientId ? null : clientId));
  };

  useEffect(() => {
    if (!awareness || followingClientId === null) return;

    const handleChange = () => {
      const state = awareness.getStates().get(followingClientId);
      if (!state) {
        // The followed user disconnected.
        setFollowingClientId(null);
        return;
      }
      const targetPath = state.currentFile as string | undefined;
      if (!targetPath || targetPath === activeFileId || !templateData) return;
      const file = findFileByPath(templateData, targetPath);
      if (file) openFile(file);
    };

    handleChange();
    awareness.on("change", handleChange);
    return () => awareness.off("change", handleChange);
  }, [awareness, followingClientId, activeFileId, templateData, openFile]);

  return { followingClientId, toggleFollow };
}
