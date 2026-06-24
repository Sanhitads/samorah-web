import Link from "next/link";
import { FOOTER_SECTIONS } from "@/config/navigation";

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

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__intro">
          <p className="site-footer__poetic">{POETIC_LINE}</p>
        </div>

        <div className="site-footer__columns">
          {FOOTER_SECTIONS.map((section) => (
            <div className="site-footer__col" key={section.title}>
              <h2 className="site-footer__col-title">{section.title}</h2>
              <ul className="site-footer__links">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="site-footer__link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="site-footer__link">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="site-footer__bottom">
          <span className="site-footer__copyright">© Samorah Studio</span>
          <span className="site-footer__made">Made with care in India.</span>
        </div>
      </div>
    </footer>
  );
}
