"use server";

import { db } from "@/lib/db";
import { TemplateFolder } from "../lib/path-to-json";
import { currentUser } from "@/modules/auth/actions";





// Accepts either a Playground's own id or its shareable roomId (F8.4), so
// `/playground/{roomId}` links work the same as the dashboard's own
// `/playground/{id}` links. Enforces F8.5: only the owner or, for a shared
// (isPublic) room, anyone (including unauthenticated guests, F8.3) may view
// it — a private room returns { accessDenied: true } instead of its data.
export const getPlaygroundById = async(idOrRoomId:string)=>{
    try {
        const user = await currentUser();

        const playground = await db.playground.findFirst({
            where:{ OR: [{ id: idOrRoomId }, { roomId: idOrRoomId }] },
            select:{
                id:true,
                title:true,
                roomId:true,
                isPublic:true,
                userId:true,
                templateFiles:{
                    select:{
                        content:true
                    }
                }
            }
        })

        if (!playground) return null;

        const isOwner = user?.id === playground.userId;
        if (!isOwner && !playground.isPublic) {
            return { accessDenied: true as const };
        }

        return { ...playground, isOwner };
    } catch (error) {
        console.log(error)
    }
}

// Owner-only (F8.5): flips a playground between private (only the owner can
// access it) and shared (anyone with the link can join, per F8.4/F8.3).
export const toggleRoomVisibility = async (playgroundId: string, isPublic: boolean) => {
    const user = await currentUser();
    if (!user) return null;

    try {
        const playground = await db.playground.findUnique({
            where: { id: playgroundId },
            select: { userId: true },
        });
        if (!playground || playground.userId !== user.id) return null;

        return await db.playground.update({
            where: { id: playgroundId },
            data: { isPublic },
            select: { id: true, isPublic: true },
        });
    } catch (error) {
        console.log("toggleRoomVisibility error:", error);
        return null;
    }
};

export const SaveUpdatedCode = async(playgroundId:string , data:TemplateFolder)=>{
    const user = await currentUser();
  if (!user) return null;

  try {
    const updatedPlayground = await db.templateFile.upsert({
        where:{
            playgroundId
        },
        update:{
            content:JSON.stringify(data)
        },
        create:{
            playgroundId,
            content:JSON.stringify(data)
        }
    })

    return updatedPlayground;
  } catch (error) {
     console.log("SaveUpdatedCode error:", error);
    return null;
  }
}