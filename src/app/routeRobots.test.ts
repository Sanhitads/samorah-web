import { describe, it, expect } from "vitest";
import type { Metadata } from "next";

// Preview tools — noindex, nofollow (SEO Phase 6).
import { metadata as pdpPreview } from "@/app/pdp-preview/layout";
import { metadata as chapterPreview } from "@/app/chapter-preview/layout";
import { metadata as candlePreview } from "@/app/candle-preview/layout";
import { metadata as candleChapterPreview } from "@/app/candle-chapter-preview/layout";
import { metadata as homepagePreview } from "@/app/homepage-preview/layout";
// Auth / personal-utility pages — noindex, follow.
import { metadata as login } from "@/app/login/layout";
import { metadata as register } from "@/app/register/layout";
import { metadata as wishlist } from "@/app/(store)/wishlist/layout";

const robots = (m: Metadata) => m.robots as { index?: boolean; follow?: boolean };

describe("indexing hygiene — preview tools are noindex,nofollow (all environments)", () => {
  const previews: [string, Metadata][] = [
    ["pdp-preview", pdpPreview],
    ["chapter-preview", chapterPreview],
    ["candle-preview", candlePreview],
    ["candle-chapter-preview", candleChapterPreview],
    ["homepage-preview", homepagePreview],
  ];
  for (const [name, m] of previews) {
    it(`${name} is noindex, nofollow`, () => {
      expect(robots(m).index).toBe(false);
      expect(robots(m).follow).toBe(false);
    });
  }
});

describe("indexing hygiene — login/register/wishlist are noindex, follow", () => {
  const utility: [string, Metadata][] = [
    ["login", login],
    ["register", register],
    ["wishlist", wishlist],
  ];
  for (const [name, m] of utility) {
    it(`${name} is noindex but follow remains`, () => {
      expect(robots(m).index).toBe(false);
      expect(robots(m).follow).toBe(true);
    });
  }
});
