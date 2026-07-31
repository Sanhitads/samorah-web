import { describe, it, expect } from "vitest";
import { parseVideo, isVideoUrl } from "./videoEmbed";

describe("parseVideo (Phase 5 · point 23)", () => {
  it("parses YouTube in all its forms → nocookie embed", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ",
    ]) {
      const v = parseVideo(u);
      expect(v.kind).toBe("youtube");
      expect(v.id).toBe("dQw4w9WgXcQ");
      expect(v.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });
  it("parses Vimeo → player embed", () => {
    expect(parseVideo("https://vimeo.com/123456789")).toMatchObject({ kind: "vimeo", id: "123456789", embedUrl: "https://player.vimeo.com/video/123456789" });
    expect(parseVideo("https://player.vimeo.com/video/123456789")).toMatchObject({ kind: "vimeo", id: "123456789" });
  });
  it("parses direct video files (incl. Cloudinary + query strings)", () => {
    expect(parseVideo("https://res.cloudinary.com/x/video/upload/v1/a.mp4")).toMatchObject({ kind: "file", src: "https://res.cloudinary.com/x/video/upload/v1/a.mp4" });
    expect(parseVideo("https://cdn.example.com/clip.webm?token=1")).toMatchObject({ kind: "file" });
  });
  it("returns 'none' for unrecognised / empty", () => {
    expect(parseVideo("https://example.com/page").kind).toBe("none");
    expect(parseVideo("").kind).toBe("none");
    expect(parseVideo(null).kind).toBe("none");
    expect(isVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isVideoUrl("gradient:grad-chai")).toBe(false);
  });
});
