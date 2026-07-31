/**
 * Video URL parsing (Phase 5 · point 23) — turn a pasted URL into a renderable embed descriptor.
 * Supports YouTube (watch / youtu.be / shorts / embed), Vimeo (vimeo.com / player), and direct video
 * files (MP4/WebM/MOV/OGG, incl. Cloudinary). Pure + isomorphic; used by the <VideoEmbed> component.
 */
export type VideoKind = "youtube" | "vimeo" | "file" | "none";
export interface ParsedVideo { kind: VideoKind; id?: string; embedUrl?: string; src?: string }

const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/i;
const FILE = /\.(mp4|webm|mov|ogg)(\?|$)/i;

export function parseVideo(url: string | null | undefined): ParsedVideo {
  const u = (url ?? "").trim();
  if (!u) return { kind: "none" };
  const yt = u.match(YT);
  if (yt) return { kind: "youtube", id: yt[1], embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vm = u.match(VIMEO);
  if (vm) return { kind: "vimeo", id: vm[1], embedUrl: `https://player.vimeo.com/video/${vm[1]}` };
  if (/^https?:\/\//.test(u) && FILE.test(u)) return { kind: "file", src: u };
  return { kind: "none" };
}

/** Is this URL something <VideoEmbed> can render? */
export const isVideoUrl = (url: string | null | undefined): boolean => parseVideo(url).kind !== "none";
