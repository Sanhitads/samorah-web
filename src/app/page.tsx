// Temporary Phase 1 landing — confirms the Next.js foundation, design tokens,
// and fonts are wired. The real homepage migration begins at Phase 7.
export default function HomePage() {
  return (
    <main className="container" style={{ paddingBlock: "120px" }}>
      <p className="micro-label" style={{ color: "var(--gold)" }}>
        Phase 1 · Foundation
      </p>
      <h1 style={{ fontSize: "clamp(40px, 6vw, 84px)", margin: "16px 0 24px" }}>
        Samorah
      </h1>
      <p style={{ color: "var(--smoke)", maxWidth: 480, lineHeight: 1.9 }}>
        The Next.js 15 + Supabase platform foundation is live. Design tokens,
        typography, and fonts are ported from the prototype. Storefront
        migration begins at Phase 6.
      </p>
      <div style={{ marginTop: 40, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span className="btn btn-dark">Cormorant Garamond + DM Sans</span>
        <span className="btn btn-outline">Warm ivory · Gold</span>
      </div>
    </main>
  );
}
