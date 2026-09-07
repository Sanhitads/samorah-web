// Resolve a testimonial into its spoken text + who said it. Pure + framework-free so it is unit-testable
// and shared by the PDP Testimonials block. The Attribution field wins; when it's blank we lift a trailing
// "— Name" / "- Name" (its own line, inline after the final stop, or a short final line with no sentence
// punctuation) out of the quote — so the name renders on its own line, never inside the quotation marks
// and never as a stray hyphen mid-sentence. A genuine multi-sentence quote is left intact.

export interface RawTestimonial {
  quote: string;
  attribution?: string;
}

export function parseTestimonialQuote(q: RawTestimonial): { text: string; attr?: string } {
  const strip = (s: string) => s.replace(/^[\s\-—–]+/, "").trim();
  const attribution = q.attribution?.trim();
  if (attribution) return { text: q.quote.trim(), attr: strip(attribution) || undefined };
  const raw = q.quote.trim();
  const byLine = raw.match(/^([\s\S]+?)\n\s*[-—–]\s*(.+)$/); // dash-led final line (the usual way people type it)
  if (byLine && byLine[1].trim()) return { text: byLine[1].trim(), attr: strip(byLine[2]) };
  const inline = raw.match(/^(.+?[.!?"'”’])\s+[-—–]\s+([^-\n]{2,50})$/); // short "— Name" on the same line
  if (inline) return { text: inline[1].trim(), attr: strip(inline[2]) };
  // A short final line with no sentence-ending punctuation reads as the attribution (a name / place).
  const lines = raw.split(/\n/);
  if (lines.length >= 2) {
    const last = lines[lines.length - 1].trim();
    const head = lines.slice(0, -1).join("\n").trim();
    if (head && last.length >= 2 && last.length <= 40 && !/[.!?"”’]$/.test(last)) return { text: head, attr: strip(last) };
  }
  return { text: raw };
}
