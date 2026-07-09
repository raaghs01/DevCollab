"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { Terminal as TerminalIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OwnerTerminalFeedProps {
  socket: Socket | null;
}

const MAX_LINES = 500;

// Read-only view of the room owner's terminal output (F5.2). Deliberately not
// a full xterm instance — each user already runs their own independent
// WebContainer + terminal (see PRD open question 2 / the "each user runs
// their own WebContainer" alternative, which is what's actually built here).
// This is a lightweight spectator feed on top of that, not a shared terminal.
export function OwnerTerminalFeed({ socket }: OwnerTerminalFeedProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const bufferRef = useRef("");
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleOutput = ({ data }: { data: string }) => {
      bufferRef.current += data;
      const parts = bufferRef.current.split(/\r?\n/);
      bufferRef.current = parts.pop() ?? "";
      if (parts.length === 0) return;
      setLines((prev) => [...prev, ...parts].slice(-MAX_LINES));
    };

    socket.on("terminal:output", handleOutput);
    return () => {
      socket.off("terminal:output", handleOutput);
    };
  }, [socket]);

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, collapsed]);

  if (lines.length === 0) return null;

  return (
    <div className="border-t bg-muted/30">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
        onClick={() => setCollapsed((c) => !c)}
      >
        <TerminalIcon className="h-3 w-3" />
        <span>Owner's terminal (read-only)</span>
        {collapsed ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {!collapsed && (
        <pre
          ref={scrollRef}
          className="h-40 overflow-y-auto bg-black text-green-400 text-xs p-2 font-mono whitespace-pre-wrap"
        >
          {lines.join("\n")}
        </pre>
      )}
    </div>
  );
}
