"use client";

import { useEffect } from "react";
import type { Awareness } from "y-protocols/awareness";

const STYLE_ELEMENT_ID = "yjs-remote-cursor-styles";

interface AwarenessUser {
  name?: string;
  color?: string;
}

// y-monaco renders remote selections/cursors as `.yRemoteSelection-<clientId>` /
// `.yRemoteSelectionHead-<clientId>` decoration classes but intentionally leaves
// styling to the consumer. This mounts one global <style> tag and keeps it in
// sync with awareness so each collaborator gets their assigned color + name label.
export function RemoteCursorStyles({ awareness }: { awareness: Awareness | null }) {
  useEffect(() => {
    if (!awareness) return;

    let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ELEMENT_ID;
      document.head.appendChild(styleEl);
    }

    const render = () => {
      const rules: string[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.doc.clientID) return;
        const user = state.user as AwarenessUser | undefined;
        if (!user?.color) return;
        const name = (user.name || "Guest").replace(/"/g, '\\"');
        rules.push(`
          .yRemoteSelection-${clientId} { background-color: ${user.color}33; }
          .yRemoteSelectionHead-${clientId} {
            position: relative;
            border-left: 2px solid ${user.color};
          }
          .yRemoteSelectionHead-${clientId}::after {
            content: "${name}";
            position: absolute;
            top: -1.1em;
            left: -2px;
            font-size: 11px;
            font-family: sans-serif;
            line-height: 1.4;
            white-space: nowrap;
            background-color: ${user.color};
            color: #fff;
            padding: 0 4px;
            border-radius: 2px;
            pointer-events: none;
            z-index: 20;
          }
        `);
      });
      styleEl!.textContent = rules.join("\n");
    };

    render();
    awareness.on("change", render);
    return () => {
      awareness.off("change", render);
    };
  }, [awareness]);

  return null;
}
