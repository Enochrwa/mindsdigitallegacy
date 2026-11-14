import { describe, expect, it } from "vitest";
import { embedUrl, isYouTubeId, thumbnailUrl, watchUrl } from "./youtube";

describe("youtube helpers", () => {
  it("accepts only 11-character ids", () => {
    expect(isYouTubeId("dQw4w9WgXcQ")).toBe(true);
    for (const bad of ["", "short", "dQw4w9WgXcQ1", 'dQw4w9WgXc"', "dQw4w9WgX/Q", "../etc/pass"]) {
      expect(isYouTubeId(bad)).toBe(false);
      expect(embedUrl(bad)).toBeNull();
      expect(thumbnailUrl(bad)).toBeNull();
      expect(watchUrl(bad)).toBeNull();
    }
  });

  it("uses the no-cookie embed host and the ytimg thumbnail host", () => {
    expect(embedUrl("dQw4w9WgXcQ")).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/,
    );
    expect(thumbnailUrl("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });
});
