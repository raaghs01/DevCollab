import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import type { WebSocket } from "ws";
import { loadRoomState, persistRoomState } from "../lib/persistence";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PERSIST_DEBOUNCE_MS = 5000;

export class WSSharedDoc extends Y.Doc {
  name: string;
  conns: Map<WebSocket, Set<number>>;
  awareness: awarenessProtocol.Awareness;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: WebSocket | null) => {
        const changedClients = added.concat(updated, removed);

        // Track which awareness client IDs belong to which connection, so we can
        // clear them out cleanly when that connection closes.
        if (origin !== null) {
          const connControlledIds = this.conns.get(origin);
          if (connControlledIds) {
            added.forEach((id) => connControlledIds.add(id));
            removed.forEach((id) => connControlledIds.delete(id));
          }
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
        const message = encoding.toUint8Array(encoder);
        this.conns.forEach((_, conn) => send(this, conn, message));
      }
    );

    this.on("update", (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => send(this, conn, message));
      this.schedulePersist();
    });
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      persistRoomState(this.name, Buffer.from(Y.encodeStateAsUpdate(this))).catch((err) =>
        console.error(`[yjs] persist failed for room ${this.name}`, err)
      );
    }, PERSIST_DEBOUNCE_MS);
  }
}

const docs = new Map<string, WSSharedDoc>();

export async function getYDoc(roomName: string): Promise<WSSharedDoc> {
  const existing = docs.get(roomName);
  if (existing) return existing;

  const doc = new WSSharedDoc(roomName);
  const persisted = await loadRoomState(roomName);
  if (persisted && persisted.byteLength > 0) {
    Y.applyUpdate(doc, persisted);
  }
  docs.set(roomName, doc);
  return doc;
}

export function send(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array) {
  if (conn.readyState !== conn.OPEN && conn.readyState !== conn.CONNECTING) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err?: Error) => {
      if (err) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
}

export function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn)!;
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    if (doc.conns.size === 0) {
      persistRoomState(doc.name, Buffer.from(Y.encodeStateAsUpdate(doc))).catch(() => {});
    }
  }
  try {
    conn.close();
  } catch {
    // already closed
  }
}
