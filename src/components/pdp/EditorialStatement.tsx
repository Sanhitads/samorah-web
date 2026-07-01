import { ParallaxMedia } from "@/components/ui/ParallaxMedia";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { EditorialStatementSettings } from "@/lib/productEditorial";

/**
 * EditorialStatement (block) — a large editorial paragraph beside one image,
 * or full-width text when `align: "none"`. The reusable "Story Within" /
 * "The Experience" beat. Themed by SectionShell.
 */
export function EditorialStatement({ settings }: SectionComponentProps) {
  const s = settings as unknown as EditorialStatementSettings;
  if (!s.body?.length) return null;
  const withMedia = Boolean(s.media?.src) && s.align !== "none";

  return (
    <div className="estatement" data-align={withMedia ? s.align : "none"}>
      {withMedia ? (
        <div className="estatement__media">
          <ParallaxMedia src={s.media!.src} alt={s.media!.alt ?? ""} role="lifestyle" imageClassName="estatement__image" range={22} />
        </div>
      ) : null}
      <div className="estatement__body">
        {s.eyebrow ? <p className="estatement__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="estatement__heading">{s.heading}</h2> : null}
        {s.body.map((p, i) => (
          <p key={i} className="estatement__para">{p}</p>
        ))}
      </div>
    </div>
  );
}
