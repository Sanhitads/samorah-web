import type { ReactNode } from "react";
import { groupBody } from "@/lib/cms/pageContent";

/** Shared editorial layout for policy / info pages. Prop-driven (CMS-ready). */
export interface LegalSection {
  heading?: string;
  body: string[]; // paragraphs; consecutive "- " lines render as a semantic bullet list
}

export function LegalPage({ eyebrow, title, intro, sections, footNote, children, heroBand, effectiveDate, lastUpdated, closing }: {
  eyebrow: string;
  title: string;
  intro?: string;
  sections?: LegalSection[];
  footNote?: string;
  children?: ReactNode;
  /** Dual-tone treatment: the hero (title + tagline) sits on a full-width tinted
   *  band above an ivory body. Opt-in per page so other policy pages are unchanged. */
  heroBand?: boolean;
  /** Pre-formatted page metadata (from CMS metadata) shown under the hero. */
  effectiveDate?: string;
  lastUpdated?: string;
  /** The page's closing statement — rendered as a quiet editorial signature, last. */
  closing?: string;
}) {
  const head = (
    <header className={heroBand ? "legal-hero__inner" : "legal__head"}>
      {eyebrow ? <p className="legal__eyebrow">{eyebrow}</p> : null}
      <h1 className="legal__title">{title}</h1>
      {intro ? <p className="legal__intro">{intro}</p> : null}
    </header>
  );

  const body = (
    <>
      {effectiveDate || lastUpdated ? (
        <p className="legal__meta">
          {effectiveDate ? <span>Effective {effectiveDate}</span> : null}
          {effectiveDate && lastUpdated ? <span aria-hidden="true"> · </span> : null}
          {lastUpdated ? <span>Last updated {lastUpdated}</span> : null}
        </p>
      ) : null}
      {children}
      {sections?.map((s, i) => (
        <section key={i} className="legal__section">
          {s.heading ? <h2 className="legal__section-title">{s.heading}</h2> : null}
          {groupBody(s.body).map((block, j) =>
            block.type === "list" ? (
              <ul key={j} className="legal__list">
                {block.items.map((item, k) => <li key={k} className="legal__list-item">{item}</li>)}
              </ul>
            ) : (
              <p key={j} className="legal__p">{block.text}</p>
            ),
          )}
        </section>
      ))}
      {closing ? <p className="legal__closing">{closing}</p> : null}
      {footNote ? <p className="legal__foot">{footNote}</p> : null}
    </>
  );

  if (heroBand) {
    return (
      <main className="legal legal--band">
        <div className="legal-hero">{head}</div>
        <div className="legal__body">{body}</div>
      </main>
    );
  }

  return (
    <main className="legal">
      {head}
      {body}
    </main>
  );
}
