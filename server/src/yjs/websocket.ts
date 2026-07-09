import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { getYDoc, WSSharedDoc, closeConn, send } from "./doc";
import { SlidingWindowRateLimiter } from "./rate-limiter";
import { config } from "../config";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PING_TIMEOUT_MS = 30000;

function messageListener(conn: WebSocket, doc: WSSharedDoc, message: Uint8Array) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC:
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
        break;
    }
  } catch (err) {
    console.error("[yjs] failed to handle message", err);
  }
}

export async function setupWSConnection(conn: WebSocket, _req: IncomingMessage, roomName: string) {
  conn.binaryType = "arraybuffer";

  // getYDoc() below awaits an HTTP fetch to load persisted state, which takes
  // real time. A client can send messages the instant its own socket reports
  // "open" — attaching the message listener only after that await would lose
  // anything sent in that gap, since Node's EventEmitter doesn't buffer
  // events for listeners that attach late. Registering synchronously here
  // and queuing until the doc is ready closes that window.
  const rateLimiter = new SlidingWindowRateLimiter(config.yjsRateLimitPerSecond, 1000);
  let droppedSinceLastWarning = 0;
  const pendingMessages: Uint8Array[] = [];
  let doc: WSSharedDoc | null = null;

  conn.on("message", (message: ArrayBuffer) => {
    if (!rateLimiter.tryConsume()) {
      droppedSinceLastWarning++;
      if (droppedSinceLastWarning === 1 || droppedSinceLastWarning % 100 === 0) {
        console.warn(
          `[yjs] rate limit exceeded for a connection in room "${roomName}" — ${droppedSinceLastWarning} message(s) dropped so far`
        );
      }
      return;
    }
    const bytes = new Uint8Array(message);
    if (doc) {
      messageListener(conn, doc, bytes);
    } else {
      pendingMessages.push(bytes);
    }
  });

  doc = await getYDoc(roomName);
  doc.conns.set(conn, new Set());
  for (const bytes of pendingMessages) {
    messageListener(conn, doc, bytes);
  }
  pendingMessages.length = 0;

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) closeConn(doc, conn);
      clearInterval(pingInterval);
      return;
    }
    if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT_MS);

  conn.on("close", () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  // Send sync step 1 (our state vector) so the client can compute and send back
  // only the updates we're missing, then send the current awareness snapshot.
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, doc);
  send(doc, conn, encoding.toUint8Array(syncEncoder));

  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
    );
    send(doc, conn, encoding.toUint8Array(awarenessEncoder));
  }
}
