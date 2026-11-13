# ADR-0005: Deliver training through YouTube embeds and treat gating as a growth mechanic

- Status: Accepted
- Date: 2026-11-13

## Context

Founders want all videos on a YouTube account, embedded professionally in the site. YouTube help states that
privacy-enhanced mode uses `youtube-nocookie.com`, that the API terms require an HTTP referrer (playback is
blocked with error 153 without one), that age-restricted videos cannot play on third-party sites, and that
owners can disable embedding. It does not document unlisted or private video behaviour in embeds.
YouTube provides no signed URLs, so a video ID, once seen, can be shared.

## Decision

1. Store `youtubeVideoId` per lesson in MongoDB. Do not depend on the YouTube Data API for rendering.
2. Use **unlisted** videos plus the API gate: video IDs are returned only to an enrolled, unlocked learner.
3. Render a **facade** (thumbnail and play button). The iframe loads on tap, which saves data on slow
   connections. Use `youtube-nocookie.com`.
4. CSP allows `frame-src https://www.youtube-nocookie.com` and `img-src https://i.ytimg.com`. The referrer
   policy is `strict-origin-when-cross-origin`; never `no-referrer` on lesson pages.
5. Accept that determined users can copy a video ID. The gate protects the **growth loop**, not the content.
6. Before the first test with real videos, verify that unlisted embeds play on the production domain.

## Consequences

- Paid or exclusive content later needs a host with signed URLs (Bunny Stream, Cloudflare Stream or Mux),
  chosen when that need is real.
- Lesson pages need transcripts and captions for accessibility and for users on weak connections.
