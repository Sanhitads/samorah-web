import { AssetImage } from "@/components/ui/AssetImage";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { groupBody } from "@/lib/cms/pageContent";
import type { Asset } from "@/platform/asset";
import type { PageSection, SectionImage, SectionLayout, SectionRatio, SectionVariant } from "@/services/cmsService";

/**
 * Product Care — the premium editorial renderer (Trudon / Santa Maria Novella rhythm: generous
 * whitespace, alternating image/text, large photography, short paragraphs). It reuses the platform
 * image atom (AssetImage → responsive Cloudinary srcSet + blur-up LQIP + CLS-safe aspect-ratio) and
 * the existing FAQ accordion — no new CMS or image system. One flat section list drives everything;
 * the section's shape decides how it renders:
 *   • items[]           → an accordion (heading + optional lede + Q&A)
 *   • layout "overlay"  → an image break with centred overlay text
 *   • image + layout    → an editorial block (left / right / center / wide)
 *   • heading, no body  → a movement divider
 *   • body, no heading  → a quiet closing statement
 * Hidden sections are filtered out. Pure server component.
 */

const RATIO: Record<SectionRatio, string> = { square: "1 / 1", portrait: "4 / 5", landscape: "3 / 2" };
const SIZES: Partial<Record<SectionLayout, string>> = {
  wide: "(max-width: 1180px) 100vw, 1180px",
  left: "(max-width: 860px) 100vw, 46vw",
  right: "(max-width: 860px) 100vw, 46vw",
  center: "(max-width: 860px) 100vw, 760px",
};

function parseFocal(focal?: string): { x: number; y: number } | undefined {
  const m = focal?.match(/([\d.]+)%\s+([\d.]+)%/);
  if (!m) return undefined;
  const clamp = (n: number) => Math.min(1, Math.max(0, n / 100));
  return { x: clamp(parseFloat(m[1])), y: clamp(parseFloat(m[2])) };
}

/** Build a first-class Asset from the stored image so AssetImage generates responsive sources. */
function toAsset(img: SectionImage, ratio: SectionRatio): Asset {
  const alt = (img.alt ?? "").trim();
  return {
    id: img.mediaId || img.url,
    kind: "image",
    desktop: img.url,
    role: "lifestyle",
    alt,
    aspectRatio: RATIO[ratio],
    focalPoint: parseFocal(img.focal),
    decorative: !alt,
  };
}

const cleanBody = (body?: string[]) => (body ?? []).map((b) => (b ?? "").trim()).filter(Boolean);

/** Paragraphs + bullet lists (consecutive "- " lines) — the shared grouper. */
function Body({ body }: { body?: string[] }) {
  const clean = cleanBody(body);
  if (!clean.length) return null;
  return (
    <>
      {groupBody(clean).map((block, j) =>
        block.type === "list" ? (
          <ul key={j} className="pcare__list">{block.items.map((x, k) => <li key={k}>{x}</li>)}</ul>
        ) : (
          <p key={j} className="pcare__p">{block.text}</p>
        ),
      )}
    </>
  );
}

function TextBlock({ s }: { s: PageSection }) {
  return (
    <div className="pcare__text">
      {s.step ? <span className="pcare__step" aria-hidden="true">{s.step}</span> : null}
      {s.label ? <p className="pcare__eyebrow">{s.label}</p> : null}
      {s.heading ? <h2 className="pcare__title">{s.heading}</h2> : null}
      <Body body={s.body} />
    </div>
  );
}

function Figure({ img, ratio, sizes }: { img: SectionImage; ratio: SectionRatio; sizes: string }) {
  return (
    <figure className="pcare__figure">
      <div className="pcare__media" style={{ aspectRatio: RATIO[ratio] }}>
        <AssetImage asset={toAsset(img, ratio)} sizes={sizes} />
      </div>
      {img.caption?.trim() ? <figcaption className="pcare__caption">{img.caption}</figcaption> : null}
    </figure>
  );
}

/** The section's type — explicit when the editor set one, else inferred from its shape (seed). */
function kindOf(s: PageSection): SectionVariant {
  if (s.variant) return s.variant;
  if (s.items?.length) return "accordion";
  if (s.layout === "overlay") return "overlay";
  if (s.image?.url || s.layout === "left" || s.layout === "right" || s.layout === "center" || s.layout === "wide" || !!s.step || !!s.label) return "editorial";
  if (s.heading && !cleanBody(s.body).length) return "divider";
  return "statement";
}

function SectionView({ s }: { s: PageSection }) {
  const ratio: SectionRatio = s.ratio ?? "landscape";
  const editLayout: SectionLayout = s.layout === "overlay" ? "left" : (s.layout ?? "left");
  const hasImage = !!s.image?.url;
  const kind = kindOf(s);

  // Accordion — the section supplies its own heading + lede; FaqAccordion renders only the Q&A.
  if (kind === "accordion") {
    const items = (s.items ?? []).filter((it) => (it.q || "").trim() || (it.a || "").trim());
    const lede = cleanBody(s.body);
    return (
      <section className="pcare__section pcare__section--accordion">
        {s.heading ? <h2 className="pcare__title pcare__title--center">{s.heading}</h2> : null}
        {lede.length ? <p className="pcare__lede">{lede.join(" ")}</p> : null}
        {items.length ? <FaqAccordion categories={[{ category: "", items }]} /> : null}
      </section>
    );
  }

  // Image break with overlay text (a wide image once uploaded; a quiet band until then).
  if (kind === "overlay") {
    const align = s.align ?? "center";
    return (
      <section className="pcare__section pcare__section--overlay">
        <div className={`pcare__overlay pcare__overlay--${align} ${hasImage ? "pcare__overlay--image" : "pcare__overlay--plain"}`} style={{ aspectRatio: RATIO[ratio] }}>
          {hasImage ? <AssetImage asset={toAsset(s.image!, ratio)} sizes="100vw" /> : null}
          {s.heading ? <div className="pcare__overlay-text"><p>{s.heading}</p></div> : null}
        </div>
      </section>
    );
  }

  // Editorial block — with an image, placed by layout (left / right → two columns; center / wide →
  // stacked). Before an image is added, it becomes an ALIGNED text column so the reading rhythm
  // still alternates (left / right offset, or centred) rather than everything centring.
  if (kind === "editorial") {
    if (hasImage) {
      return (
        <section className={`pcare__section pcare__section--${editLayout}`}>
          <Figure img={s.image!} ratio={ratio} sizes={SIZES[editLayout] ?? "(max-width: 860px) 100vw, 46vw"} />
          <TextBlock s={s} />
        </section>
      );
    }
    if (!cleanBody(s.body).length && !s.heading && !s.label) return null; // nothing to show yet
    const align = editLayout === "right" ? "right" : editLayout === "center" || editLayout === "wide" ? "center" : "left";
    return (
      <section className={`pcare__section pcare__section--textblock pcare__section--align-${align}`}>
        <TextBlock s={s} />
      </section>
    );
  }

  // Movement divider — heading only (body, if any, is preserved in data but not rendered).
  if (kind === "divider") {
    return (
      <section className="pcare__section pcare__section--divider">
        <h2 className="pcare__divider-title">{s.heading}</h2>
      </section>
    );
  }

  // Statement — a centred text block. A heading-less statement with no centred-layout hint reads as
  // a quiet closing tagline (larger italic); anything else is an understated centred intro/text.
  const isClosing = !s.heading && s.layout !== "center";
  return (
    <section className={`pcare__section pcare__section--text${isClosing ? " pcare__section--closing" : ""}`}>
      <TextBlock s={s} />
    </section>
  );
}

export function ProductCareContent({ eyebrow, title, intro, sections }: {
  eyebrow?: string;
  title: string;
  intro?: string;
  sections: PageSection[];
}) {
  const visible = (sections ?? []).filter((s) => !s.hidden);
  // Intro carries the hero line (first line) + an optional supporting subtitle (remaining lines).
  const [heroLine, ...heroSub] = (intro ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <main className="legal legal--band pcare">
      <div className="legal-hero pcare-hero">
        <header className="legal-hero__inner">
          {eyebrow ? <p className="legal__eyebrow">{eyebrow}</p> : null}
          <h1 className="legal__title">{title}</h1>
          {heroLine ? <p className="legal__intro pcare-hero__line">{heroLine}</p> : null}
          {heroSub.length ? <p className="pcare-hero__sub">{heroSub.join(" ")}</p> : null}
        </header>
      </div>
      <div className="pcare__body">
        {visible.map((s, i) => <SectionView key={i} s={s} />)}
      </div>
    </main>
  );
}
