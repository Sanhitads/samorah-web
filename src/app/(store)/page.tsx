import { Hero } from "@/components/home/Hero";
import { SignatureChapters } from "@/components/home/SignatureChapters";
import { BrandStory } from "@/components/home/BrandStory";
import { Atmosphere } from "@/components/home/Atmosphere";
import { Invitations } from "@/components/home/Invitations";
import { Words } from "@/components/home/Words";
import { EditorialWorld } from "@/components/home/EditorialWorld";
import { TheLetters } from "@/components/home/TheLetters";
import { getActiveCampaign } from "@/config/campaigns";
import { getVisibleChapters } from "@/config/chapters";
import { getBrandStory } from "@/config/brandStory";
import { getFeaturedExperiences } from "@/config/experiences";
import { getHomeInvitations } from "@/config/invitations";
import { getEditorialVoice } from "@/config/voices";
import { getEditorialWorld } from "@/config/editorialWorld";
import { getLettersInvitation } from "@/config/letters";

/**
 * Homepage (Phase 7) — one editorial journey, built one beat at a time.
 *   1. Hero  ✓  (campaign-driven — the active campaign is selected here)
 *   2. Signature Chapters  ✓  (reusable Editorial Chapter Rail)
 *   3. Brand Story  ✓  (the maker's quiet — no UI title; CMS-ready spread)
 *   4. The Atmosphere  ✓  (the signature section — inhabit one fragrance-world
 *      at a time; product-agnostic, campaign-aware)
 *   5. Living with fragrance  ✓  (two ways of living as one editorial spread)
 *   6. Words  ✓  (the Editorial Voice — one literary sentence, titleless)
 *   7. Editorial World  ✓  (the final magazine spread — the life Samorah belongs
 *      in; campaign-driven, titleless)
 *   8. The Letters  ✓  (the quietest editorial close — invitation, not capture;
 *      UI only, backend in Phase 14) → then the dark footer.
 *   (The old "Featured Product" is dropped — §4 fulfils that role editorially.)
 */
export default function HomePage() {
  const campaign = getActiveCampaign();
  const chapters = getVisibleChapters();
  const story = getBrandStory();
  const experiences = getFeaturedExperiences(campaign.id);
  const invitations = getHomeInvitations(campaign.id);
  const voice = getEditorialVoice(campaign.id);
  const world = getEditorialWorld(campaign.id);
  const letters = getLettersInvitation(campaign.id);

  return (
    <main>
      <Hero campaign={campaign} />
      <SignatureChapters chapters={chapters} />
      <BrandStory story={story} />
      <Atmosphere experiences={experiences} />
      <Invitations invitations={invitations} />
      <Words voice={voice} />
      <EditorialWorld stories={world} />
      <TheLetters invitation={letters} />
    </main>
  );
}
