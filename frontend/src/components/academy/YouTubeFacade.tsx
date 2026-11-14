import { useState } from "react";
import { Play } from "lucide-react";
import { embedUrl, thumbnailUrl, watchUrl } from "@/lib/youtube";

/**
 * Click-to-load player (ADR-0005). Until the learner presses play, only a thumbnail is loaded: no
 * YouTube script, cookie or iframe, which keeps lessons fast on mobile data. The referrer policy is
 * deliberately not "no-referrer": YouTube rejects embeds that send none.
 */
export function YouTubeFacade({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const src = embedUrl(videoId);
  const thumb = thumbnailUrl(videoId);
  const watch = watchUrl(videoId);
  if (src === null || thumb === null || watch === null) return null;
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={src}
            title={title}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Play video: ${title}`}
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-90"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg transition group-hover:scale-105">
                <Play className="h-7 w-7" aria-hidden />
              </span>
            </span>
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Video not playing?{" "}
        <a href={watch} target="_blank" rel="noopener noreferrer" className="underline">
          Watch on YouTube
        </a>
        . The transcript below has the same content.
      </p>
    </div>
  );
}
