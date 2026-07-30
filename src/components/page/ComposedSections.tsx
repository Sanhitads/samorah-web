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
import { ContentBlocks } from "@/components/home/ContentBlocks";
import { getActiveCampaign, type HeroCampaign } from "@/config/campaigns";
import { getBrandStory, type BrandStory as BrandStoryType } from "@/config/brandStory";
import { getHomeInvitations, type HomeInvitation } from "@/config/invitations";
import { getEditorialVoice, type EditorialVoice } from "@/config/voices";
import { getLettersInvitation, type LettersInvitation } from "@/config/letters";
import type { ComposedSection } from "@/services/pageComposerService";
import { chaptersFromSettings, experiencesFromSettings, editorialFromSettings } from "@/lib/homepageSections";
import { sectionScheduleOk } from "@/lib/cms/sectionState";

const sstr = (v: unknown) => (typeof v === "string" && v.trim() ? (v as string) : undefined);

/**
 * Shared composed-page renderer — the type→component registry + content resolution
 * used by EVERY composed page (homepage, about, …). Object-based sections merge DB
 * settings over their config baseline; list-based sections render catalogue data.
 * A new page type reuses these sections for free — no new rendering code.
 */
export function ComposedSections({ sections, anchors = false }: { sections: ComposedSection[]; anchors?: boolean }) {
  const campaign = getActiveCampaign();
  const voice = getEditorialVoice(campaign.id);
  const merged = <T,>(base: T, s: ComposedSection): T => ({ ...base, ...((s.settings ?? {}) as Partial<T>) });

  const REGISTRY: Record<string, (s: ComposedSection) => ReactNode> = {
    hero: (s) => <Hero campaign={merged(campaign, s) as HeroCampaign} />,
    chapters: (s) => <SignatureChapters chapters={chaptersFromSettings(s)} label={sstr(s.settings.label) || undefined} heading={sstr(s.settings.heading) || undefined} sub={sstr(s.settings.sub) || undefined} />,
    "brand-story": (s) => <BrandStory story={merged(getBrandStory(), s) as BrandStoryType} />,
    atmosphere: (s) => <Atmosphere experiences={experiencesFromSettings(s, campaign.id)} heading={sstr(s.settings.heading) || undefined} />,
    invitations: (s) => {
      const items = Array.isArray(s.settings?.items) && (s.settings.items as unknown[]).length ? (s.settings.items as HomeInvitation[]) : getHomeInvitations(campaign.id);
      return <Invitations invitations={items} />;
    },
    words: (s) => (voice ? <Words voice={merged(voice, s) as EditorialVoice} /> : null),
    "editorial-world": (s) => <EditorialWorld stories={editorialFromSettings(s, campaign.id)} />,
    letters: (s) => <TheLetters invitation={merged(getLettersInvitation(campaign.id), s) as LettersInvitation} />,
    testimonials: (s) => <Testimonials content={(s.settings ?? {}) as TestimonialsContent} />,
    "content-blocks": (s) => <ContentBlocks eyebrow={sstr(s.settings.eyebrow)} blocks={Array.isArray(s.settings.blocks) ? (s.settings.blocks as Record<string, unknown>[]) : []} align={sstr(s.settings.align)} />,
  };

  // `anchors` (preview only): wrap each section in a scroll-target so the builder's live preview can
  // scroll/flash a section (editor→preview) and report clicks back (preview→editor). The storefront
  // renders the bare Fragment exactly as before — no wrapper, no DOM/layout change.
  return (
    <>
      {sections.filter((s) => s.enabled && sectionScheduleOk(s.settings) && REGISTRY[s.type]).map((s) =>
        anchors ? (
          <div key={s.id} id={s.id} data-preview-section={s.id} className="cs-anchor">{REGISTRY[s.type](s)}</div>
        ) : (
          <Fragment key={s.id}>{REGISTRY[s.type](s)}</Fragment>
        ),
      )}
    </>
  );
}
