import type { Server, Socket } from "socket.io";

interface RoomUser {
  socketId: string;
  userId: string | null;
  name: string;
  color: string;
  isGuest: boolean;
  joinedAt: number;
}

interface RoomState {
  users: Map<string, RoomUser>;
  ownerSocketId: string | null;
  previewUrl: string | null;
}

const PRESENCE_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9"];

const rooms = new Map<string, RoomState>();

function randomColor(): string {
  return PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)];
}

function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = { users: new Map(), ownerSocketId: null, previewUrl: null };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastUsers(io: Server, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("room:users", {
    users: Array.from(room.users.values()),
    ownerSocketId: room.ownerSocketId,
  });
}

function promoteNextOwner(io: Server, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const remaining = Array.from(room.users.values()).sort((a, b) => a.joinedAt - b.joinedAt);
  room.ownerSocketId = remaining.length > 0 ? remaining[0].socketId : null;
  if (room.ownerSocketId) {
    io.to(roomId).emit("room:owner-changed", { newOwnerId: room.ownerSocketId });
  }
}

export function registerRoomHandlers(io: Server, socket: Socket) {
  let currentRoomId: string | null = null;

  function leaveCurrentRoom() {
    if (!currentRoomId) return;
    const roomId = currentRoomId;
    const room = rooms.get(roomId);
    currentRoomId = null;
    if (!room) return;

    room.users.delete(socket.id);
    socket.leave(roomId);

    if (room.users.size === 0) {
      rooms.delete(roomId);
      return;
    }

    if (room.ownerSocketId === socket.id) {
      promoteNextOwner(io, roomId);
    }
    broadcastUsers(io, roomId);
  }

  socket.on("room:join", ({ roomId, user }: { roomId: string; user?: Partial<RoomUser> }) => {
    if (!roomId) return;
    if (currentRoomId && currentRoomId !== roomId) leaveCurrentRoom();

    currentRoomId = roomId;
    socket.join(roomId);

    const room = getOrCreateRoom(roomId);
    room.users.set(socket.id, {
      socketId: socket.id,
      userId: user?.userId ?? null,
      name: user?.name || "Guest",
      color: user?.color || randomColor(),
      isGuest: user?.isGuest ?? true,
      joinedAt: Date.now(),
    });

    if (!room.ownerSocketId) {
      room.ownerSocketId = socket.id;
    }

    broadcastUsers(io, roomId);
    if (room.previewUrl) {
      socket.emit("preview:url", { url: room.previewUrl });
    }
  });

  socket.on("room:leave", () => leaveCurrentRoom());

  // Only the room owner's WebContainer is the execution source of truth (F5.1) —
  // input/output/preview events from anyone else are ignored.
  socket.on("terminal:input", ({ roomId, data }: { roomId: string; data: string }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerSocketId !== socket.id) return;
    socket.to(roomId).emit("terminal:input", { data });
  });

  socket.on("terminal:output", ({ roomId, data }: { roomId: string; data: string }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerSocketId !== socket.id) return;
    io.to(roomId).emit("terminal:output", { data });
  });

  socket.on("preview:url", ({ roomId, url }: { roomId: string; url: string }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerSocketId !== socket.id) return;
    room.previewUrl = url;
    io.to(roomId).emit("preview:url", { url });
  });

  // targetUserId identifies a connection (socket.id) within the room roster, not
  // the persisted Mongo User.id — guests in the roster have no Mongo user at all.
  socket.on("user:kick", ({ roomId, targetUserId }: { roomId: string; targetUserId: string }) => {
    const room = rooms.get(roomId);
    if (!room || room.ownerSocketId !== socket.id) return;

    const target = io.sockets.sockets.get(targetUserId);
    room.users.delete(targetUserId);
    if (target) {
      target.emit("room:kicked");
      target.leave(roomId);
      target.disconnect(true);
    }
    broadcastUsers(io, roomId);
  });

  socket.on("disconnect", () => leaveCurrentRoom());
}
