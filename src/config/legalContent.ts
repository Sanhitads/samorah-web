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
    eyebrow: "Legal",
    title: "Privacy Policy",
    intro: "How we handle your information.",
    sections: [
      { heading: "What we collect", body: ["We collect the details you provide to place and fulfil an order (name, contact, delivery address) and basic usage data to improve the store."] },
      { heading: "How we use it", body: ["To process orders, provide support, send transactional emails, and — only with consent — occasional letters from the studio."] },
      { heading: "Your rights", body: ["You may request access to, correction of, or deletion of your personal data. Contact us to exercise these rights."] },
    ],
    footNote: REVIEW,
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
