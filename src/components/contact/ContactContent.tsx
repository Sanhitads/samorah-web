import Link from "next/link";
import { groupBody } from "@/lib/cms/pageContent";
import { ContactForm } from "@/components/contact/ContactForm";
import type { ContactFormConfig } from "@/lib/contact";

export interface ContactBlock { heading?: string; body: string[] }
export interface ContactContentProps {
  intro?: ContactBlock;
  studio?: ContactBlock;
  hours?: ContactBlock;
  response?: ContactBlock;
  methods: { email: string; whatsapp?: string; phone?: string };
  social: { instagram?: string; pinterest?: string; facebook?: string; spotify?: string };
  formConfig?: ContactFormConfig;
}

function Block({ block }: { block?: ContactBlock }) {
  if (!block || (!block.heading && !block.body?.some((b) => b.trim()))) return null;
  return (
    <section className="legal__section">
      {block.heading ? <h2 className="legal__section-title">{block.heading}</h2> : null}
      {groupBody(block.body ?? []).map((b, j) =>
        b.type === "list"
          ? <ul key={j} className="legal__list">{b.items.map((x, k) => <li key={k} className="legal__list-item">{x}</li>)}</ul>
          : <p key={j} className="legal__p">{b.text}</p>,
      )}
    </section>
  );
}

/**
 * The Contact page body (shared by the public route AND the CMS live preview so they match).
 * Editorial text blocks come from CMS content; contact methods + social come from Site Settings
 * (single source — empty values are hidden, no placeholders); the form is minimal + validated.
 */
export function ContactContent({ intro, studio, hours, response, methods, social, formConfig }: ContactContentProps) {
  const socials = [
    { label: "Instagram", href: social.instagram },
    { label: "Pinterest", href: social.pinterest },
    { label: "Facebook", href: social.facebook },
    { label: "Spotify", href: social.spotify },
  ].filter((s) => (s.href ?? "").trim());

  return (
    <>
      <Block block={intro} />

      <section className="legal__section">
        <h2 className="legal__section-title">Contact Methods</h2>
        <div className="contact__methods">
          <div className="contact__method">
            <p className="contact__method-label">Email</p>
            <p className="contact__method-value"><a href={`mailto:${methods.email}`} className="text-link">{methods.email}</a></p>
            <p className="contact__method-caption">For orders, product questions and general enquiries.</p>
          </div>
          {methods.whatsapp?.trim() ? (
            <div className="contact__method">
              <p className="contact__method-label">WhatsApp</p>
              <p className="contact__method-value">{methods.whatsapp}</p>
              <p className="contact__method-caption">For quick conversations during business hours.</p>
            </div>
          ) : null}
          {methods.phone?.trim() ? (
            <div className="contact__method">
              <p className="contact__method-label">Phone</p>
              <p className="contact__method-value">{methods.phone}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="legal__section">
        <h2 className="legal__section-title">Send a Message</h2>
        <ContactForm config={formConfig} />
      </section>

      <Block block={studio} />
      <Block block={hours} />

      <section className="legal__section">
        <h2 className="legal__section-title">Before You Contact Us</h2>
        <p className="legal__p">Looking for information about shipping, returns or candle care? You may find an answer more quickly in our FAQ or policy pages.</p>
        <ul className="legal__list contact__links">
          <li className="legal__list-item"><Link href="/faq" className="text-link">FAQ</Link></li>
          <li className="legal__list-item"><Link href="/shipping" className="text-link">Shipping Policy</Link></li>
          <li className="legal__list-item"><Link href="/returns-policy" className="text-link">Returns Policy</Link></li>
          <li className="legal__list-item"><Link href="/privacy" className="text-link">Privacy Policy</Link></li>
        </ul>
      </section>

      <Block block={response} />

      {socials.length ? (
        <section className="legal__section">
          <h2 className="legal__section-title">Find Us</h2>
          <p className="contact__social">
            {socials.map((s, i) => (
              <span key={s.label}>
                {i > 0 ? <span className="contact__social-sep" aria-hidden="true"> · </span> : null}
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-link">{s.label}</a>
              </span>
            ))}
          </p>
        </section>
      ) : null}
    </>
  );
}
