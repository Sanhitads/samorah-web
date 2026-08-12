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
  "returns-policy": {
    // Hero shows only Title + Subtitle (no eyebrow, no hero image) — mirrors Privacy/Terms.
    eyebrow: "",
    title: "Returns & Refund Policy",
    intro: "A thoughtful approach to returns, exchanges, and refunds.",
    // "- " lines render as a semantic bullet list; the Contact section uses the
    // {{supportEmail}} token (resolved from Site Settings, never hard-coded); the final
    // heading-less section is the closing statement.
    sections: [
      { heading: "Introduction", body: [
        "We want your experience with Samorah to feel seamless and reassuring.",
        "If something isn't right with your order, we're here to help with care, clarity, and fairness.",
      ] },
      { heading: "Returns Eligibility", body: [
        "You may request a return if:",
        "- The product arrives damaged",
        "- You receive the wrong product",
        "- The product is defective",
        "- The product remains unused, unopened, in its original packaging, and accompanied by all original accessories (where applicable)",
        "Return requests must be submitted within 48 hours of delivery.",
      ] },
      { heading: "Non-Returnable Items", body: [
        "For hygiene, safety, and product integrity, we cannot accept returns for:",
        "- Opened candles",
        "- Used room sprays",
        "- Used fragrance products",
        "- Products damaged through misuse, neglect, or improper storage",
        "- Clearance or final-sale products (where clearly stated)",
      ] },
      { heading: "Return Request Process", body: [
        "To begin a return request, please contact us with:",
        "- Order number",
        "- Clear photographs of the product, the packaging, and the shipping label (where applicable)",
        "- Brief description of the issue",
        "Our team will review every request individually before approving a return or replacement.",
      ] },
      { heading: "Refund Process", body: [
        "Once your return is approved and received:",
        "- Refunds are processed to the original payment method",
        "- Refund processing usually takes 5–7 business days",
        "- Your payment provider or bank may require additional processing time before the refund appears",
        "- You'll receive confirmation once the refund has been initiated",
      ] },
      { heading: "Exchanges", body: [
        "Where appropriate, we may offer a replacement instead of a refund.",
        "Replacement depends on:",
        "- Product availability",
        "- Nature of the issue",
        "- Verification of the reported damage or defect",
        "Replacement products are subject to product availability.",
      ] },
      { heading: "Return Shipping", body: [
        "If the return is approved because:",
        "- Product arrived damaged",
        "- Wrong product was shipped",
        "- Manufacturing defect",
        "Samorah will arrange or reimburse return shipping.",
        "For any other approved return, original shipping charges may not be refundable unless required by law.",
        "Please do not return products until instructed by our support team.",
      ] },
      { heading: "Order Cancellations", body: [
        "Orders may be cancelled before dispatch.",
        "Once an order has entered production or dispatch preparation, cancellation may no longer be possible.",
        "Once an order has been shipped, cancellations are no longer possible and the order falls under this Returns & Refund Policy.",
      ] },
      { heading: "Damaged or Incorrect Orders", body: [
        "If your order arrives damaged or incorrect:",
        "Please contact us within 48 hours of delivery.",
        "Include:",
        "- Order number",
        "- Clear photographs of the product, packaging, and shipping label (where applicable)",
        "We will review the request promptly and work toward an appropriate resolution.",
      ] },
      { heading: "Refund Exceptions", body: [
        "Refunds may be declined if:",
        "- The returned product shows signs of use",
        "- Required evidence cannot be provided",
        "- Damage resulted from improper handling after delivery",
        "- The return request falls outside the stated policy",
        "- The return was sent without prior approval",
      ] },
      { heading: "Processing Time", body: [
        "Approved replacements and refunds are processed as quickly as reasonably possible.",
        "During high-volume periods, processing times may be slightly longer.",
      ] },
      { heading: "Policy Updates", body: [
        "We may update this Returns & Refund Policy from time to time.",
        "The latest version will always be available on this page.",
      ] },
      { heading: "Contact", body: [
        "For any returns or refund-related questions:",
        "Email: {{supportEmail}}",
      ] },
      // Closing statement — heading-less, rendered as the quiet sign-off.
      { body: [
        "We believe every experience should leave a lasting impression — including the support that follows it.",
      ] },
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
