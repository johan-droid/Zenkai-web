"use client";

import { Keyboard } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Space", "K"], action: "Play / pause" },
  { keys: ["←", "→"], action: "Seek 5 seconds" },
  { keys: ["J", "L"], action: "Seek 10 seconds" },
  { keys: ["↑", "↓"], action: "Volume" },
  { keys: ["M"], action: "Mute" },
  { keys: ["F"], action: "Fullscreen" },
  { keys: ["T"], action: "Theater mode" },
  { keys: ["N"], action: "Next episode" },
];

/**
 * Keyboard shortcuts for the player.
 *
 * `t` toggles theater mode, `n` advances to the next episode. Vidstack already
 * handles Space/K (play/pause), arrows (seek), M (mute), F (fullscreen) in its
 * own control layout, so those are covered there.
 */
export function PlayerHotkeys({
  onTheater,
  onNext,
}: {
  onTheater: () => void;
  onNext: () => void;
}) {
  const router = useRouter();

  useHotkeys("t", () => {
    onTheater();
  }, { preventDefault: true });
  useHotkeys("n", () => {
    onNext();
  }, { preventDefault: true });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="glass" aria-label="Keyboard shortcuts">
          <Keyboard />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Vidstack handles the core keys; these are the extras.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.action} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{shortcut.action}</span>
              <span className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-glass-border bg-black/20 px-2 py-0.5 text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
