import ScrollReveal from '../components/ScrollReveal'

const archiveData = [
  {
    volume: 'Vol. III',
    name: 'The Dessert Chapter',
    slug: 'dessert-chapter',
    items: [
      { name: 'Gajar Halwa Delight', released: '2025', archived: '2026', gradClass: 'grad-gajar' },
      { name: 'Modak Noir', released: '2025', archived: '2026', gradClass: 'grad-modak' },
    ],
  },
  {
    volume: 'Vol. I',
    name: 'The Origin Editions',
    slug: 'origin-editions',
    items: [
      { name: 'Midnight Jasmine', released: '2024', archived: '2025', gradClass: 'grad-amethyst' },
      { name: 'Forest Rain', released: '2024', archived: '2025', gradClass: 'grad-wild' },
      { name: 'Amber Dusk', released: '2024', archived: '2025', gradClass: 'grad-chai' },
    ],
  },
]

export default function Archive() {
  return (
    <>
      <div className="page-hero page-hero--dark">
        <span className="page-hero__label">Legacy</span>
        <h1 className="page-hero__title">The Samorah<br />Archive</h1>
        <p className="page-hero__sub">
          Creations that once formed Samorah's active chapter — now preserved as an archive for inspiration and the house's evolving legacy.
        </p>
      </div>

      {archiveData.map((group, gi) => (
        <div key={group.volume} className="archive-group">
          <ScrollReveal>
            <div className="archive-group__header">
              <div>
                <p className="archive-group__volume">{group.volume}</p>
                <h2 className="archive-group__name">{group.name}</h2>
              </div>
              <span style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                {group.items.length} fragrances archived
              </span>
            </div>
          </ScrollReveal>
          <div className="archive-items">
            {group.items.map((item, i) => (
              <ScrollReveal key={item.name} delay={i * 80} className="archive-item">
                <div className="archive-item__image">
                  <div className={`img-fill ${item.gradClass}`} style={{ height: 240 }} />
                </div>
                <p className="archive-item__date">Released {item.released} · Archived {item.archived}</p>
                <h3 className="archive-item__name">{item.name}</h3>
              </ScrollReveal>
            ))}
          </div>
        </div>
      ))}

      {/* Closing note */}
      <div style={{ padding: '80px 48px', textAlign: 'center', background: 'var(--soft-beige)' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'clamp(18px,2vw,28px)', color: 'var(--charcoal)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
          "An archive is not a graveyard. It is a proof of how far we have come."
        </p>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          — Samorah
        </p>
      </div>
    </>
  )
}
