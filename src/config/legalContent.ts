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
    // Hero shows only Title + Subtitle (no eyebrow, no hero image) — mirrors Privacy.
    eyebrow: "",
    title: "Terms & Conditions",
    intro: "A clear understanding of how we work together.",
    // Ordered sections. "- " lines render as a semantic bullet list; the Contact section
    // uses the {{supportEmail}} token (resolved from Site Settings, never hard-coded); the
    // final heading-less section is the closing statement.
    sections: [
      { heading: "Introduction", body: [
        "By accessing or purchasing from our website, you agree to the terms outlined below.",
        "We've kept them simple, transparent, and respectful of your experience.",
      ] },
      { heading: "Eligibility to Purchase", body: [
        "By placing an order, you confirm that you are legally capable of entering into a binding agreement under applicable law.",
      ] },
      { heading: "Acceptance of Terms", body: [
        "By accessing, browsing or purchasing from Samorah, you acknowledge that you have read and agree to these Terms & Conditions.",
      ] },
      { heading: "Use of Website", body: [
        "You agree to use this website for lawful purposes only.",
        "Any misuse, unauthorised access, or disruption of the website experience is not permitted.",
      ] },
      { heading: "Accounts & Responsibilities", body: [
        "If you create an account, you are responsible for maintaining the confidentiality of your login credentials and for activities carried out through your account.",
      ] },
      { heading: "Products & Availability", body: [
        "We make every effort to ensure that product descriptions, images and details are accurate.",
        "Every product is handcrafted, so minor variations in colour, texture, finish or fragrance are natural.",
        "Products may occasionally become unavailable after an order is placed due to inventory or production limitations.",
      ] },
      { heading: "Pricing & Payments", body: [
        "All prices are listed in INR and are inclusive of applicable taxes unless stated otherwise.",
        "We reserve the right to update pricing at any time without prior notice.",
        "Pricing updates do not affect orders that have already been successfully confirmed.",
        "Payment is processed securely through authorised payment providers; Samorah does not store your complete card or banking details.",
      ] },
      { heading: "Orders & Acceptance", body: [
        "Once an order is placed, you will receive a confirmation. This confirmation acknowledges receipt of your order only.",
        "Acceptance of your order takes place after review and processing.",
        "We reserve the right to cancel or limit orders in cases of:",
        "- Product unavailability",
        "- Payment issues",
        "- Suspected misuse",
        "- Suspected fraud",
        "- Obvious pricing errors",
        "- Technical errors",
      ] },
      { heading: "Order Modifications", body: [
        "Orders generally cannot be modified once processing has begun.",
        "If changes are required, please contact support as soon as possible.",
      ] },
      { heading: "Shipping & Delivery", body: [
        "Shipping timelines and charges are detailed in our Shipping Policy.",
        "Delivery timelines are estimates and may vary due to courier operations, weather, public holidays, or other circumstances beyond our reasonable control.",
      ] },
      { heading: "Returns & Refunds", body: [
        "Returns and refunds are governed by our Returns Policy.",
        "Some products may not be eligible for return, where stated in the Returns Policy.",
        "Please refer to that page for complete details.",
      ] },
      { heading: "Promotions & Discount Codes", body: [
        "Promotions, offers and coupon codes:",
        "- may expire",
        "- cannot always be combined",
        "- may include additional eligibility conditions",
      ] },
      { heading: "Intellectual Property", body: [
        "All content on this website — including trademarks, logos, product photography, illustrations, website design and written content — is the property of Samorah.",
        "Unauthorised use or reproduction is not permitted.",
      ] },
      { heading: "Disclaimer", body: [
        "Because our products are handcrafted, slight variations between batches may naturally occur.",
        "These variations do not constitute defects.",
      ] },
      { heading: "Limitation of Liability", body: [
        "We are not liable for:",
        "- Indirect or incidental damages",
        "- Delays beyond our control",
        "- Misuse of products",
        "To the maximum extent permitted by applicable law, Samorah's liability is limited to the amount paid for the product giving rise to the claim.",
      ] },
      { heading: "Privacy", body: [
        "Your personal information is handled in accordance with our Privacy Policy.",
        "We do not sell or misuse your data.",
      ] },
      { heading: "Force Majeure", body: [
        "Samorah is not responsible for delays or failures caused by circumstances beyond reasonable control, including:",
        "- Natural disasters",
        "- Transport disruption",
        "- Government restrictions",
        "- Strikes",
        "- Internet or infrastructure failures",
      ] },
      { heading: "Changes to Terms", body: [
        "We may update these terms from time to time.",
        "Any changes will be reflected on this page.",
      ] },
      { heading: "Entire Agreement", body: [
        "These Terms, together with the Privacy Policy, Shipping Policy and Returns Policy, constitute the agreement between Samorah and the customer regarding website use and purchases.",
      ] },
      { heading: "Governing Law", body: [
        "These terms are governed by the laws of India.",
        "Any disputes shall be subject to the jurisdiction of the courts in Kolkata, West Bengal.",
      ] },
      { heading: "Contact", body: [
        "For any questions about these Terms:",
        "Email: {{supportEmail}}",
      ] },
      // Closing statement — heading-less, rendered as the quiet sign-off.
      { body: [
        "Clarity builds trust — and we believe in both.",
      ] },
    ],
  },
};
