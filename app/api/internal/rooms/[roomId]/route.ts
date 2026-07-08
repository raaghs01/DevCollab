import { NextRequest } from "next/server";
import { db } from "@/lib/db";

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

  const playground = await db.playground.findUnique({ where: { roomId } });
  if (!playground) {
    return Response.json({ error: "Unknown room" }, { status: 404 });
  }

  const yjsState = Buffer.from(await request.arrayBuffer());

  await db.room.upsert({
    where: { roomId },
    create: { roomId, playgroundId: playground.id, yjsState },
    update: { yjsState },
  });

  return Response.json({ success: true }, { status: 200 });
}
