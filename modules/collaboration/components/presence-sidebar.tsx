"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, EyeOff, UserX, Users } from "lucide-react";
import type { Awareness } from "y-protocols/awareness";
import type { RoomUser } from "../hooks/useRoomSocket";

interface AwarenessUserState {
  user?: { userId?: string | null; name?: string; color?: string };
  currentFile?: string;
}

interface PresenceSidebarProps {
  users: RoomUser[];
  ownerSocketId: string | null;
  currentSocketId: string | null;
  isOwner: boolean;
  awareness: Awareness | null;
  followingClientId: number | null;
  onToggleFollow: (clientId: number) => void;
  onKick: (socketId: string) => void;
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

// Presence roster (F4.5) sourced from the Socket.io room, which already
// tracks join/leave/owner semantics needed for the "Owner" badge and kick
// button. Follow mode (F4.6) operates on Yjs awareness client IDs instead of
// socket IDs, so entries are cross-referenced by userId to find the right one.
export function PresenceSidebar({
  users,
  ownerSocketId,
  currentSocketId,
  isOwner,
  awareness,
  followingClientId,
  onToggleFollow,
  onKick,
}: PresenceSidebarProps) {
  if (users.length === 0) return null;

  const clientIdByUserId = new Map<string, number>();
  if (awareness) {
    awareness.getStates().forEach((state, clientId) => {
      const userId = (state as AwarenessUserState)?.user?.userId;
      if (userId) clientIdByUserId.set(userId, clientId);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <div className="flex -space-x-2">
            {users.slice(0, 4).map((u) => (
              <Avatar key={u.socketId} className="h-6 w-6 border-2 border-background">
                <AvatarFallback style={{ backgroundColor: u.color }} className="text-[10px] text-white">
                  {initials(u.name)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{users.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Users className="h-4 w-4" /> In this room
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users.map((u) => {
          const isSelf = u.socketId === currentSocketId;
          const isRoomOwner = u.socketId === ownerSocketId;
          const clientId = u.userId ? clientIdByUserId.get(u.userId) : undefined;
          const isFollowing = clientId !== undefined && clientId === followingClientId;

          return (
            <div key={u.socketId} className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="h-6 w-6">
                <AvatarFallback style={{ backgroundColor: u.color }} className="text-[10px] text-white">
                  {initials(u.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  {u.name} {isSelf && <span className="text-muted-foreground">(you)</span>}
                </p>
                {isRoomOwner && (
                  <Badge variant="secondary" className="text-[10px]">
                    Owner
                  </Badge>
                )}
              </div>
              {!isSelf && clientId !== undefined && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => onToggleFollow(clientId)}
                    >
                      {isFollowing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isFollowing ? "Stop following" : "Follow"}</TooltipContent>
                </Tooltip>
              )}
              {!isSelf && isOwner && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => onKick(u.socketId)}
                    >
                      <UserX className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove from room</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
