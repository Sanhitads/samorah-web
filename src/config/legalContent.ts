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
    // Hero shows only Title + Subtitle (no eyebrow, no hero image) — mirrors the other policy pages.
    eyebrow: "",
    title: "Shipping Policy",
    intro: "A quiet note on how your order reaches you.",
    // "- " lines render as a semantic bullet list. Tokens resolved at render time (never hard-coded):
    // {{supportEmail}} from Site Settings, {{freeShippingThreshold}} from the shipping config. The final
    // heading-less section is the closing statement.
    sections: [
      { heading: "Introduction", body: [
        "We take care in how every order is prepared, packed, and shipped.",
        "From careful packaging to reliable delivery partners, every step reflects the same attention we give to the products themselves.",
      ] },
      { heading: "Shipping Overview", body: [
        "We currently ship across India.",
        "Every order is carefully packed to help ensure it reaches you safely and in excellent condition.",
        "Shipping availability may vary for certain remote locations.",
      ] },
      { heading: "Shipping Partners", body: [
        "We work with trusted courier partners selected for reliable and secure delivery across India.",
        "The courier assigned to your order may vary depending on your delivery location and service availability.",
      ] },
      { heading: "Order Processing", body: [
        "Orders are generally processed within 1–2 business days after successful payment confirmation.",
        "During launches, festive seasons, or high-order volumes, processing may take slightly longer.",
      ] },
      { heading: "Delivery Timelines", body: [
        "Estimated delivery times are:",
        "- Metro cities: 2–4 business days",
        "- Non-metro locations: 4–7 business days",
        "- Remote locations: delivery times may vary",
        "Delivery estimates begin after order dispatch.",
        "These timelines are estimates and not guaranteed delivery commitments.",
      ] },
      { heading: "Shipping Charges", body: [
        "- Complimentary shipping on eligible orders above {{freeShippingThreshold}}",
        "- Applicable shipping charges (if any) are calculated automatically during checkout before payment",
        "- Shipping charges are displayed clearly during checkout before payment",
      ] },
      { heading: "Order Tracking", body: [
        "Once your order has been dispatched, you'll receive shipment tracking details via email or SMS (where available).",
        "Tracking updates depend on the courier partner and may occasionally take time to appear.",
      ] },
      { heading: "Partial Shipments", body: [
        "In rare situations, products within the same order may be shipped separately to help ensure faster delivery.",
        "Where applicable, separate tracking information will be shared.",
      ] },
      { heading: "Delivery Attempts", body: [
        "Courier partners may make multiple delivery attempts.",
        "If delivery cannot be completed because the recipient is unavailable or the address is incorrect, the shipment may be returned to us.",
        "Additional shipping charges may apply for re-dispatch where appropriate.",
      ] },
      { heading: "Address Accuracy", body: [
        "Please ensure that your shipping address and contact details are accurate when placing your order.",
        "Samorah cannot be responsible for delays resulting from incomplete or incorrect delivery information.",
      ] },
      { heading: "Delays & Exceptions", body: [
        "Occasionally deliveries may be delayed due to:",
        "- Weather conditions",
        "- Public holidays",
        "- Courier operational disruptions",
        "- Government restrictions",
        "- Remote delivery locations",
        "- Other circumstances beyond our reasonable control",
        "We appreciate your patience should such situations arise.",
      ] },
      { heading: "Damaged or Lost Shipments", body: [
        "If your shipment appears delayed beyond the estimated delivery window, or arrives damaged or appears tampered with, please contact us within 48 hours (where applicable) with:",
        "- Order number",
        "- Photographs of the product (if applicable)",
        "- Photographs of the packaging (if damaged)",
        "- Brief description of the issue",
        "We'll investigate with the courier partner and assist you as quickly as possible.",
      ] },
      { heading: "International Shipping", body: [
        "At present, Samorah ships only within India.",
        "If international shipping becomes available in the future, this page will be updated.",
      ] },
      { heading: "Policy Updates", body: [
        "We may update this Shipping Policy from time to time.",
        "The latest version will always be available on this page.",
        "Changes become effective once published on this page.",
      ] },
      { heading: "Contact", body: [
        "For any shipping-related questions:",
        "Email: {{supportEmail}}",
      ] },
      // Closing statement — heading-less, rendered as the quiet sign-off.
      { body: [
        "Each order is sent with care — from our hands to your space.",
      ] },
    ],
  },
  // Product Care — a premium EDITORIAL page (rendered by ProductCareContent, edited at
  // /admin/content/product-care). Named "Product Care" (not "Candle Care") so it holds candles,
  // room sprays and future ranges. Sections carry editorial fields (step/label/image/layout/ratio)
  // and — reusing the existing accordion mechanism — Q&A `items`. Layouts: left/right/center/wide
  // place an image; "overlay" is an image break with centred text; a heading-only section is a
  // movement divider; a heading-less body section is a quiet closing statement. Images are added in
  // the CMS (this seed ships copy + structure; the alternating layout activates once images exist).
  // Intro carries the hero line + subtitle on two lines.
  "product-care": {
    eyebrow: "",
    title: "Product Care",
    intro: "Every fragrance has its own rhythm.\nA little care allows every candle to burn more beautifully, every fragrance to linger more gracefully, and every ritual to feel complete.",
    sections: [
      // Hero transition — a short editorial statement easing from the hero into the first ritual.
      // Explicit statement variant + centred layout → understated centred intro (not a big closing).
      { variant: "statement", layout: "center", body: [
        "Every fragrance is made to be lived with — slowly, and with intention.",
        "A few quiet rituals keep each one at its finest.",
      ] },
      // ── Movement I · Candles ──────────────────────────────────────────────
      { heading: "The Ritual of Light", body: [] },
      { step: "01", heading: "Prepare the Wick", layout: "left", ratio: "portrait", body: [
        "Before every lighting, trim the wick to around a quarter of an inch.",
        "A smaller flame burns more quietly, for a cleaner glow and a fragrance that unfolds in balance.",
        "The smallest rituals often make the greatest difference.",
      ] },
      { step: "02", heading: "Allow the Wax to Bloom", layout: "right", ratio: "landscape", body: [
        "On the first burn, let the melted wax reach the very edges of the vessel.",
        "This sets an even wax memory, so every burn that follows stays true.",
        "Some things simply shouldn't be rushed.",
      ] },
      { step: "03", heading: "Enjoy the Moment", layout: "left", ratio: "portrait", body: [
        "Two to four hours is enough for the fragrance to reveal itself, while keeping the vessel comfortable.",
        "The most memorable moments are rarely hurried.",
      ] },
      { step: "04", heading: "Keep the Flame Centred", layout: "right", ratio: "landscape", body: [
        "Once extinguished, gently reposition the wick while the wax is still soft.",
        "A centred wick encourages an even flame and a longer life.",
      ] },
      { step: "05", heading: "The Final Light", layout: "left", ratio: "portrait", body: [
        "When about a centimetre of wax remains, let the candle complete its journey.",
        "Many vessels find a second life — as small planters, keepsakes, or quiet objects around the home.",
      ] },
      // Image break with overlay text (a wide image once uploaded; a quiet band until then).
      { layout: "overlay", ratio: "landscape", heading: "Luxury is often found in the way we tend to everyday rituals.", body: [] },
      // Accordion — heading + lede (body[0]) + Q&A items. Reuses the FAQ accordion.
      { heading: "Before You Light", body: [], items: [
        { q: "Can I leave my candle unattended?", a: "Never leave a lit candle unattended. A flame is happiest with someone nearby, even quietly." },
        { q: "Where should I place my candle?", a: "On a level, heat-resistant surface, away from draughts, curtains and anything that might catch the warmth." },
        { q: "Why should I trim the wick?", a: "A trimmed wick burns lower and cleaner, with less soot and a steadier glow." },
        { q: "Can I move the candle while it is burning?", a: "Let it rest while lit. Wait until the flame is out and the wax has firmed before moving it." },
        { q: "What should I do if the flame becomes too high?", a: "Extinguish it, let it cool, and trim the wick before lighting again." },
        { q: "How do I extinguish the candle properly?", a: "Use a snuffer, or gently dip the wick into the wax. Avoid blowing, which can unsettle the surface." },
      ] },
      { heading: "Our Materials", body: ["Care begins with what we choose to create."], items: [
        { q: "What are Samorah candles made from?", a: "A considered blend of waxes chosen for a clean, even burn, with cotton wicks and carefully composed fragrance." },
        { q: "Why do you use both natural and synthetic fragrance ingredients?", a: "Some notes exist beautifully in nature; others are recreated to protect rare or delicate sources. Together they allow a fuller, more lasting scent." },
        { q: "Do your products contain phthalates or parabens?", a: "No. Our fragrances are composed without phthalates or parabens." },
        { q: "Why don't you use artificial colourants?", a: "We prefer the honesty of the material. Fragrance and form lead; colour is never added for effect." },
        { q: "Are your products safe around children and pets?", a: "Used thoughtfully and never left unattended, yes. Keep lit candles and sprays out of reach." },
        { q: "Why do luxury fragrances sometimes smell softer than expected?", a: "A refined fragrance reveals itself gradually. It settles into a room rather than announcing itself at the door." },
      ] },
      { heading: "Living with Fragrance", layout: "center", body: [
        "Fragrance should become part of a room, not compete with it.",
        "Light a candle when you have time to enjoy it. Mist a room spray lightly, and let the scent settle into the space.",
        "Rather than filling every corner, let fragrance appear gently, evolve quietly, and fade with grace.",
        "The most memorable homes rarely smell stronger — they simply smell intentional.",
      ] },
      // Quiet closing statement for the candle movement (heading-less → statement styling).
      { body: [
        "Care is not simply how a product lasts longer.",
        "It is how every moment with it becomes more meaningful.",
      ] },
      // ── Chapter transition · Candles → Room Fragrance ─────────────────────
      // A full-width editorial break that resets the reading experience and opens the second
      // chapter (an overlay renders a full-bleed image with its label; a quiet band until an
      // image is uploaded), followed by a short editorial introduction.
      { layout: "overlay", ratio: "landscape", heading: "Room Fragrance", body: [] },
      { heading: "For spaces that evolve throughout the day.", layout: "center", body: [
        "Unlike a candle, a room fragrance changes a space instantly.",
        "It welcomes a new moment, refreshes familiar surroundings, and quietly fades once its purpose is complete.",
      ] },
      // ── Chapter II · Room Fragrance ───────────────────────────────────────
      { heading: "The Ritual of Refreshing a Space", body: [] },
      { step: "01", heading: "Prepare the Space", layout: "right", ratio: "landscape", body: [
        "Hold the bottle twenty to thirty centimetres away and mist lightly into the air.",
      ] },
      { step: "02", heading: "Refresh Soft Surfaces", layout: "left", ratio: "portrait", body: [
        "Lightly mist suitable linens, curtains, cushions or throws, and let the fragrance settle naturally.",
        "Always test delicate fabrics first.",
      ] },
      { step: "03", heading: "Allow the Fragrance to Settle", layout: "right", ratio: "landscape", body: [
        "Give the room a moment.",
        "The fragrance gradually becomes part of the atmosphere rather than announcing itself.",
      ] },
      { step: "04", heading: "Refresh Whenever the Moment Calls", layout: "left", ratio: "portrait", body: [
        "Morning light. Before guests arrive. After opening a window.",
        "Or simply whenever your home asks for a quiet reset.",
      ] },
      { heading: "Room & Linen Care", body: [], items: [
        { q: "How should I use a room spray?", a: "Mist lightly into the air, or over soft furnishings, and let it settle. A few considered sprays are enough." },
        { q: "Can I spray directly onto fabric?", a: "On suitable fabrics, yes — always test a hidden area first. Avoid delicate or dry-clean-only pieces." },
        { q: "How many sprays are recommended?", a: "Two or three to begin. Fragrance is easier to add than to take away." },
        { q: "How long does the fragrance last?", a: "It varies with the space and the airflow, lingering gently rather than lasting all day. Refresh whenever you wish." },
        { q: "Can I use it as a personal perfume?", a: "Our room sprays are made for spaces and linens, not for skin." },
        { q: "How should I store the bottle?", a: "Somewhere cool and dry, away from direct sunlight, with the cap in place." },
      ] },
      // Final philosophy (heading-less → statement styling), closes the page.
      { body: [
        "We believe fragrance is more than scent.",
        "It is atmosphere, memory and ritual.",
        "A little care allows every experience to linger beautifully.",
      ] },
    ],
  },
  // The People Behind Samorah — a quiet editorial page (rendered by PeopleContent, edited at
  // /admin/content/the-people-behind-samorah). Contributors are CONTENT: each `person` section's
  // `displayStyle` (feature / card / highlight) sets its weight, so people are added, reordered and
  // reweighted entirely in the CMS. Consecutive card people auto-collect into a responsive grid.
  // Portraits are added in the CMS (this seed ships copy + structure). Intro = hero line + subtitle.
  "the-people-behind-samorah": {
    eyebrow: "",
    title: "The People Behind Samorah",
    intro: "Some stories are carried by fragrance.\nOthers are carried by the people who quietly shape it.",
    sections: [
      // Editorial intro statement (centred, understated).
      { variant: "statement", layout: "center", body: [
        "A fragrance is never made by one pair of hands.",
        "It takes conversation, craft and patience, and people who notice the things most of us miss.",
      ] },
      // Feature — Founder (image left, portrait; the primary subject).
      { variant: "person", displayStyle: "feature", label: "Founder", heading: "Ananya Das", layout: "left", ratio: "portrait", body: [
        "She has always been drawn to small, familiar things — light through an old window, the smell of books, a room settling into evening.",
        "Samorah grew out of those observations, and she still shapes each new release with the same instinct.",
      ], quote: "The best things are the ones you almost don't notice." },
      // Image break — full-width (a gradient band with a quiet line until a photograph is added).
      { variant: "overlay", layout: "overlay", ratio: "landscape", align: "center", heading: "Most of the making is never seen.", body: [] },
      // Feature — Advisor (reverse layout, image right; not a résumé).
      { variant: "person", displayStyle: "feature", label: "Advisor", layout: "right", ratio: "portrait", body: [
        "Not everyone here makes things directly.",
        "Some ask the harder questions, or say plainly when a piece is finished.",
        "A second opinion keeps the work honest, long after the first idea.",
      ] },
      // Editorial quote (large italic serif — a pause, not a divider).
      { variant: "statement", body: ["Good fragrance is remembered quietly."] },
      // Transition — a small, understated line into the studio grid.
      { variant: "statement", layout: "center", body: ["No one here works alone for long."] },
      // Divider — introduces the studio grid.
      { variant: "divider", heading: "The Studio", body: [] },
      // Grid — cards auto-flow to 3 / 2 / 1 columns; add contributors simply by adding cards.
      { variant: "person", displayStyle: "card", label: "Artist", heading: "Somyadeep Das", ratio: "portrait", body: [
        "He pays attention to texture, to worn and overlooked places, to the details most people pass by.",
        "Given time, they turn into the artwork on a label or a lid.",
      ] },
      { variant: "person", displayStyle: "card", label: "Studio Companion", heading: "Milo", ratio: "portrait", body: [
        "Every studio needs someone who reminds us to pause.",
        "Always nearby, usually sleeping, occasionally supervising.",
      ] },
      // Future contributor — a HIDDEN template card (reveal or duplicate in the CMS as people join).
      { variant: "person", displayStyle: "card", label: "Future contributor", ratio: "portrait", hidden: true, body: [
        "Photographer, perfumer, ceramic artist, packaging designer — future hands are added here.",
        "Reveal this card, or duplicate it, as the studio grows.",
      ] },
      // Closing philosophy (large italic, centred).
      { variant: "statement", body: [
        "Every object carries the fingerprints of the people who made it.",
        "That is what makes it human.",
      ] },
    ],
  },
  faq: {
    // Hero shows only Title + Subtitle (no eyebrow, no hero image) — mirrors the policy pages.
    // FAQ sections are CATEGORIES: heading = category, items = its questions (rendered as an
    // accordion). The Contact answer uses {{supportEmail}} (resolved from Site Settings). The final
    // heading-less section is the closing quote.
    eyebrow: "",
    title: "Frequently Asked Questions",
    intro: "Helpful answers before you ask.",
    sections: [
      { heading: "Orders & Delivery", body: [], items: [
        { q: "How long does delivery take?", a: "Most orders arrive within 2–5 business days, depending on your location. Delivery estimates begin after dispatch." },
        { q: "Do you ship internationally?", a: "At present, Samorah ships only within India. International shipping will be announced when available." },
        { q: "Can I change or cancel my order?", a: "Changes or cancellations are possible only before your order has been dispatched. Once shipping has begun, the order is already in transit." },
        { q: "Will my order arrive safely?", a: "Every order is carefully packed to protect both the vessel and its fragrance during transit." },
        { q: "Is this suitable for gifting?", a: "Yes. Our products are designed to feel complete as gifts and are presented in premium packaging." },
        { q: "How can I track my order?", a: "Once your order has been dispatched, you'll receive tracking details via email or SMS (where available)." },
      ] },
      { heading: "Products & Fragrance", body: [], items: [
        { q: "How strong is the fragrance?", a: "Our fragrances are designed to be present without overwhelming the space. They reveal themselves gradually rather than dominating the room." },
        { q: "How do I choose the right fragrance?", a: "Choose the feeling before the fragrance.\nWhether you're seeking calm, warmth, freshness or quiet comfort, the scent follows the mood." },
        { q: "Can I use candles and room sprays together?", a: "Yes.\nThey are designed to complement each other.\n- Candle → depth and warmth\n- Room Spray → immediate atmosphere" },
        { q: "How long do your candles burn?", a: "Burn time depends on the vessel size. Every candle is created for slow, intentional use rather than rapid fragrance release." },
        { q: "Why does the scent feel softer than cheaper candles?", a: "Luxury fragrance is layered rather than artificially intense. It develops naturally throughout the room instead of producing an immediate overpowering scent." },
        { q: "Are your products handmade?", a: "Yes.\nMany of our products are handcrafted, so slight variations in colour, finish or texture are part of their character." },
      ] },
      { heading: "Candle Care & Safety", body: [], items: [
        { q: "Why is the first burn important?", a: "The first burn helps create an even wax memory, allowing future burns to melt evenly." },
        { q: "How long should I burn my candle?", a: "Generally between 1–3 hours, allowing the wax surface to melt evenly." },
        { q: "Should I trim the wick?", a: "Yes.\nTrim the wick before every burn for a cleaner flame and better performance." },
        { q: "Is it safe to burn candles every day?", a: "Yes, when used responsibly and following the Candle Care recommendations." },
        { q: "Can I use room spray on fabric?", a: "Only on suitable fabrics.\nAlways test a small hidden area first." },
        { q: "Why does fragrance smell different in different rooms?", a: "Room size, airflow, temperature and furnishings all influence how fragrance develops." },
      ] },
      { heading: "Returns & Support", body: [], items: [
        { q: "What if my product arrives damaged?", a: "Please contact us within 48 hours with photographs of the product and packaging. We'll review your request and help resolve it promptly." },
        { q: "Can I return a product if I simply don't like the fragrance?", a: "Because fragrance is highly personal and products cannot be resold once opened, we generally cannot accept returns based on scent preference alone." },
        { q: "Do handcrafted products vary slightly?", a: "Yes.\nEspecially with ceramic and terracotta vessels, every piece carries subtle differences that make it unique." },
        { q: "How do I contact support?", a: "Email us anytime at:\n{{supportEmail}}\nWe'll respond as quickly as possible." },
      ] },
      { heading: "General", body: [], items: [
        { q: "How should a home smell?", a: "Not constantly — intentionally.\nA fragrance should appear, evolve and gently fade." },
        { q: "How many fragrances should I use throughout my home?", a: "Different rooms can carry different moods, much like chapters within the same story." },
        { q: "When should I choose a candle instead of a room spray?", a: "Candles create atmosphere over time.\nRoom sprays refresh a space immediately.\nMany customers enjoy using both together." },
        { q: "Where are Samorah products made?", a: "Samorah products are thoughtfully designed and handcrafted in India." },
        { q: "Are your fragrances safe for everyday home use?", a: "Yes.\nWhen used according to the care instructions, our products are intended for normal home fragrance use." },
      ] },
      // Closing quote — heading-less, rendered as the quiet sign-off.
      { body: ["Questions often begin conversations — we're always happy to help with both."] },
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
  contact: {
    // Hero shows only Title + Subtitle (no eyebrow, no hero image) — mirrors the policy pages.
    // Editorial blocks are read BY POSITION by the /contact page:
    // [0] Introduction · [1] Our Studio · [2] Business Hours · [3] Response Expectations · closing quote.
    // {{studioAddress}} / {{businessHours}} resolve from Site Settings (single source of truth).
    eyebrow: "",
    title: "Contact Us",
    intro: "Every conversation begins with a simple hello.",
    sections: [
      { heading: "Let's Begin a Conversation", body: [
        "Whether you have a question about an order, need help choosing a fragrance, or simply want to reach out, we'd be delighted to hear from you.",
        "Every message is read with care and responded to as thoughtfully as possible.",
      ] },
      { heading: "Our Studio", body: [
        "Samorah Studio",
        "{{studioAddress}}",
      ] },
      { heading: "Business Hours", body: [
        "{{businessHours}}",
        "Closed on Sundays & Public Holidays.",
      ] },
      { heading: "Response Expectations", body: [
        "We typically respond within 1–2 business days.",
        "During launches or festive periods, replies may take a little longer.",
        "Thank you for your patience.",
      ] },
      // Closing quote — heading-less, rendered as the quiet sign-off.
      { body: ["The finest conversations begin with curiosity — we're always listening."] },
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
