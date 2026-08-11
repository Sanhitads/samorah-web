import type { LegalSection } from "@/components/legal/LegalPage";

/**
 * Policy / info page content. PLACEHOLDER structure that resolves the footer/mega-
 * menu 404s and gives launch a skeleton — the FINAL legal copy (privacy, terms,
 * shipping, returns) must be reviewed by the business/legal before go-live (P17).
 * Kept as data so copy is a config change, not a code edit.
 */
const REVIEW = "This is placeholder policy text pending final review by Samorah before launch.";

export const LEGAL: Record<string, { eyebrow: string; title: string; intro?: string; sections: LegalSection[]; footNote?: string }> = {
  shipping: {
    eyebrow: "Support",
    title: "Shipping",
    intro: "How your handmade collection reaches you.",
    sections: [
      { heading: "Dispatch", body: ["Every candle is poured and finished by hand. Orders are typically dispatched within 1–2 business days.", "You'll receive an email with tracking the moment your order ships."] },
      { heading: "Delivery", body: ["We deliver across India via trusted courier partners. Estimated delivery is 3–7 business days depending on your location.", "Complimentary shipping applies above the current free-shipping threshold; a flat rate applies otherwise, shown at checkout."] },
      { heading: "Careful packaging", body: ["Fragile vessels are protected with recyclable, purpose-fit packaging so they arrive exactly as intended."] },
    ],
    footNote: REVIEW,
  },
  returns: {
    eyebrow: "Support",
    title: "Returns & Refunds",
    intro: "If something isn't right, we'll make it right.",
    sections: [
      { heading: "Eligibility", body: ["Unused items in original packaging may be returned within the eligible window. Personalised or clearance items may be non-returnable.", "If an item arrives damaged or incorrect, contact us within 48 hours of delivery and we'll arrange a replacement or refund."] },
      { heading: "How to start a return", body: ["Reply to your order confirmation email, or write to us with your order number, and our team will guide you through the process."] },
      { heading: "Refunds", body: ["Approved refunds are issued to your original payment method and typically reach you within 5–7 business days of processing."] },
    ],
    footNote: REVIEW,
  },
  "product-care": {
    eyebrow: "The Ritual",
    title: "Candle Care",
    intro: "A few small rituals to make each candle last, and burn beautifully.",
    sections: [
      { heading: "The first burn", body: ["Let the wax melt fully to the edges on the first lighting — usually 2–3 hours. This sets an even memory and prevents tunnelling."] },
      { heading: "Trim the wick", body: ["Trim the wick to about 5mm before every burn for a clean, steady flame and less soot."] },
      { heading: "Burn safely", body: ["Never leave a burning candle unattended. Keep away from draughts, children and pets. Stop use when about 1cm of wax remains."] },
    ],
  },
  faq: {
    eyebrow: "Help",
    title: "Frequently Asked",
    sections: [
      { heading: "Are your candles hand-made?", body: ["Yes — every piece is poured, finished and inspected by hand in small batches."] },
      { heading: "How long do they burn?", body: ["Burn time varies by size and vessel; each product page lists its approximate burn time."] },
      { heading: "Do you ship across India?", body: ["Yes. See our Shipping page for timelines and rates."] },
      { heading: "Can I return an order?", body: ["Yes, within the eligible window — see Returns & Refunds."] },
      { heading: "How do I track my order?", body: ["Use the tracking link in your dispatch email, or sign in and open the order from Your Account."] },
    ],
  },
  privacy: {
    // Hero shows only Title + Subtitle (no eyebrow, no hero image) — the editorial policy layout.
    eyebrow: "",
    title: "Privacy Policy",
    intro: "A quiet understanding of how your information is handled.",
    // Ordered sections. Body lines beginning with "- " render as a semantic bullet list;
    // the Contact section uses the {{supportEmail}} token, resolved from Site Settings at render
    // time (never hard-coded). The final, heading-less section is the closing statement.
    sections: [
      { heading: "Introduction", body: [
        "Your privacy matters to us.",
        "We collect only what is necessary to serve you better — and we handle it with care, discretion, and respect.",
      ] },
      { heading: "Information We Collect", body: [
        "We may collect:",
        "- Personal details such as name, email, phone number, and address",
        "- Order and transaction details",
        "- Information shared when you contact us",
      ] },
      { heading: "How We Use Your Information", body: [
        "We use your information to:",
        "- Process and deliver your orders",
        "- Communicate updates and support",
        "- Improve our website and experience",
        "We do not use your data beyond what is necessary.",
      ] },
      { heading: "Website Usage & Responsibility", body: [
        "By using our website, you agree:",
        "- To provide accurate information",
        "- Not to misuse or disrupt the platform",
        "- To use the website for lawful purposes only",
      ] },
      { heading: "Sharing of Information", body: [
        "We do not sell or trade your personal information.",
        "Your data may only be shared with trusted partners involved in:",
        "- Payment processing",
        "- Order delivery",
        "Information may also be shared with trusted technology, hosting and analytics providers, only where required to operate the website or fulfil our services.",
      ] },
      { heading: "Payment Information", body: [
        "Payments are securely processed through our authorised payment partners (such as Razorpay).",
        "Samorah never stores your complete credit card, debit card or banking credentials.",
      ] },
      { heading: "Cookies & Tracking", body: [
        "We use cookies to:",
        "- Improve website functionality",
        "- Understand user behaviour",
        "- Enhance your browsing experience",
        "- Remember your preferences",
        "- Maintain your shopping cart and session",
        "- Improve website performance",
        "You may disable cookies through your browser settings.",
      ] },
      { heading: "Data Security", body: [
        "We take reasonable steps to protect your information.",
        "Access to customer information is limited to authorised personnel and trusted service providers, only where required.",
        "However, no method of transmission over the internet is completely secure.",
      ] },
      { heading: "Data Retention", body: [
        "We retain order and customer information only for as long as reasonably necessary to:",
        "- Fulfil orders",
        "- Comply with legal obligations",
        "- Resolve disputes",
        "- Maintain business records",
      ] },
      { heading: "Marketing Communications", body: [
        "If you subscribe to updates or newsletters, you may unsubscribe at any time using the unsubscribe link or by contacting us.",
        "Unsubscribing from marketing communications does not affect order confirmations or essential service emails.",
      ] },
      { heading: "Your Rights", body: [
        "You may:",
        "- Request access to your data",
        "- Ask for corrections",
        "- Request deletion (where applicable)",
        "You may also withdraw consent where applicable, subject to legal or contractual obligations.",
      ] },
      { heading: "Children's Privacy", body: [
        "Our website is not intended for children under the applicable legal age.",
        "We do not knowingly collect personal information from children.",
      ] },
      { heading: "Third-Party Links", body: [
        "Our website may contain links to external websites.",
        "We are not responsible for their privacy practices.",
      ] },
      { heading: "Changes to Policy", body: [
        "We may update this policy from time to time.",
        "Changes will be reflected on this page.",
      ] },
      { heading: "Governing Law", body: [
        "This Privacy Policy shall be governed by the laws of India.",
        "Any disputes shall be subject to the jurisdiction of the appropriate courts.",
      ] },
      { heading: "Contact", body: [
        "For any privacy-related concerns:",
        "Email: {{supportEmail}}",
        "We aim to respond to privacy-related enquiries within 5–7 business days.",
      ] },
      // Closing statement — heading-less, rendered as the quiet sign-off.
      { body: [
        "We believe privacy, like scent, should never overwhelm — only support the experience.",
      ] },
    ],
  },
  terms: {
    eyebrow: "Legal",
    title: "Terms of Service",
    intro: "The terms governing your use of this store.",
    sections: [
      { heading: "Orders", body: ["Placing an order is an offer to purchase; we confirm acceptance on payment and dispatch. Prices are inclusive of applicable GST."] },
      { heading: "Products", body: ["As items are hand-made, small natural variations in colour, texture and finish are part of their character, not defects."] },
      { heading: "Liability", body: ["Please follow the care and safety guidance provided with every candle. Samorah is not liable for misuse."] },
    ],
    footNote: REVIEW,
  },
};
