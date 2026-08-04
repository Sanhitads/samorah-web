import { FOOTER_SECTIONS } from "@/config/navigation";
import { type FooterSection, relOf } from "@/services/navigationService";
import { TrackedNavLink } from "@/components/layout/TrackedNavLink";

/**
 * Editorial Footer (Phase 6 · Component 6) — the quiet closing note.
 *
 * A server component: static, settled, no client JS. A dark charcoal close
 * (Trudon · Loewe · The Row) so the page settles into silence with weight;
 * warm low-opacity type, hairline dividers only, typography-led. A permanent
 * index, not a sitemap or promo area. The poetic line is its own centred
 * section, divided from the index below — and optional (the footer reads fine
 * without it). Responsive reflow (5 → 3 → 2 columns) keeps the IA clear without
 * a mobile accordion. Newsletter is intentionally NOT here (a future global
 * section, per scope).
 */
const POETIC_LINE = "Fragrance designed to linger beyond the flame.";

export function Footer({ sections, poetic = POETIC_LINE, copyright = "© Samorah Studio", madeIn = "Made with care in India." }: { sections?: FooterSection[]; poetic?: string; copyright?: string; madeIn?: string }) {
  const cols = sections && sections.length ? sections : (FOOTER_SECTIONS as FooterSection[]);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {poetic ? (
          <div className="site-footer__intro">
            <p className="site-footer__poetic">{poetic}</p>
          </div>
        ) : null}

        <div className="site-footer__columns">
          {cols.map((section) => (
            <div className="site-footer__col" key={section.title}>
              <h2 className="site-footer__col-title">{section.title}</h2>
              <ul className="site-footer__links">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <TrackedNavLink
                      list="footer_nav"
                      itemName={link.label}
                      href={link.href ?? "#"}
                      external={link.external || link.target === "_blank"}
                      className="site-footer__link"
                      rel={relOf(link)}
                      target={link.target}
                    >
                      {link.label}
                    </TrackedNavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="site-footer__bottom">
          <span className="site-footer__copyright">{copyright}</span>
          <span className="site-footer__made">{madeIn}</span>
        </div>
      </div>
    </footer>
  );
}
