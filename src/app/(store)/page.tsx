import { Hero } from "@/components/home/Hero";
import { SignatureChapters } from "@/components/home/SignatureChapters";
import { BrandStory } from "@/components/home/BrandStory";
import { Atmosphere } from "@/components/home/Atmosphere";
import { getActiveCampaign } from "@/config/campaigns";
import { getVisibleChapters } from "@/config/chapters";
import { getBrandStory } from "@/config/brandStory";
import { getFeaturedExperiences } from "@/config/experiences";

/**
 * Homepage (Phase 7) — one editorial journey, built one beat at a time.
 *   1. Hero  ✓  (campaign-driven — the active campaign is selected here)
 *   2. Signature Chapters  ✓  (reusable Editorial Chapter Rail)
 *   3. Brand Story  ✓  (the maker's quiet — no UI title; CMS-ready spread)
 *   4. The Atmosphere  ✓  (the signature section — inhabit one fragrance-world
 *      at a time; product-agnostic, campaign-aware)
 *   5. Air + Bundle · 6. Featured · 7. Testimonial · 8. Atmosphere Grid ·
 *   9. Newsletter   (added section by section)
 */
export default function HomePage() {
  const campaign = getActiveCampaign();
  const chapters = getVisibleChapters();
  const story = getBrandStory();
  const experiences = getFeaturedExperiences(campaign.id);

  return (
    <main>
      <Hero campaign={campaign} />
      <SignatureChapters chapters={chapters} />
      <BrandStory story={story} />
      <Atmosphere experiences={experiences} />
    </main>
  );
}
