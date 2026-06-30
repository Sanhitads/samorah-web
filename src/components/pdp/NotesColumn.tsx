import type { SectionComponentProps } from "@/components/sections/registry";
import type { NotesColumnSettings } from "@/lib/productEditorial";

/**
 * NotesColumn (block) — the scent notes in large type, stacked like a list, not
 * pills. The "Smells Like" beat. Reusable for any scent's note column.
 */
export function NotesColumn({ settings }: SectionComponentProps) {
  const s = settings as unknown as NotesColumnSettings;
  if (!s.notes?.length) return null;

  return (
    <div className="notes-column">
      <div className="notes-column__head">
        {s.eyebrow ? <p className="notes-column__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="notes-column__heading">{s.heading}</h2> : null}
      </div>
      <ul className="notes-column__list">
        {s.notes.map((n) => (
          <li key={n} className="notes-column__note">{n}</li>
        ))}
      </ul>
    </div>
  );
}
