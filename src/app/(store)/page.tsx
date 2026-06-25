import { Hero } from "@/components/home/Hero";
import { getActiveCampaign } from "@/config/campaigns";

/**
 * Homepage (Phase 7) — one editorial journey, built one beat at a time.
 *   1. Hero  ✓  (campaign-driven — the active campaign is selected here)
 *   2. Signature Chapters · 3. Brand Story · 4. Scent Experience ·
 *   5. Air + Bundle · 6. Featured Product · 7. Testimonial ·
 *   8. Atmosphere Grid · 9. Newsletter   (added section by section)
 */
export default function HomePage() {
  const campaign = getActiveCampaign();

  return (
    <main>
      <Hero campaign={campaign} />
    </main>
  );
}
