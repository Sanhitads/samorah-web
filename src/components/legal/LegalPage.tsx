import type { ReactNode } from "react";

/** Shared editorial layout for policy / info pages. Prop-driven (CMS-ready). */
export interface LegalSection {
  heading?: string;
  body: string[]; // paragraphs
}

export function LegalPage({ eyebrow, title, intro, sections, footNote, children }: {
  eyebrow: string;
  title: string;
  intro?: string;
  sections?: LegalSection[];
  footNote?: string;
  children?: ReactNode;
}) {
  return (
    <main className="legal">
      <header className="legal__head">
        <p className="legal__eyebrow">{eyebrow}</p>
        <h1 className="legal__title">{title}</h1>
        {intro ? <p className="legal__intro">{intro}</p> : null}
      </header>
      {children}
      {sections?.map((s, i) => (
        <section key={i} className="legal__section">
          {s.heading ? <h2 className="legal__section-title">{s.heading}</h2> : null}
          {s.body.map((p, j) => <p key={j} className="legal__p">{p}</p>)}
        </section>
      ))}
      {footNote ? <p className="legal__foot">{footNote}</p> : null}
    </main>
  );
}
