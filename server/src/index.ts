import http from "http";
import { WebSocketServer } from "ws";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config";
import { setupWSConnection } from "./yjs/websocket";
import { registerRoomHandlers } from "./socket/rooms";

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// Yjs CRDT sync lives on its own path via plain `ws`, kept separate from
// Socket.io per PRD §9.3 (document sync is not a Socket.io concern).
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (conn, req) => {
  const url = new URL(req.url || "/", "http://localhost");
  const roomName = decodeURIComponent(url.pathname.replace(/^\/yjs\/?/, "")) || "default";
  setupWSConnection(conn, req, roomName);
});

httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url || "/", "http://localhost");
  if (pathname.startsWith("/yjs")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  }
  // Any other path (e.g. /socket.io) is left alone — Socket.io registers its
  // own 'upgrade' listener below and ignores paths that aren't its own.
});

const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  cors: { origin: config.corsOrigin, credentials: true },
});

io.on("connection", (socket) => {
  registerRoomHandlers(io, socket);
});

httpServer.listen(config.port, () => {
  console.log(
    `[devcollab-realtime] listening on :${config.port} (yjs: /yjs/:roomId, socket.io: /socket.io)`
  );
});
