import type { ReactNode } from "react";
import type { SectionInstance } from "@/platform/section";
import { AssetImage } from "@/components/ui/AssetImage";
import { Reveal } from "@/components/ui/Reveal";

/**
 * SectionShell (§16) — the one wrapper that applies a section's envelope, so
 * each section component only renders its content. Sets the theme token (which
 * paints `--surface`/`--ink` via the generated theme CSS), spacing, the optional
 * background asset, the reveal animation and the anchor id. Server component;
 * the reveal is a client island only when animation is requested.
 */
export function SectionShell({
  section,
  children,
}: {
  section: SectionInstance;
  children: ReactNode;
}) {
  const {
    id,
    themeToken,
    editorialMood,
    spacing = "lg",
    animation = "none",
    background,
  } = section;

  const bg = typeof background === "string" ? background : undefined;
  const animated = animation !== "none";

  return (
    <section
      id={id || undefined}
      className="section-shell"
      data-theme={themeToken || undefined}
      data-mood={editorialMood || undefined}
      data-spacing={spacing}
    >
      {bg ? (
        <div className="section-shell__bg" aria-hidden="true">
          <AssetImage asset={bg} as="background" />
        </div>
      ) : null}

      {animated ? (
        <Reveal className="section-shell__inner">{children}</Reveal>
      ) : (
        <div className="section-shell__inner">{children}</div>
      )}
    </section>
  );
}
