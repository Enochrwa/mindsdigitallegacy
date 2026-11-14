/**
 * YouTube helpers for the lesson player (ADR-0005). The id comes from our API, but it is validated
 * again here so a bad value can never become part of a URL.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

export const isYouTubeId = (value: string): boolean => ID.test(value);

/** Privacy-enhanced embed host: no tracking cookie until the learner presses play. */
export function embedUrl(id: string): string | null {
  return isYouTubeId(id)
    ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`
    : null;
}

export function thumbnailUrl(id: string): string | null {
  return isYouTubeId(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function watchUrl(id: string): string | null {
  return isYouTubeId(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}
