import { Fragment, type ReactNode } from "react";
import { Hero } from "@/components/home/Hero";
import { SignatureChapters } from "@/components/home/SignatureChapters";
import { BrandStory } from "@/components/home/BrandStory";
import { Atmosphere } from "@/components/home/Atmosphere";
import { Invitations } from "@/components/home/Invitations";
import { Words } from "@/components/home/Words";
import { EditorialWorld } from "@/components/home/EditorialWorld";
import { TheLetters } from "@/components/home/TheLetters";
import { Testimonials, type TestimonialsContent } from "@/components/home/Testimonials";
import { getActiveCampaign, type HeroCampaign } from "@/config/campaigns";
import { getVisibleChapters } from "@/config/chapters";
import { getBrandStory, type BrandStory as BrandStoryType } from "@/config/brandStory";
import { getFeaturedExperiences } from "@/config/experiences";
import { getHomeInvitations, type HomeInvitation } from "@/config/invitations";
import { getEditorialVoice, type EditorialVoice } from "@/config/voices";
import { getEditorialWorld } from "@/config/editorialWorld";
import { getLettersInvitation, type LettersInvitation } from "@/config/letters";
import type { ComposedSection } from "@/services/pageComposerService";

/**
 * Shared composed-page renderer — the type→component registry + content resolution
 * used by EVERY composed page (homepage, about, …). Object-based sections merge DB
 * settings over their config baseline; list-based sections render catalogue data.
 * A new page type reuses these sections for free — no new rendering code.
 */
export function ComposedSections({ sections }: { sections: ComposedSection[] }) {
  const campaign = getActiveCampaign();
  const voice = getEditorialVoice(campaign.id);
  const merged = <T,>(base: T, s: ComposedSection): T => ({ ...base, ...((s.settings ?? {}) as Partial<T>) });

  const REGISTRY: Record<string, (s: ComposedSection) => ReactNode> = {
    hero: (s) => <Hero campaign={merged(campaign, s) as HeroCampaign} />,
    chapters: () => <SignatureChapters chapters={getVisibleChapters()} />,
    "brand-story": (s) => <BrandStory story={merged(getBrandStory(), s) as BrandStoryType} />,
    atmosphere: () => <Atmosphere experiences={getFeaturedExperiences(campaign.id)} />,
    invitations: (s) => {
      const items = Array.isArray(s.settings?.items) && (s.settings.items as unknown[]).length ? (s.settings.items as HomeInvitation[]) : getHomeInvitations(campaign.id);
      return <Invitations invitations={items} />;
    },
    words: (s) => (voice ? <Words voice={merged(voice, s) as EditorialVoice} /> : null),
    "editorial-world": () => <EditorialWorld stories={getEditorialWorld(campaign.id)} />,
    letters: (s) => <TheLetters invitation={merged(getLettersInvitation(campaign.id), s) as LettersInvitation} />,
    testimonials: (s) => <Testimonials content={(s.settings ?? {}) as TestimonialsContent} />,
  };

  return (
    <>
      {sections.filter((s) => s.enabled && REGISTRY[s.type]).map((s) => (
        <Fragment key={s.id}>{REGISTRY[s.type](s)}</Fragment>
      ))}
    </>
  );
}
