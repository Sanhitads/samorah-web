import { Fragment, type JSX } from "react";
import Link from "next/link";
import { ParallaxMedia } from "@/components/ui/ParallaxMedia";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { AirHoursGroupSettings, HourBlockView } from "@/lib/airPage";

/**
 * Hours Group (section type "HoursGroup") — a movement of the Air diary: an
 * editorial header (Shared Hours · "Spaces We Share") then alternating Hour
 * Blocks, with a short interlude quote between them (turning a leaf). Emotion
 * before commerce. Themed by SectionShell. Server component.
 */
export function HoursGroup({ settings }: SectionComponentProps) {
  const s = settings as unknown as AirHoursGroupSettings;
  if (!s.hours?.length) return null;

  const level = s.a11y?.headingLevel ?? 2;
  const Heading = `h${level}` as keyof JSX.IntrinsicElements;
  const blockLevel = Math.min(level + 1, 6) as 3 | 4 | 5 | 6;

  return (
    <section className="hours-group" data-kind={s.kind} aria-label={s.title}>
      <div className="hours-group__head">
        <p className="hours-group__label">{s.label}</p>
        <Heading className="hours-group__title">{s.title}</Heading>
        {s.note ? <p className="hours-group__note">{s.note}</p> : null}
      </div>

      <div className="hours-group__blocks">
        {s.hours.map((hour) => (
          <Fragment key={hour.name}>
            <HourBlock hour={hour} headingLevel={blockLevel} />
            {hour.interlude ? (
              <p className="hours-interlude">
                <span className="hours-interlude__rule" aria-hidden="true" />
                <span className="hours-interlude__quote">“{hour.interlude}”</span>
                <span className="hours-interlude__rule" aria-hidden="true" />
              </p>
            ) : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function HourBlock({ hour, headingLevel }: { hour: HourBlockView; headingLevel: 3 | 4 | 5 | 6 }) {
  const H = `h${headingLevel}` as keyof JSX.IntrinsicElements;
  return (
    <article className="hour-block" data-align={hour.align}>
      <Link href={hour.href} className="hour-block__media" aria-hidden="true" tabIndex={-1}>
        <ParallaxMedia src={hour.media.src} alt={hour.media.alt ?? hour.name} imageClassName="hour-block__image" />
      </Link>
      <div className="hour-block__body">
        <p className="hour-block__hour">{hour.hourLabel}</p>
        {hour.edition ? <p className="hour-block__edition">{hour.edition}</p> : null}
        {hour.moment ? <p className="hour-block__moment">{hour.moment}</p> : null}
        <H className="hour-block__name">{hour.name}</H>
        <p className="hour-block__category">{hour.category}</p>
        <ul className="hour-block__scent">
          {hour.scent.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="hour-block__story">{hour.story}</p>
        <p className="hour-block__price">{hour.priceLabel}</p>
        <Link href={hour.href} className="hour-block__cta">
          Discover
        </Link>
      </div>
    </article>
  );
}
