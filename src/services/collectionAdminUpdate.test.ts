import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * updateCollection must survive an environment where a late CMS migration hasn't been applied
 * yet (e.g. `seo_canonical` absent). The resilient retry must strip ONLY the missing column and
 * preserve every other CMS field — regression guard: a blanket strip silently wiped chapter_content
 * (section headings / poetic lines / editorial) on every save, which read as "saved" but persisted
 * nothing. See src/services/collectionAdminService.ts updateCollection().
 */
let attempts: Record<string, unknown>[];
// Columns the fake DB pretends are missing → any update carrying one fails with a schema error
// until it's stripped, mirroring PostgREST PGRST204.
let missingColumns: string[];
const resetState = () => { attempts = []; missingColumns = []; };
resetState();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          attempts.push({ ...row });
          const offender = missingColumns.find((c) => c in row);
          if (offender) {
            return Promise.resolve({ error: { message: `Could not find the '${offender}' column of 'collections' in the schema cache` } });
          }
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));
vi.mock("@/services/auditService", () => ({ logEvent: vi.fn(async () => {}) }));

import { updateCollection } from "@/services/collectionAdminService";

const fullInput = {
  name: "Nature Chapter",
  intro: "Scents inspired by the outdoors.",
  poeticLine: "The smells you notice when you step outside.",
  seoCanonical: "https://samorahstudio.com/chapters/nature-chapter",
  chapterContent: { labels: { restHeading: "Also in this chapter", introLine: "A collection built around nature.", quoteLine: "The wild has its own smell." } },
};

describe("updateCollection — resilient CMS-column strip", () => {
  beforeEach(() => resetState());

  it("persists chapter_content when seo_canonical column is missing (strips ONLY the offender)", async () => {
    missingColumns = ["seo_canonical"]; // remote DB before the migration
    const res = await updateCollection("col-1", fullInput);
    expect(res.ok).toBe(true);

    // Two attempts: first carries seo_canonical (fails), retry has it removed and succeeds.
    expect(attempts.length).toBe(2);
    const succeeded = attempts[attempts.length - 1];

    // The offending column is gone…
    expect("seo_canonical" in succeeded).toBe(false);
    // …but the editorial content the user actually edited is preserved.
    expect(succeeded.chapter_content).toEqual(fullInput.chapterContent);
    expect(succeeded.intro).toBe(fullInput.intro);
    expect(succeeded.poetic_line).toBe(fullInput.poeticLine);
  });

  it("writes every CMS column when all exist (no strip, single attempt)", async () => {
    missingColumns = [];
    const res = await updateCollection("col-1", fullInput);
    expect(res.ok).toBe(true);
    expect(attempts.length).toBe(1);
    expect(attempts[0].seo_canonical).toBe(fullInput.seoCanonical);
    expect(attempts[0].chapter_content).toEqual(fullInput.chapterContent);
  });

  it("still converges (and preserves the rest) if two later columns are missing", async () => {
    missingColumns = ["seo_canonical", "chapter_content"]; // both absent
    const res = await updateCollection("col-1", fullInput);
    expect(res.ok).toBe(true);
    const succeeded = attempts[attempts.length - 1];
    expect("seo_canonical" in succeeded).toBe(false);
    expect("chapter_content" in succeeded).toBe(false);
    // intro / poetic_line are unaffected — never blanket-dropped.
    expect(succeeded.intro).toBe(fullInput.intro);
    expect(succeeded.poetic_line).toBe(fullInput.poeticLine);
  });
});
