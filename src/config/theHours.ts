/**
 * The Hours — Air Chapters content (Experience B). A "volume" is a diary of the
 * day's unnoticed moments; each **Hour** is an entry (time · name · story ·
 * scent) tied to a Room or Linen spray. Two groups per volume — Shared Hours
 * (Room) and Private Hours (Linen).
 *
 * CMS-ready & config-driven (no air products in the DB yet): the Air page reads
 * these typed objects, exactly like the homepage sections. Experiences, never
 * categories — the copy sells the moment before the product. `productSlug`
 * resolves to a real Room/Linen spray once seeded; imagery uses `gradient:*`
 * placeholders until SPD photography → Cloudinary.
 */
export type HourGroupKind = "room" | "linen";

export interface HourEntry {
  id: string;
  time: string; // "07:00" — shown as "HOUR 07:00"
  moment: string; // "Morning Begins" — a small poetic descriptor under the hour
  name: string;
  story: string; // the hero line
  hourReason: string; // "The Hour" — why this hour inspired the fragrance (PDP)
  hourStory?: string; // long-form "The Hour" narrative (overrides hourReason on the PDP)
  scentEffect?: string; // "The Effect" — a line shown with the Fragrance Journey
  productDetails?: string; // custom "Composition" accordion body
  scent: string[]; // the "smells like" notes (opening · heart · lingering)
  feels: string[]; // the "feels like" poetic lines (PDP)
  experience: string; // "The Experience" — how the room changes (PDP)
  placement: { label: string; note: string }[]; // where it belongs + a moment (PDP)
  signature: string; // the Signature Line — one sentence (PDP)
  productSlug: string; // → /shop/[slug] (the Room/Linen spray)
  priceLabel: string; // "From ₹599" until the commerce projection resolves it
  price: number; // commerce price (placeholder until air products exist)
  palette: string; // per-hour atmosphere theme token (the PDP editorial palette)
  gradient: string; // "gradient:grad-air" — the PDP hero image
  cardImage?: string; // the chapter-listing card image (may differ from the PDP hero); falls back to gradient
  /** A short editorial line shown between this Hour and the next (turning a leaf). */
  interlude?: string;
  /** Chapter position (e.g. "1.4") — drives the "VOL. I.4" edition when set. */
  chapterPosition?: string;
  /** Details accordion (Composition, Shipping, How to use…). When set, replaces the house-default
   *  accordion entirely — so the admin can rename, reorder, add and remove rows. */
  accordion?: { title: string; body: string }[];
  /** Per-section heading / eyebrow overrides for the air PDP. Any blank field uses the house default,
   *  so nothing on the page is truly hard-coded — it can all be edited per product. */
  labels?: {
    hourEyebrow?: string;
    fragranceEyebrow?: string;
    feelsEyebrow?: string;
    experienceEyebrow?: string;
    placementEyebrow?: string;
    placementHeading?: string;
    continueEyebrow?: string;
    continueHeading?: string;
  };
  /** Admin-added extra sections, rendered from existing block types (after the built-in sections,
   *  before the details accordion). Lets the page grow without new code. */
  customSections?: CustomSection[];
  /** Custom section palette (overrides the preset token): editorial background + text colour. */
  customPalette?: { surface: string; ink: string };
  /** Custom hero gradient CSS (a ready-built linear-gradient) — applied to the gradient hero block. */
  customGradientCss?: string;
}

/** An admin-defined extra PDP section, composed from an existing block type so its CSS/layout is
 *  inherited (no new styling): Statement (heading + paragraphs), Lines (verse), Grid (label/note
 *  tiles), or Quote. */
export interface CustomSection {
  type: "statement" | "lines" | "grid" | "quote";
  /** Where the section drops into the page flow (top / after a named built-in section / end). */
  position?: string;
  eyebrow?: string;
  heading?: string;
  body?: string; // statement: paragraphs (blank-line separated); quote: the quote text
  lines?: string[]; // lines block
  items?: { label: string; note: string }[]; // grid block
}

/** Placement options for a custom section → the base `order` it renders at (built-in sections use
 *  integer orders 1–8, so the .5 values drop a custom section into each gap). */
export const AIR_SECTION_POSITIONS: { value: string; label: string; order: number }[] = [
  { value: "top", label: "At the top (below Add to Bag)", order: 0.5 },
  { value: "after-hour", label: "After The Hour", order: 1.5 },
  { value: "after-fragrance", label: "After Fragrance Journey", order: 2.5 },
  { value: "after-feels", label: "After Feels Like", order: 3.5 },
  { value: "after-experience", label: "After The Experience", order: 4.5 },
  { value: "after-placement", label: "After Placement", order: 5.5 },
  { value: "after-signature", label: "After Signature", order: 6.5 },
  { value: "after-details", label: "After Details", order: 7.5 },
  { value: "end", label: "At the very end", order: 8.5 },
];

/** The house-default accordion rows for an air product — the starting point the editor pre-fills so
 *  Composition / Shipping are visible and editable from the first open (the admin can edit / add / remove). */
export const AIR_ACCORDION_DEFAULTS: { title: string; body: string }[] = [
  { title: "Composition", body: "A 100ml room & linen mist. Alcohol-free, skin-safe formula, made with premium fragrance and essential oils. Mist lightly into the air, or over linen and soft furnishings, and let it settle." },
  { title: "Shipping & Exchanges", body: "Dispatched within 2–3 business days. Complimentary standard shipping within India on orders over ₹1,499. Returns accepted within 48 hours of delivery for damaged or incorrect items." },
];

export interface HourGroup {
  kind: HourGroupKind;
  label: string; // eyebrow — "Shared Hours" · "Private Hours"
  title: string; // editorial — "Spaces We Share" · "Closer to You"
  note: string; // a quiet sub-line
  hours: HourEntry[];
}

export interface AirVolume {
  slug: string; // "the-everyday"
  volume: string; // "Volume I"
  title: string; // "The Everyday"
  tagline: string; // "The unnoticed moments that shape a day."
  cover: string; // "gradient:grad-air"
  isComingSoon: boolean;
  heroEyebrow?: string; // "The Hours Collection" — the small label above the volume
  palette?: string; // section theme token (default "monsoon")
  customPalette?: { surface: string; ink: string }; // custom section colours (overrides the token)
  groups: HourGroup[];
  nextVolume?: {
    volume: string;
    title: string;
    story: string; // "For evenings. For whispers. For the spaces closest to you."
    closing: string; // "Coming in the next volume."
    cta: string; // "Available Soon"
  };
}

export const AIR_VOLUMES: AirVolume[] = [
  {
    slug: "the-everyday",
    volume: "Volume I",
    title: "The Everyday",
    tagline: "The unnoticed moments that shape a day.",
    cover: "gradient:grad-air",
    isComingSoon: false,
    groups: [
      {
        kind: "room",
        label: "Shared Hours",
        title: "The Room",
        note: "The atmosphere a room makes for itself.",
        hours: [
          {
            id: "open-window",
            time: "09:20",
            moment: "Air After First Light",
            name: "Open Window",
            story: "Air after the first light.",
            hourReason: "The air a room makes for itself, before you wake.",
            hourStory:
              "You didn't wake up early on purpose.\n\nMaybe the light.\nMaybe the distant bicycle.\nMaybe someone already living the day before you.\n\nThe room feels different.\n\nThe window is open.\n\nFor a moment,\nthe air doesn't belong to yesterday anymore.",
            scentEffect: "Warm. Slightly addictive. Familiar — like the room reset itself before you woke up.",
            productDetails: "A room mist spray. A fine fragrance blend. Size: 100 ml. Made in India.",
            scent: ["Green Paan Leaf", "Tonka Warmth", "Dry Amber Woods"],
            feels: ["A room that aired itself before you woke up."],
            experience: "A fine mist that diffuses gently. Built to linger without overwhelming. Designed for air, not surfaces.",
            placement: [
              { label: "Near open windows", note: "" },
              { label: "Morning routines you didn't plan", note: "" },
              { label: "Rooms that need a reset", note: "" },
            ],
            signature: "Best experienced at 09:20.",
            productSlug: "open-window",
            priceLabel: "From ₹599",
            price: 599,
            palette: "morning-blue",
            gradient: "gradient:grad-air",
            interlude: "The morning arrives quietly.",
          },
          {
            id: "slow-evening",
            time: "18:40",
            moment: "The Day Loosens",
            name: "Slow Evening",
            story: "The day loosens its grip. Nothing urgent remains.",
            hourReason: "The hour the day finally forgets to hurry.",
            hourStory:
              "You said you'll just sit for 5 minutes. That was a while ago.\n\nThe lights are still off. Not intentionally. You just didn't feel like turning them on.\n\nYour phone is somewhere. You're not ignoring it. You just don't care enough to check.\n\nThere's something you were supposed to finish today. You remember it. You also decide it can wait.\n\nThe room feels softer now. Like everything sharp about the day has worn off.\n\nEven time feels slower. Or maybe you finally are.",
            scentEffect: "Soft. Comforting. Slightly indulgent — like sitting down for five minutes and losing track of time.",
            productDetails: "A room mist spray. A fine fragrance blend. Size: 100 ml. Made in India.",
            scent: ["Ripe Fig Flesh", "Brown Sugar Warmth", "Soft Amber & Sandalwood"],
            feels: ["Sitting down for five minutes and not getting up for forty."],
            experience: "A fine mist designed to settle into the room slowly. Soft sweetness meets warm woods, creating a scent that stays close and lingers without heaviness. It doesn't fill the space instantly — it builds, softens, and becomes part of it.",
            placement: [
              { label: "Evenings with no plans", note: "" },
              { label: "Post-work silence", note: "" },
              { label: "The chair you always end up in", note: "" },
              { label: "Moments when nothing feels urgent", note: "" },
            ],
            signature: "Best experienced when you stop trying to be productive.",
            productSlug: "slow-evening",
            priceLabel: "From ₹599",
            price: 599,
            palette: "amber-hour",
            gradient: "gradient:grad-chai",
          },
        ],
      },
      {
        kind: "linen",
        label: "Private Hours",
        title: "The Linen",
        note: "For linen, for fabric, for the hours that ask for nothing.",
        hours: [
          {
            id: "fresh-fold",
            time: "07:10",
            moment: "Before the Day Begins",
            name: "Fresh Fold",
            story: "Stillness before the day begins.",
            hourReason: "The clean quiet of fresh linen, before the day starts.",
            hourStory:
              "You don't rush this part.\n\nThe sheets are still slightly warm. Not hot — just enough to notice.\n\nYou shake them once, maybe twice. More than needed, less than intentional.\n\nThere's that clean smell. Not sharp. Not soapy. Just… right.\n\nFor a moment, you don't put them away.\n\nYou just stand there holding them, like you're not in a hurry to start the day yet.",
            scentEffect: "Clean. Quiet. Settled — like fresh linen that makes you slow down for no reason.",
            productDetails: "A linen mist. A fine fragrance blend. Size: 100 ml. Fabric-safe formulation. Made in India.",
            scent: ["White Tea Air", "Creamy Sandalwood", "Soft Amber Warmth"],
            feels: ["Pulling freshly dried sheets and holding them for a second longer."],
            experience: "A fine mist designed for fabric and close spaces. Soft musks and woods blend into the fibers, creating a scent that feels part of the linen — not on top of it. Light, airy, and gently lingering.",
            placement: [
              { label: "Freshly made beds", note: "" },
              { label: "Wardrobes and folded stacks", note: "" },
              { label: "Slow mornings before the day begins", note: "" },
            ],
            signature: "Best experienced just before the day starts.",
            productSlug: "fresh-fold",
            priceLabel: "From ₹599",
            price: 599,
            palette: "sand",
            gradient: "gradient:grad-air",
            interlude: "Linen holds the quiet.",
          },
          {
            id: "after-lights",
            time: "23:30",
            moment: "When Everything Quiets",
            name: "After Lights",
            story: "When everything finally quiets down.",
            hourReason: "The hour the day asks nothing more from you.",
            hourStory:
              "The lights are off. Not because you're sleepy — just because the day is done.\n\nThere's no more scrolling. No more 'one last thing.'\n\nYou lie down, not thinking about tomorrow yet.\n\nThe room feels different in the dark. Quieter. Softer. Less demanding.\n\nFor once, nothing is waiting for you.\n\nAnd you don't rush to fill the silence.",
            scentEffect: "Warm. Close. Unrushed — like the moment after everything finally goes quiet.",
            productDetails: "A linen mist. A fine fragrance blend. Size: 100 ml. Fabric-safe formulation. Made in India.",
            scent: ["Tonka Warmth", "Soft Sandalwood", "Smooth Woody Musks"],
            feels: ["The moment after the lights go off and nothing else is expected."],
            experience: "A soft, intimate mist that settles into fabric and stays close. Warm woods and musks create a cocoon-like scent that lingers gently through the night. Designed to be felt, not announced.",
            placement: [
              { label: "Bed linens and pillows", note: "" },
              { label: "Night routines", note: "" },
              { label: "The last moment before sleep", note: "" },
            ],
            signature: "Best experienced when the day asks nothing more from you.",
            productSlug: "after-lights",
            priceLabel: "From ₹599",
            price: 599,
            palette: "deep-indigo",
            gradient: "gradient:grad-amethyst",
          },
        ],
      },
    ],
    nextVolume: {
      volume: "Volume II",
      title: "The Intimate",
      story: "For evenings. For whispers. For the spaces closest to you.",
      closing: "Coming in the next volume.",
      cta: "Available Soon",
    },
  },
];

/** Air numbering — "VOL. I.1" (the hour's position across the whole volume),
 *  the Hours equivalent of the candle "NO. I.1" edition. */
export function airEditionOf(volume: AirVolume, productSlug: string): string {
  const allHours = volume.groups.flatMap((g) => g.hours);
  const idx = allHours.findIndex((h) => h.productSlug === productSlug);
  return `${volume.volume.replace(/volume/i, "Vol.").toUpperCase()}.${Math.max(0, idx) + 1}`;
}

/** The product-type key for an Hour's group (room → room_spray, linen → linen_spray). */
export function airProductType(kind: HourGroupKind): "room_spray" | "linen_spray" {
  return kind === "room" ? "room_spray" : "linen_spray";
}

/** Visible volumes. */
export function getAirVolumes(): AirVolume[] {
  return AIR_VOLUMES.filter((v) => !v.isComingSoon);
}

export function getAirVolume(slug: string): AirVolume | undefined {
  return AIR_VOLUMES.find((v) => v.slug === slug);
}

/** Resolve a single Hour (an air "product") by its productSlug, with its volume
 *  and group — the temporary data source for the Air PDP until real air products
 *  exist. The PDP UI + builder are identical, so the source can swap later. */
export function getHourBySlug(
  productSlug: string,
): { hour: HourEntry; group: HourGroup; volume: AirVolume } | undefined {
  for (const volume of AIR_VOLUMES) {
    for (const group of volume.groups) {
      const hour = group.hours.find((h) => h.productSlug === productSlug);
      if (hour) return { hour, group, volume };
    }
  }
  return undefined;
}
