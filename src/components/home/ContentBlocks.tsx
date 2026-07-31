import Link from "next/link";
import { RichText } from "@/components/ui/RichText";
import { VideoEmbed } from "@/components/ui/VideoEmbed";
import { gradientClass, isGradientPlaceholder, isColorValue } from "@/lib/product";

/**
 * Editorial content section (Phase 4 · points 16/17/18) — renders a flexible, reorderable sequence of
 * typed blocks: heading, paragraph (sanitised rich text), quote, image, and button. The block order is
 * the author's; each `_type` maps to its element. Purely presentational + framework-agnostic.
 */
type Block = { _type?: string;[k: string]: unknown };
const s = (v: unknown) => (v == null ? "" : String(v));

function ImageBlock({ src, alt, focal }: { src: string; alt: string; focal?: string }) {
  if (isColorValue(src)) return <div className="home-content__img" style={{ background: src }} role="img" aria-label={alt} />;
  if (isGradientPlaceholder(src)) return <div className={`home-content__img ${gradientClass(src) ?? ""}`} role="img" aria-label={alt} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="home-content__img home-content__img--photo" src={src} alt={alt} loading="lazy" style={focal ? { objectPosition: focal } : undefined} />;
}

export function ContentBlocks({ eyebrow, blocks, align }: { eyebrow?: string; blocks: Block[]; align?: string }) {
  const items = (blocks ?? []).filter(Boolean);
  if (!items.length) return null;
  return (
    <section className="home-content" data-align={align || "left"}>
      <div className="home-content__inner">
        {eyebrow ? <p className="home-content__eyebrow">{eyebrow}</p> : null}
        {items.map((b, i) => {
          switch (b._type) {
            case "heading":
              return b.level === "h3"
                ? <h3 key={i} className="home-content__h3">{s(b.text)}</h3>
                : <h2 key={i} className="home-content__h2">{s(b.text)}</h2>;
            case "paragraph":
              return <RichText key={i} className="home-content__para" html={s(b.html)} />;
            case "quote":
              return (
                <blockquote key={i} className="home-content__quote">
                  <p>{s(b.quote)}</p>
                  {b.attribution ? <cite>— {s(b.attribution)}</cite> : null}
                </blockquote>
              );
            case "image": {
              const src = s(b.image);
              if (!src) return null;
              return (
                <figure key={i} className="home-content__figure">
                  <ImageBlock src={src} alt={s(b.alt)} focal={s(b.image__focal) || undefined} />
                  {b.caption ? <figcaption>{s(b.caption)}</figcaption> : null}
                </figure>
              );
            }
            case "video": {
              const url = s(b.url);
              if (!url) return null;
              return (
                <figure key={i} className="home-content__figure">
                  <VideoEmbed url={url} className="home-content__video" />
                  {b.caption ? <figcaption>{s(b.caption)}</figcaption> : null}
                </figure>
              );
            }
            case "cta":
              return s(b.label) ? <div key={i} className="home-content__cta"><Link href={s(b.href) || "#"} className="btn btn-outline">{s(b.label)}</Link></div> : null;
            default:
              return null;
          }
        })}
      </div>
    </section>
  );
}
