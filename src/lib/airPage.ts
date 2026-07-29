/**
 * Air Volume Page builder (Experience B — "The Hours") — turns an `AirVolume`
 * (config) into a platform `Page` composed from AIR_HOURS_TEMPLATE. Same engines
 * as the chapter builder; reuses the Hero contract + the native Divider, adds
 * the HoursGroup + FutureVolume settings. Pure (no I/O).
 */
import type { Page } from "@/platform/page";
import type { SectionInstance } from "@/platform/section";
import type { SeoMeta } from "@/platform/content";
import { airEditionOf, type AirVolume, type HourGroup, type HourGroupKind } from "@/config/theHours";
import type { ChapterHeroSettings } from "@/lib/chapterPage";
import {
  imageMedia,
  type A11yMeta,
  type MediaContent,
} from "@/lib/presentation";

// ── Section view-models the Air components read ──────────────────────────────

export type HourAlign = "image-left" | "image-right";

export interface HourBlockView {
  hourLabel: string; // "HOUR 07:00"
  edition: string; // "VOL. I.1"
  moment: string; // "Morning Begins"
  name: string;
  category: string; // "Room Spray" · "Linen Spray"
  scent: string[]; // the "smells like" notes
  story: string; // the "feels like" line
  media: MediaContent;
  priceLabel: string;
  href: string;
  align: HourAlign; // alternates across the whole volume
  interlude?: string; // a short quote rendered after this block
}

export interface AirHoursGroupSettings {
  kind: HourGroupKind;
  label: string; // eyebrow — "Shared Hours"
  title: string; // editorial — "Spaces We Share"
  note: string;
  hours: HourBlockView[];
  a11y: A11yMeta;
}

export interface AirFutureVolumeSettings {
  eyebrow: string; // "Next Volume"
  volume: string;
  title: string;
  story: string;
  closing: string;
  cta: string;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

const categoryOf = (kind: HourGroupKind) => (kind === "room" ? "Room Spray" : "Linen Spray");

function toHourBlock(
  h: HourGroup["hours"][number],
  globalIndex: number,
  kind: HourGroupKind,
  volume: AirVolume,
): HourBlockView {
  return {
    hourLabel: `HOUR ${h.time}`,
    edition: airEditionOf(volume, h.productSlug),
    moment: h.moment,
    name: h.name,
    category: categoryOf(kind),
    scent: h.scent,
    story: h.story,
    media: imageMedia(h.cardImage ?? h.gradient, h.name, "landscape"),
    priceLabel: h.priceLabel,
    href: `/shop/${h.productSlug}`,
    // alternate Image-Left / Image-Right continuously across the volume
    align: globalIndex % 2 === 0 ? "image-left" : "image-right",
    interlude: h.interlude,
  };
}

function toGroupSettings(group: HourGroup, startIndex: number, volume: AirVolume): AirHoursGroupSettings {
  return {
    kind: group.kind,
    label: group.label,
    title: group.title,
    note: group.note,
    hours: group.hours.map((h, i) => toHourBlock(h, startIndex + i, group.kind, volume)),
    a11y: { headingLevel: 2, landmark: "region" },
  };
}

/** Only the fields a page override changes — omits type/variant/order so
 *  composeSections keeps the template's values. */
function fill(id: string, settings: object, extra: Partial<SectionInstance> = {}): SectionInstance {
  return { id, settings: settings as Record<string, unknown>, ...extra } as SectionInstance;
}

function buildSeo(vol: AirVolume): SeoMeta {
  return {
    title: `The Hours · ${vol.volume} — ${vol.title} · Samorah`,
    description: vol.tagline,
    ogImage: vol.cover.startsWith("gradient:") ? undefined : vol.cover,
    twitterCard: "summary_large_image",
  };
}

// ── The builder ──────────────────────────────────────────────────────────────

export function buildAirVolumePage(vol: AirVolume): Page {
  const room = vol.groups.find((g) => g.kind === "room");
  const linen = vol.groups.find((g) => g.kind === "linen");

  const hero: ChapterHeroSettings = {
    volume: vol.volume,
    title: vol.title,
    tagline: vol.tagline,
    poeticLine: null,
    breadcrumb: vol.heroEyebrow || "The Hours Collection",
    media: imageMedia(vol.cover, `${vol.title} — The Hours`, "cinematic"),
    overlay: "gradient",
    layout: "immersive",
    readingTime: 1,
    identity: {},
    a11y: { headingLevel: 1, landmark: "region" },
    emptyStrategy: "placeholder",
  };

  const future: AirFutureVolumeSettings | null = vol.nextVolume
    ? {
        eyebrow: "Next Volume",
        volume: vol.nextVolume.volume,
        title: vol.nextVolume.title,
        story: vol.nextVolume.story,
        closing: vol.nextVolume.closing,
        cta: vol.nextVolume.cta,
      }
    : null;

  const roomCount = room?.hours.length ?? 0;
  const sections: SectionInstance[] = [
    fill("hero", hero, { trackingId: "air:hero" }),
    fill("hours-room", room ? toGroupSettings(room, 0, vol) : {}, {
      visibility: Boolean(room?.hours.length),
      trackingId: "air:room",
    }),
    // a quiet hairline between the groups — turning the page (no label; the
    // group headers carry the names)
    fill("hours-divider", {}, { visibility: Boolean(linen?.hours.length) }),
    fill("hours-linen", linen ? toGroupSettings(linen, roomCount, vol) : {}, {
      visibility: Boolean(linen?.hours.length),
      trackingId: "air:linen",
    }),
    fill("future-volume", future ?? {}, { visibility: Boolean(future) }),
  ];

  return {
    id: `air-${vol.slug}`,
    experienceId: "air-chapters",
    slug: vol.slug,
    template: "air-hours",
    status: "published",
    visibility: !vol.isComingSoon,
    // Section theme — a custom palette uses an unregistered token so no preset rule overrides the
    // inline --surface/--ink the route injects; otherwise the chosen preset (default monsoon).
    palette: vol.customPalette?.surface ? "air-custom" : vol.palette || "monsoon",
    navigation: { chapter: vol.slug },
    seo: buildSeo(vol),
    breadcrumb: [
      { label: "Home", href: "/" },
      { label: `The Hours · ${vol.title}`, href: `/collections/${vol.slug}` },
    ],
    events: {
      emits: ["viewed", "cta", "completed"],
      scrollDepths: [25, 50, 75, 100],
      trackingId: `air:${vol.slug}`,
    },
    manifest: { displayName: `The Hours — ${vol.title}`, purpose: "air-volume", owner: "editorial" },
    sections,
  };
}
