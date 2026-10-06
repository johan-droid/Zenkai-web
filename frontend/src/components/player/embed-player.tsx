"use client";

import { useState } from "react";

import type { PlaybackExecution } from "@/lib/api/zenkai";

/**
 * Embed playback (P6/P8): an embed is a framed page, never a media source.
 *
 * The URL comes from the canonical execution — the client never fetches it as
 * video, never attaches player chrome, and never inspects the cross-origin
 * frame's contents. Loading is tracked with the frame's own `load` event, the
 * only signal the browser reliably offers for a cross-origin iframe.
 */
export function EmbedPlayer({
  execution,
}: {
  execution: PlaybackExecution & { kind: "embed" };
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {!loaded ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <p className="animate-pulse text-sm text-muted-foreground">Loading embed...</p>
        </div>
      ) : null}
      <iframe
        src={execution.url}
        title="Episode embed"
        className="absolute inset-0 h-full w-full"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
