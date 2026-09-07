import { describe, it, expect } from "vitest";
import { parseTestimonialQuote as p } from "@/lib/testimonialAttribution";

describe("parseTestimonialQuote — lift the attribution onto its own line", () => {
  it("dash-led final line → name is split out of the quote", () => {
    expect(p({ quote: "It blends really well with the sandalwood and vanilla.\n- Rajeev, Mumbai" }))
      .toEqual({ text: "It blends really well with the sandalwood and vanilla.", attr: "Rajeev, Mumbai" });
  });

  it("short final line without a dash → treated as the attribution", () => {
    expect(p({ quote: "Warm without being too much. I can smell the cardamom.\nSumit, Kolkata" }))
      .toEqual({ text: "Warm without being too much. I can smell the cardamom.", attr: "Sumit, Kolkata" });
  });

  it("inline ' - Name' after the final stop → split", () => {
    expect(p({ quote: "Bought this for my husband. - Nupur, Lucknow" }))
      .toEqual({ text: "Bought this for my husband.", attr: "Nupur, Lucknow" });
  });

  it("em-dash and en-dash are handled the same as a hyphen", () => {
    expect(p({ quote: "A quiet, lovely scent.\n— Aditi" })).toEqual({ text: "A quiet, lovely scent.", attr: "Aditi" });
    expect(p({ quote: "A quiet, lovely scent.\n– Aditi" })).toEqual({ text: "A quiet, lovely scent.", attr: "Aditi" });
  });

  it("the Attribution field always wins and its leading dash is stripped", () => {
    expect(p({ quote: "A lovely candle.", attribution: "- Aditi, Mumbai" }))
      .toEqual({ text: "A lovely candle.", attr: "Aditi, Mumbai" });
  });

  it("a genuine multi-sentence quote is NOT mis-split (last line ends with punctuation)", () => {
    expect(p({ quote: "Line one of a quote.\nLine two ends here." }))
      .toEqual({ text: "Line one of a quote.\nLine two ends here." });
  });

  it("a plain single-line quote with no name is returned untouched", () => {
    expect(p({ quote: "Just a plain quote with no name." })).toEqual({ text: "Just a plain quote with no name." });
  });

  it("a long final line (not a name) is left in the quote", () => {
    const q = "First thought.\nThis final line is far too long to be read as a person's name or place.";
    expect(p({ quote: q })).toEqual({ text: q });
  });
});
