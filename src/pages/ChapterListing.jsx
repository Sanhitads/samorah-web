import { useParams, Link } from 'react-router-dom'
import collections from '../data/collections.json'
import products from '../data/products.json'
import ProductCard from '../components/ProductCard'
import ScrollReveal from '../components/ScrollReveal'

export default function ChapterListing() {
  const { slug } = useParams()
  const col = collections.find(c => c.slug === slug)

  if (!col) return (
    <div style={{ padding: '160px 48px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 36 }}>Chapter not found.</h2>
      <Link to="/collections" className="text-link" style={{ marginTop: 24, display: 'inline-block' }}>
        View All Collections
      </Link>
    </div>
  )

  const heroProduct = products.find(p => p.id === col.heroCandle)
  const supportProducts = col.products
    .filter(id => id !== col.heroCandle)
    .map(id => products.find(p => p.id === id))
    .filter(Boolean)

  if (col.comingSoon) return (
    <div className="chapter-listing-hero" style={{ minHeight: '80vh', justifyContent: 'center', alignItems: 'center' }}>
      <div className={`img-fill ${col.gradClass}`} style={{ position: 'absolute', inset: 0 }} />
      <div className="chapter-hero__overlay" />
      <div className="chapter-hero-content" style={{ textAlign: 'center' }}>
        <span className="micro-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'block' }}>{col.volume}</span>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px,5vw,72px)', color: 'var(--ivory)', marginBottom: 16, lineHeight: 1.1 }}>
          {col.name}
        </h1>
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'rgba(250,247,242,0.6)', marginBottom: 32 }}>
          {col.poeticLine}
        </p>
        <span style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(250,247,242,0.5)' }}>
          Coming Soon
        </span>
      </div>
    </div>
  )

  return (
    <>
      {/* Hero */}
      <div className="chapter-listing-hero" style={{ position: 'relative' }}>
        <div className={`img-fill ${col.gradClass}`} style={{ position: 'absolute', inset: 0 }} />
        <div className="chapter-hero__overlay" />
        <div className="chapter-hero-content">
          <span className="micro-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'block' }}>{col.volume}</span>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px,5vw,72px)', color: 'var(--ivory)', marginBottom: 12, lineHeight: 1.1 }}>
            {col.name}
          </h1>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'rgba(250,247,242,0.65)', marginBottom: 32, lineHeight: 1.6 }}>
            {col.poeticLine}
          </p>
          <Link to={`/product/${col.heroCandle}`} className="btn btn-ghost">
            Discover Collection
          </Link>
        </div>
      </div>

      {/* Featured candle */}
      {heroProduct && (
        <div className="chapter-featured">
          <ScrollReveal>
            <div className="chapter-featured__image">
              <div className={`img-fill ${heroProduct.gradClass}`} style={{ height: '100%' }} />
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Signature Fragrance</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,3vw,48px)', marginBottom: 8 }}>
              {heroProduct.name}
            </h2>
            <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--smoke)', marginBottom: 24 }}>
              {heroProduct.tagline}
            </p>
            <p style={{ fontSize: 15, color: 'var(--smoke)', lineHeight: 1.9, marginBottom: 32 }}>
              {heroProduct.story}
            </p>
            <div style={{ marginBottom: 32 }}>
              {[
                { label: 'Opening', notes: heroProduct.fragranceNotes.top },
                { label: 'Heart', notes: heroProduct.fragranceNotes.heart },
                { label: 'Base', notes: heroProduct.fragranceNotes.base },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', gap: 16, alignItems: 'baseline', marginBottom: 10 }}>
                  <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', minWidth: 60 }}>{r.label}</span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--charcoal)' }}>{r.notes.join(' · ')}</span>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, marginBottom: 28 }}>₹{heroProduct.price.toLocaleString('en-IN')}</p>
            <Link to={`/product/${heroProduct.slug}`} className="btn btn-dark">
              Shop {heroProduct.name}
            </Link>
          </ScrollReveal>
        </div>
      )}

      {/* Supporting grid */}
      {supportProducts.length > 0 && (
        <div style={{ padding: '4px' }}>
          <div style={{ padding: '48px', textAlign: 'center', paddingBottom: 32 }}>
            <span className="micro-label" style={{ marginBottom: 12, display: 'block' }}>Also In This Chapter</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px,2.5vw,40px)' }}>
              Supporting Fragrances
            </h2>
          </div>
          <div className="chapter-support-grid">
            {supportProducts.map(p => (
              <Link key={p.id} to={`/product/${p.slug}`} className="chapter-support-item">
                <div className={`img-fill ${p.gradClass}`} style={{ position: 'absolute', inset: 0 }} />
                <div className="chapter-support-item__overlay" />
                <div className="chapter-support-item__content">
                  <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>
                    {p.scentGroup}
                  </p>
                  <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, marginBottom: 6, lineHeight: 1.2 }}>
                    {p.name}
                  </h3>
                  <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, opacity: 0.6 }}>
                    {p.tagline}
                  </p>
                  <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginTop: 12 }}>
                    ₹{p.price.toLocaleString('en-IN')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {col.products.length === 0 && !heroProduct && (
        <div style={{ padding: '80px 48px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--smoke)' }}>
            {col.description}
          </p>
        </div>
      )}
    </>
  )
}
