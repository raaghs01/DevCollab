import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

import type { TemplateFolder } from "../lib/path-to-json";
import { getPlaygroundById, SaveUpdatedCode } from "../actions";

interface PlaygroundData {
  id: string;
  title?: string;
  roomId?: string;
  isPublic?: boolean;
  isOwner?: boolean;
  [key: string]: any;
}

interface UsePlaygroundReturn {
  playgroundData: PlaygroundData | null;
  templateData: TemplateFolder | null;
  isLoading: boolean;
  error: string | null;
  accessDenied: boolean;
  loadPlayground: () => Promise<void>;
  saveTemplateData: (data: TemplateFolder) => Promise<TemplateFolder>;
}

// `idOrRoomId` may be either a playground's own id (dashboard links) or its
// shareable roomId (F8.4 share links) — getPlaygroundById resolves either.
// Once resolved, the canonical playground.id is used for every subsequent
// mutation, since save/template operations are keyed by that id, not roomId.
export const usePlayground = (idOrRoomId: string): UsePlaygroundReturn => {
  const [playgroundData, setPlaygroundData] = useState<PlaygroundData | null>(
    null
  );
  const [templateData, setTemplateData] = useState<TemplateFolder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const loadPlayground = useCallback(async () => {
    if (!idOrRoomId) return;

    try {
      setIsLoading(true);
      setError(null);
      setAccessDenied(false);

      const data = await getPlaygroundById(idOrRoomId);

      if (data && "accessDenied" in data) {
        setAccessDenied(true);
        return;
      }

      if (!data) {
        setError("Playground not found");
        return;
      }

      //   @ts-ignore
      setPlaygroundData(data);
      const resolvedId = data.id;
      const rawContent = data?.templateFiles?.[0]?.content;

      if (typeof rawContent === "string") {
        const parsedContent = JSON.parse(rawContent);
        setTemplateData(parsedContent);
        toast.success("playground loaded successfully");
        return;
      }

      //   load template from api if not in saved content

      const res = await fetch(`/api/template/${resolvedId}`);

      if (!res.ok) throw new Error(`Failed to load template: ${res.status}`);

      const templateRes = await res.json();

      if (templateRes.templateJson && Array.isArray(templateRes.templateJson)) {
        setTemplateData({
          folderName: "Root",
          items: templateRes.templateJson,
        });
      } else {
        setTemplateData(
          templateRes.templateJson || {
            folderName: "Root",
            items: [],
          }
        );
      }
      toast.success("Template loaded successfully");
    } catch (error) {
      console.error("Error loading playground:", error);
      setError("Failed to load playground data");
      toast.error("Failed to load playground data");
    } finally {
      setIsLoading(false);
    }
  }, [idOrRoomId]);



  const saveTemplateData = useCallback(async(data:TemplateFolder)=>{
    const resolvedId = playgroundData?.id ?? idOrRoomId;
    try {
          await SaveUpdatedCode(resolvedId, data);
      setTemplateData(data);
      toast.success("Changes saved successfully");
      return data;
    } catch (error) {
         console.error("Error saving template data:", error);
      toast.error("Failed to save changes");
      throw error;
    }
  },[idOrRoomId, playgroundData?.id])


  useEffect(()=>{
    loadPlayground()
  },[loadPlayground])

    return {
    playgroundData,
    templateData,
    isLoading,
    error,
    accessDenied,
    loadPlayground,
    saveTemplateData,
  };
};
