import { Fragment, type ReactNode } from "react";
import { cookies } from "next/headers";
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
import { getHomepageSections, type SectionType } from "@/services/homepageService";
import { requireStaff } from "@/lib/auth/requireStaff";

/**
 * Homepage (Phase 7 → CMS slice 4). Composition — which sections show, in what
 * order — is now DB-driven via the Homepage Builder (getHomepageSections), with a
 * config-default fallback. Each section's editorial DATA still comes from config
 * (campaign-driven); the builder controls order + enabled + per-section settings.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const campaign = getActiveCampaign();

  // Section registry — maps a section type to its rendered component + data.
  const REGISTRY: Record<SectionType, () => ReactNode> = {
    hero: () => <Hero campaign={campaign} />,
    chapters: () => <SignatureChapters chapters={getVisibleChapters()} />,
    "brand-story": () => <BrandStory story={getBrandStory()} />,
    atmosphere: () => <Atmosphere experiences={getFeaturedExperiences(campaign.id)} />,
    invitations: () => <Invitations invitations={getHomeInvitations(campaign.id)} />,
    words: () => <Words voice={getEditorialVoice(campaign.id)} />,
    "editorial-world": () => <EditorialWorld stories={getEditorialWorld(campaign.id)} />,
    letters: () => <TheLetters invitation={getLettersInvitation(campaign.id)} />,
  };

  // Staff-gated draft preview (review point 3, same pattern as navigation).
  let preview = false;
  const jar = await cookies();
  if (jar.get("hp_preview")) preview = (await requireStaff("editor")).ok;

  const sections = await getHomepageSections({ preview });

  return (
    <main>
      {preview ? <div className="store-notice" role="status" style={{ background: "#8a3d2f", color: "#fff" }}>Previewing draft homepage — not live.</div> : null}
      {sections.filter((s) => s.enabled && REGISTRY[s.type]).map((s) => (
        <Fragment key={s.id}>{REGISTRY[s.type]()}</Fragment>
      ))}
    </main>
  );
}
