import { Link } from 'react-router-dom'
import collections from '../data/collections.json'
import ScrollReveal from '../components/ScrollReveal'

export default function Collections() {
  return (
    <>
      <div className="page-hero page-hero--dark" style={{ minHeight: '50vh' }}>
        <span className="page-hero__label">Samorah</span>
        <h1 className="page-hero__title">The Signature<br />Chapters</h1>
        <p className="page-hero__sub">A fragrance library composed through atmosphere, ritual and memory.</p>
      </div>

      <div className="collections-grid">
        {collections.map((col, i) => (
          <ScrollReveal key={col.id} delay={i * 80}>
            <Link
              to={col.comingSoon ? '#' : `/collections/${col.slug}`}
              className="collection-entry"
              style={{ pointerEvents: col.comingSoon ? 'none' : 'auto' }}
            >
              <div className={`collection-entry__bg img-fill ${col.gradClass}`} />
              <div className="collection-entry__overlay" />
              <div className="collection-entry__content">
                <p className="collection-entry__volume">{col.volume}</p>
                <h2 className="collection-entry__name">{col.name}</h2>
                <p className="collection-entry__tagline">{col.tagline}</p>
                {col.comingSoon ? (
                  <span style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                    Coming Soon
                  </span>
                ) : (
                  <span className="text-link text-link-light">
                    Discover Collection
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                )}
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </>
  )
}
