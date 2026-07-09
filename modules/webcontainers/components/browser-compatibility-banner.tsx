"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompatibilityStatus {
  supported: boolean;
  reason: string | null;
}

// WebContainers only run in Chromium-based browsers, and only inside a
// cross-origin-isolated page (see next.config.ts's COOP/COEP headers).
// Editing and collaboration still work everywhere — only code execution,
// the terminal, and the live preview depend on this — so this is an
// informational, dismissible banner, not a hard block.
function detectCompatibility(): CompatibilityStatus {
  if (typeof window === "undefined") return { supported: true, reason: null };

  const ua = navigator.userAgent;
  const isFirefox = /Firefox\//.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios|edg|opr|brave).)*safari/i.test(ua);

  if (isFirefox || isSafari) {
    return {
      supported: false,
      reason: `${isFirefox ? "Firefox" : "Safari"} doesn't support WebContainers, so code execution, the terminal, and the live preview won't work here. Editing and collaboration still work — for a running preview, use Chrome, Edge, or Brave.`,
    };
  }

  if (!window.crossOriginIsolated) {
    return {
      supported: false,
      reason: "This page isn't cross-origin isolated, which WebContainers require. Code execution and the live preview won't work.",
    };
  }

  return { supported: true, reason: null };
}

export function BrowserCompatibilityBanner() {
  const [status, setStatus] = useState<CompatibilityStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStatus(detectCompatibility());
  }, []);

  if (!status || status.supported || dismissed) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-sm px-4 py-2 border-b border-amber-300 dark:border-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{status.reason}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
