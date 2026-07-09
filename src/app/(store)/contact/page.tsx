import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { COMMERCE } from "@/config/commerce";

export const metadata: Metadata = { title: "Contact", description: "Reach the Samorah studio." };

export default function ContactPage() {
  const a = COMMERCE.registeredAddress;
  return (
    <LegalPage eyebrow="Studio" title="Contact" intro="A real person reads every message. We usually reply within one business day.">
      <div className="legal__contact">
        <div className="legal__contact-item">
          <p className="legal__contact-label">Email</p>
          <p><a href={`mailto:${COMMERCE.support.email}`} className="text-link">{COMMERCE.support.email}</a></p>
        </div>
        <div className="legal__contact-item">
          <p className="legal__contact-label">Studio</p>
          <p>{a.city}, {a.state}, {a.country}</p>
        </div>
        <div className="legal__contact-item">
          <p className="legal__contact-label">Orders</p>
          <p>Sign in to <a href="/account/orders" className="text-link">Your Orders</a> to track or review an order, or reply to your confirmation email.</p>
        </div>
      </div>
    </LegalPage>
  );
}
