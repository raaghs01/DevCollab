import { NextRequest } from "next/server";
import * as Y from "yjs";
import { db } from "@/lib/db";
import { buildTemplateFolder } from "@/modules/collaboration/lib/file-tree-sync";

// Called only by the standalone realtime server (server/), never by browsers.
function isAuthorized(request: NextRequest): boolean {
  const secret = request.headers.get("x-internal-secret");
  return !!secret && secret === process.env.REALTIME_SERVER_INTERNAL_SECRET;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 401 });
  }

  const { roomId } = await params;
  const room = await db.room.findUnique({ where: { roomId } });

  if (!room?.yjsState) {
    return new Response(null, { status: 200 });
  }

  return new Response(Buffer.from(room.yjsState), {
    status: 200,
    headers: { "content-type": "application/octet-stream" },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 401 });
  }

  const { roomId } = await params;

  const playground = await db.playground.findUnique({
    where: { roomId },
    include: { templateFiles: true },
  });
  if (!playground) {
    return Response.json({ error: "Unknown room" }, { status: 404 });
  }

  const yjsState = Buffer.from(await request.arrayBuffer());

  await db.room.upsert({
    where: { roomId },
    create: { roomId, playgroundId: playground.id, yjsState },
    update: { yjsState },
  });

  // Also refresh the durable legacy snapshot (TemplateFile.content) from the
  // live Yjs state, not just the y-websocket binary blob. Without this, a
  // room nobody ever hit "Save" on would revert to its original template if
  // Room.yjsState is ever lost (server restart before the next debounced
  // persist, a failed write, etc.) instead of the actual live collaborative
  // state — the two persistence paths would otherwise silently drift apart.
  try {
    let rootFolderName = "Root";
    const existingContent = playground.templateFiles?.[0]?.content;
    if (typeof existingContent === "string") {
      try {
        rootFolderName = JSON.parse(existingContent)?.folderName || "Root";
      } catch {}
    }

    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, yjsState);
    const tree = buildTemplateFolder(tempDoc, rootFolderName);
    tempDoc.destroy();

    // An empty tree means this room's Yjs doc hasn't been seeded with any
    // files yet — don't clobber a real snapshot with nothing.
    if (tree.items.length > 0) {
      await db.templateFile.upsert({
        where: { playgroundId: playground.id },
        create: { playgroundId: playground.id, content: JSON.stringify(tree) },
        update: { content: JSON.stringify(tree) },
      });
    }
  } catch (err) {
    console.error(`Failed to refresh legacy snapshot for room ${roomId}:`, err);
  }

  return Response.json({ success: true }, { status: 200 });
}
