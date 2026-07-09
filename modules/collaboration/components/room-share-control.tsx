"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { toggleRoomVisibility } from "@/modules/playground/actions";

interface RoomShareControlProps {
  playgroundId: string;
  roomId: string;
  isPublic: boolean;
  isOwner: boolean;
  onVisibilityChange: (isPublic: boolean) => void;
}

// F8.4 (shareable /playground/{roomId} links) + F8.5 (private/shared toggle,
// owner only). Visibility enforcement itself lives in getPlaygroundById —
// this is just the UI for reading/flipping that flag.
export function RoomShareControl({
  playgroundId,
  roomId,
  isPublic,
  isOwner,
  onVisibilityChange,
}: RoomShareControlProps) {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/playground/${roomId}` : `/playground/${roomId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const handleToggle = async (checked: boolean) => {
    setUpdating(true);
    const result = await toggleRoomVisibility(playgroundId, checked);
    setUpdating(false);
    if (result) {
      onVisibilityChange(result.isPublic);
      toast.success(checked ? "Room is now shared" : "Room is now private");
    } else {
      toast.error("Failed to update room visibility");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this playground</DialogTitle>
          <DialogDescription>
            Anyone with this link can join and edit collaboratively if the room is shared.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input readOnly value={shareUrl} className="text-xs" />
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        {isOwner && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="room-visibility" className="text-sm font-medium">
                {isPublic ? "Shared" : "Private"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isPublic
                  ? "Anyone with the link can view and edit, including guests."
                  : "Only you can access this playground."}
              </p>
            </div>
            <Switch
              id="room-visibility"
              checked={isPublic}
              disabled={updating}
              onCheckedChange={handleToggle}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
