import { parseVideo } from "@/lib/videoEmbed";

/**
 * Storefront video (Phase 5 · point 23) — renders a pasted URL as the right embed: a self-hosted /
 * Cloudinary file plays inline via <video>; YouTube & Vimeo render in a lazy 16:9 responsive iframe.
 * An unrecognised URL renders nothing (never a broken frame). Server component — no client JS.
 */
export function VideoEmbed({ url, title, className, autoPlay = false }: { url: string; title?: string; className?: string; autoPlay?: boolean }) {
  const v = parseVideo(url);
  if (v.kind === "none") return null;
  const cls = `video-embed${className ? ` ${className}` : ""}`;

  if (v.kind === "file") {
    return (
      <div className={cls}>
        <video src={v.src} controls playsInline muted={autoPlay} autoPlay={autoPlay} loop={autoPlay} preload="metadata" />
      </div>
    );
  }
  return (
    <div className={`${cls} video-embed--frame`}>
      <iframe
        src={v.embedUrl}
        title={title || "Video"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
