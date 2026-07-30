import { Reveal } from "@/components/ui/Reveal";
import { ChapterRail } from "@/components/chapters/ChapterRail";
import type { HomeChapter } from "@/config/chapters";

/**
 * Signature Chapters (Phase 7 · Section 2) — the editorial library.
 *
 * Homepage-specific intro + the reusable Editorial Chapter Rail. Each Chapter is
 * a story to enter, not a product to choose. If there are no visible chapters,
 * the whole section hides gracefully (no broken/empty container).
 */
export function SignatureChapters({ chapters, label, heading, sub }: { chapters: HomeChapter[]; label?: string; heading?: string; sub?: string }) {
  if (chapters.length === 0) return null;

  return (
    <section className="home-chapters">
      <Reveal className="home-chapters__intro">
        <p className="home-chapters__label">{label ?? "Samorah Collections"}</p>
        <h2 className="home-chapters__heading">{heading ?? "The Signature Chapters"}</h2>
        <p className="home-chapters__sub">
          {sub ?? "A fragrance library composed through atmosphere, ritual and memory."}
        </p>
      </Reveal>

      <ChapterRail chapters={chapters} ariaLabel="Signature chapters" />
    </section>
  );
}
