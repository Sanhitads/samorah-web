import { describe, it, expect } from "vitest";
import { buildAirVolumeFromDb } from "@/lib/airFromProduct";
import { airEditionLabel } from "@/config/theHours";

/* eslint-disable @typescript-eslint/no-explicit-any */

const col = { slug: "the-everyday", name: "The Everyday", volume: "Volume I", air_chapter: {} };
const product = (slug: string, name: string, type: string, chapter_position: string) => ({
  id: slug, slug, name, product_type: type, chapter_position,
  air_content: { time: "07:00" }, price: 599, tagline: "", product_images: [],
});

describe("air collection page — VOL. number follows the admin's chapter_position", () => {
  const vol = buildAirVolumeFromDb(
    col as any,
    [product("open-window", "Open Window", "room_spray", "2"), product("fresh-fold", "Fresh Fold", "linen_spray", "1")],
    undefined,
  )!;
  const hour = (slug: string) => vol.groups.flatMap((g) => g.hours).find((h) => h.productSlug === slug)!;

  it("carries the DB chapter_position onto each hour", () => {
    expect(hour("open-window").chapterPosition).toBe("2");
    expect(hour("fresh-fold").chapterPosition).toBe("1");
  });

  it("resolves the edition to VOL. I.<position>, not the config array index", () => {
    expect(airEditionLabel(vol, hour("open-window").chapterPosition, "open-window")).toBe("VOL. I.2");
    expect(airEditionLabel(vol, hour("fresh-fold").chapterPosition, "fresh-fold")).toBe("VOL. I.1");
  });
});
