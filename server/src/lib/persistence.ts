import { config } from "../config";

const roomEndpoint = (roomId: string) =>
  `${config.nextInternalApiUrl}/api/internal/rooms/${encodeURIComponent(roomId)}`;

export async function loadRoomState(roomId: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(roomEndpoint(roomId), {
      headers: { "x-internal-secret": config.internalSecret },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 0 ? new Uint8Array(buf) : null;
  } catch (err) {
    console.error(`[persistence] failed to load room ${roomId}`, err);
    return null;
  }
}

export async function persistRoomState(roomId: string, state: Buffer): Promise<void> {
  try {
    const res = await fetch(roomEndpoint(roomId), {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-internal-secret": config.internalSecret,
      },
      body: state,
    });
    if (!res.ok) {
      console.error(`[persistence] save rejected for room ${roomId}: ${res.status}`);
    }
  } catch (err) {
    console.error(`[persistence] failed to save room ${roomId}`, err);
  }
}
