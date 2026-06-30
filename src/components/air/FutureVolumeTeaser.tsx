import type { SectionComponentProps } from "@/components/sections/registry";
import type { AirFutureVolumeSettings } from "@/lib/airPage";

/**
 * Future Volume (section type "FutureVolume") — the editorial close: the next
 * volume presented as anticipation, not an unfinished "Coming Soon" banner. A
 * dark inverted band that hands off to the footer. Server component.
 */
function lines(story: string): string[] {
  return story
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function FutureVolumeTeaser({ settings }: SectionComponentProps) {
  const s = settings as unknown as AirFutureVolumeSettings;
  if (!s.volume) return null;

  return (
    <aside className="future-volume" aria-label={`${s.volume} — ${s.title}`}>
      <p className="future-volume__eyebrow">{s.eyebrow}</p>
      <p className="future-volume__volume">{s.volume}</p>
      <h2 className="future-volume__title">{s.title}</h2>
      <p className="future-volume__story">
        {lines(s.story).map((line, i) => (
          <span key={i} className="future-volume__line">
            {line}
          </span>
        ))}
      </p>
      <p className="future-volume__closing">{s.closing}</p>
      <span className="future-volume__cta">{s.cta}</span>
    </aside>
  );
}
