"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface RoomUser {
  socketId: string;
  userId: string | null;
  name: string;
  color: string;
  isGuest: boolean;
  joinedAt: number;
}

export interface RoomIdentity {
  name: string;
  color: string;
  userId: string | null;
}

interface UseRoomSocketResult {
  socket: Socket | null;
  users: RoomUser[];
  ownerSocketId: string | null;
  isOwner: boolean;
  wasKicked: boolean;
  kickUser: (targetSocketId: string) => void;
}

// Connects to the standalone realtime server's Socket.io namespace for room
// membership, presence, and owner tracking (F4.5, F5.1, F8.6). Separate from
// the y-websocket connection in useYjsRoom, which only carries CRDT sync.
export function useRoomSocket(roomId: string | null, identity: RoomIdentity): UseRoomSocketResult {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [ownerSocketId, setOwnerSocketId] = useState<string | null>(null);
  const [wasKicked, setWasKicked] = useState(false);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    if (!roomId) return;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
    const s = io(socketUrl, { path: "/socket.io" });

    const join = () => {
      s.emit("room:join", {
        roomId,
        user: { ...identityRef.current, isGuest: !identityRef.current.userId },
      });
    };

    s.on("connect", () => {
      setSocketId(s.id ?? null);
      join();
    });

    s.on("room:users", ({ users: roster, ownerSocketId: owner }: { users: RoomUser[]; ownerSocketId: string | null }) => {
      setUsers(roster);
      setOwnerSocketId(owner);
    });

    s.on("room:owner-changed", ({ newOwnerId }: { newOwnerId: string }) => {
      setOwnerSocketId(newOwnerId);
    });

    s.on("room:kicked", () => {
      setWasKicked(true);
    });

    setSocket(s);

    return () => {
      s.emit("room:leave", { roomId });
      s.disconnect();
      setSocket(null);
      setSocketId(null);
      setUsers([]);
      setOwnerSocketId(null);
    };
  }, [roomId]);

  const kickUser = (targetSocketId: string) => {
    if (!socket || !roomId) return;
    socket.emit("user:kick", { roomId, targetUserId: targetSocketId });
  };

  return {
    socket,
    users,
    ownerSocketId,
    isOwner: !!socketId && socketId === ownerSocketId,
    wasKicked,
    kickUser,
  };
}
