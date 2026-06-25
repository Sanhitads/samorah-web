import { Hero } from "@/components/home/Hero";
import { SignatureChapters } from "@/components/home/SignatureChapters";
import { BrandStory } from "@/components/home/BrandStory";
import { getActiveCampaign } from "@/config/campaigns";
import { getVisibleChapters } from "@/config/chapters";
import { getBrandStory } from "@/config/brandStory";

/**
 * Homepage (Phase 7) — one editorial journey, built one beat at a time.
 *   1. Hero  ✓  (campaign-driven — the active campaign is selected here)
 *   2. Signature Chapters  ✓  (reusable Editorial Chapter Rail)
 *   3. Brand Story  ✓  (the maker's quiet — no UI title; CMS-ready spread)
 *   4. Scent Experience · 5. Air + Bundle · 6. Featured Product ·
 *   7. Testimonial · 8. Atmosphere Grid · 9. Newsletter   (added section by section)
 */
export default function HomePage() {
  const campaign = getActiveCampaign();
  const chapters = getVisibleChapters();
  const story = getBrandStory();

  return (
    <main>
      <Hero campaign={campaign} />
      <SignatureChapters chapters={chapters} />
      <BrandStory story={story} />
    </main>
  );
}
