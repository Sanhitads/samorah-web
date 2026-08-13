import { AssetImage } from "@/components/ui/AssetImage";
import { groupBody } from "@/lib/cms/pageContent";
import type { Asset } from "@/platform/asset";
import type { PageSection, SectionImage, SectionLayout, SectionRatio, SectionVariant } from "@/services/cmsService";

/**
 * The People Behind Samorah — a quiet editorial renderer (Trudon / Aesop / Kinfolk register:
 * generous whitespace, asymmetry, large photography). Built on the SAME section model + image atom
 * as Product Care — no new CMS. Contributors are CONTENT, not architecture: a `person` section's
 * `displayStyle` (feature / card / highlight) decides its weight, so people are added, reordered and
 * reweighted entirely in the CMS. Consecutive card/highlight people auto-collect into a responsive
 * grid (3 / 2 / 1 columns). Other sections — image break (overlay), divider, statement — mirror the
 * Product Care behaviour. Pure server component.
 */

const RATIO: Record<SectionRatio, string> = { square: "1 / 1", portrait: "4 / 5", landscape: "3 / 2" };
const FEATURE_SIZES: Partial<Record<SectionLayout, string>> = {
  wide: "(max-width: 1180px) 100vw, 1180px",
  left: "(max-width: 860px) 100vw, 48vw",
  right: "(max-width: 860px) 100vw, 48vw",
};

function parseFocal(focal?: string): { x: number; y: number } | undefined {
  const m = focal?.match(/([\d.]+)%\s+([\d.]+)%/);
  if (!m) return undefined;
  const clamp = (n: number) => Math.min(1, Math.max(0, n / 100));
  return { x: clamp(parseFloat(m[1])), y: clamp(parseFloat(m[2])) };
}

function toAsset(img: SectionImage, ratio: SectionRatio, role: Asset["role"] = "portrait"): Asset {
  const alt = (img.alt ?? "").trim();
  return {
    id: img.mediaId || img.url,
    kind: "image",
    desktop: img.url,
    role,
    alt,
    aspectRatio: RATIO[ratio],
    focalPoint: parseFocal(img.focal),
    decorative: !alt,
  };
}

const cleanBody = (body?: string[]) => (body ?? []).map((b) => (b ?? "").trim()).filter(Boolean);

function Body({ body }: { body?: string[] }) {
  const clean = cleanBody(body);
  if (!clean.length) return null;
  return (
    <>
      {groupBody(clean).map((block, j) =>
        block.type === "list" ? (
          <ul key={j} className="people__list">{block.items.map((x, k) => <li key={k}>{x}</li>)}</ul>
        ) : (
          <p key={j} className="people__p">{block.text}</p>
        ),
      )}
    </>
  );
}

const kindOf = (s: PageSection): SectionVariant => {
  if (s.variant) return s.variant;
  if (s.layout === "overlay") return "overlay";
  if (s.heading && !cleanBody(s.body).length) return "divider";
  return "statement";
};
const isGridPerson = (s: PageSection) => kindOf(s) === "person" && (s.displayStyle === "card" || s.displayStyle === "highlight");

/** A large editorial feature — portrait + role / name / story / optional quote. Asymmetric two-column
 *  on desktop (image left or right), or an aligned text block before a portrait is added. */
function PersonFeature({ s }: { s: PageSection }) {
  const ratio = s.ratio ?? "portrait";
  const layout: SectionLayout = s.layout === "left" || s.layout === "right" || s.layout === "wide" ? s.layout : "left";
  const hasImage = !!s.image?.url;
  const text = (
    <div className="people__feature-text">
      {s.label ? <p className="people__role">{s.label}</p> : null}
      {s.heading ? <h2 className="people__name">{s.heading}</h2> : null}
      <Body body={s.body} />
      {s.quote?.trim() ? <blockquote className="people__quote">{s.quote}</blockquote> : null}
    </div>
  );
  if (!hasImage) {
    const align = layout === "right" ? "right" : layout === "wide" ? "center" : "left";
    return <section className={`people__section people__feature people__feature--noimg people__feature--${align}`}>{text}</section>;
  }
  return (
    <section className={`people__section people__feature people__feature--${layout}`}>
      <figure className="people__portrait">
        <div className="people__portrait-media" style={{ aspectRatio: RATIO[ratio] }}>
          <AssetImage asset={toAsset(s.image!, ratio)} sizes={FEATURE_SIZES[layout] ?? "(max-width: 860px) 100vw, 48vw"} />
        </div>
        {s.image!.caption?.trim() ? <figcaption className="people__caption">{s.image!.caption}</figcaption> : null}
      </figure>
      {text}
    </section>
  );
}

/** One grid card — portrait (or a quiet placeholder) + role / name / short story. */
function PersonCard({ s }: { s: PageSection }) {
  const ratio = s.ratio ?? "portrait";
  const hasImage = !!s.image?.url;
  const highlight = s.displayStyle === "highlight";
  return (
    <article className={`people__card${highlight ? " people__card--highlight" : ""}`}>
      <div className="people__card-media" style={{ aspectRatio: RATIO[ratio] }}>
        {hasImage ? <AssetImage asset={toAsset(s.image!, ratio)} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw" /> : <span className="people__card-ph" aria-hidden="true" />}
      </div>
      <div className="people__card-text">
        {s.label ? <p className="people__role">{s.label}</p> : null}
        {s.heading ? <h3 className="people__name people__name--card">{s.heading}</h3> : null}
        <Body body={s.body} />
      </div>
    </article>
  );
}

function OtherSection({ s }: { s: PageSection }) {
  const kind = kindOf(s);
  const ratio = s.ratio ?? "landscape";

  if (kind === "overlay") {
    const align = s.align ?? "center";
    const hasImage = !!s.image?.url;
    return (
      <section className="people__section people__section--break">
        <div className={`people__overlay people__overlay--${align} ${hasImage ? "people__overlay--image" : "people__overlay--plain"}`} style={{ aspectRatio: RATIO[ratio] }}>
          {hasImage ? <AssetImage asset={toAsset(s.image!, ratio, "lifestyle")} sizes="100vw" /> : null}
          {s.heading ? <div className="people__overlay-text"><p>{s.heading}</p></div> : null}
        </div>
      </section>
    );
  }

  if (kind === "divider") {
    return (
      <section className="people__section people__divider">
        <h2 className="people__divider-title">{s.heading}</h2>
      </section>
    );
  }

  // Statement — centred editorial line. A heading-less statement with no centred hint reads as a
  // large italic pull-quote / closing; anything else is an understated centred intro.
  const isQuote = !s.heading && s.layout !== "center";
  return (
    <section className={`people__section people__statement${isQuote ? " people__statement--quote" : ""}`}>
      {s.heading ? <h2 className="people__statement-title">{s.heading}</h2> : null}
      <Body body={s.body} />
    </section>
  );
}

export function PeopleContent({ eyebrow, title, intro, heroImage, sections }: {
  eyebrow?: string;
  title: string;
  intro?: string;
  heroImage?: SectionImage | null;
  sections: PageSection[];
}) {
  const visible = (sections ?? []).filter((s) => !s.hidden);
  const [heroLine, ...heroSub] = (intro ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  // Group consecutive card/highlight people into responsive grids; everything else renders inline.
  const blocks: ({ grid: PageSection[] } | { section: PageSection })[] = [];
  let run: PageSection[] = [];
  const flush = () => { if (run.length) { blocks.push({ grid: run }); run = []; } };
  for (const s of visible) {
    if (isGridPerson(s)) run.push(s);
    else { flush(); blocks.push({ section: s }); }
  }
  flush();

  const heroHasImage = !!heroImage?.url;

  return (
    <main className="legal legal--band people">
      <div className={`legal-hero people-hero${heroHasImage ? " people-hero--image" : ""}`}>
        {heroHasImage ? <AssetImage asset={toAsset(heroImage!, "landscape", "hero")} priority sizes="100vw" className="people-hero__bg" /> : null}
        <header className="legal-hero__inner">
          {eyebrow ? <p className="legal__eyebrow">{eyebrow}</p> : null}
          <h1 className="legal__title">{title}</h1>
          {heroLine ? <p className="legal__intro people-hero__line">{heroLine}</p> : null}
          {heroSub.length ? <p className="people-hero__sub">{heroSub.join(" ")}</p> : null}
        </header>
      </div>

      <div className="people__body">
        {blocks.map((b, i) =>
          "grid" in b ? (
            <section key={i} className="people__section people__grid">
              {b.grid.map((s, j) => <PersonCard key={j} s={s} />)}
            </section>
          ) : kindOf(b.section) === "person" ? (
            <PersonFeature key={i} s={b.section} />
          ) : (
            <OtherSection key={i} s={b.section} />
          ),
        )}
      </div>
    </main>
  );
}
