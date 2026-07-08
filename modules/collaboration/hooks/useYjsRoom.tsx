"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface CollaboratorIdentity {
  name: string;
  color: string;
  userId?: string | null;
}

interface YjsRoom {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

interface UseYjsRoomResult {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  awareness: WebsocketProvider["awareness"] | null;
  status: ConnectionStatus;
}

// One Y.Doc + WebsocketProvider per room. `roomId` must be Playground.roomId
// (the shareable collab identifier), not Playground.id — the realtime server's
// persistence callback looks rooms up by roomId.
export function useYjsRoom(roomId: string | null, identity: CollaboratorIdentity): UseYjsRoomResult {
  const [room, setRoom] = useState<YjsRoom | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      return;
    }

    const wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/yjs";
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(wsBaseUrl, roomId, ydoc);

    const handleStatus = (event: { status: ConnectionStatus }) => setStatus(event.status);
    provider.on("status", handleStatus);

    setStatus("connecting");
    setRoom({ ydoc, provider });

    return () => {
      provider.off("status", handleStatus);
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomId]);

  useEffect(() => {
    room?.provider.awareness.setLocalStateField("user", {
      name: identity.name,
      color: identity.color,
      userId: identity.userId ?? null,
    });
  }, [room, identity.name, identity.color, identity.userId]);

  return {
    ydoc: room?.ydoc ?? null,
    provider: room?.provider ?? null,
    awareness: room?.provider.awareness ?? null,
    status: room ? status : "disconnected",
  };
}
