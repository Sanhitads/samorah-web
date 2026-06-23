import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import products from '../data/products.json'
import ScrollReveal from '../components/ScrollReveal'
import ProductCard from '../components/ProductCard'
import { useCart } from '../context/CartContext'

function Accordion({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`accordion__item ${open ? 'open' : ''}`}>
      <button className="accordion__header" onClick={() => setOpen(!open)}>
        {title}
        <span className="accordion__icon">+</span>
      </button>
      <div className="accordion__body">
        <div className="accordion__content">{children}</div>
      </div>
    </div>
  )
}

export default function ProductDetail() {
  const { slug } = useParams()
  const product = products.find(p => p.slug === slug)
  const [selectedVessel, setSelectedVessel] = useState(0)
  const [selectedSize, setSelectedSize] = useState(1)
  const [added, setAdded] = useState(false)
  const { addItem } = useCart()

  if (!product) return (
    <div style={{ padding: '160px 48px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 36 }}>Product not found.</h2>
      <Link to="/collections" className="text-link" style={{ marginTop: 24, display: 'inline-block' }}>Back to Collections</Link>
    </div>
  )

  const related = products.filter(p => p.chapter === product.chapter && p.id !== product.id).slice(0, 3)

  const handleAddToCart = () => {
    addItem(product, product.vessel[selectedVessel], product.sizes[selectedSize])
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ padding: '16px 48px', borderBottom: '1px solid var(--beige)', fontSize: 12, color: 'var(--muted)', letterSpacing: '0.05em' }}>
        <Link to="/">Home</Link>
        <span style={{ margin: '0 8px' }}>·</span>
        <Link to="/collections">{product.chapterName}</Link>
        <span style={{ margin: '0 8px' }}>·</span>
        <span>{product.name}</span>
      </div>

      {/* Product layout */}
      <div className="product-detail">
        <div className="product-detail__layout">
          {/* Images */}
          <div className="product-detail__images">
            <div className="product-detail__main-image">
              <div className={`img-fill ${product.gradClass}`} style={{ height: '100%' }} />
            </div>
            <div className="product-detail__thumbs">
              {[0,1,2,3].map(i => (
                <div key={i} className={`product-detail__thumb ${i === 0 ? 'active' : ''}`}>
                  <div className={`img-fill ${product.gradClass}`} style={{ opacity: i === 0 ? 1 : 0.5 + i * 0.1 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="product-detail__info">
            <p className="product-detail__chapter">{product.chapterName}</p>
            <h1 className="product-detail__name">{product.name}</h1>
            <p className="product-detail__tagline">{product.tagline}</p>
            <span className="product-detail__scent-group">{product.scentGroup}</span>

            <p className="product-detail__price">₹{product.price.toLocaleString('en-IN')}</p>

            {/* Vessel */}
            <div className="product-detail__variants">
              <p className="variant-label">Vessel</p>
              <div className="variant-options">
                {product.vessel.map((v, i) => (
                  <button
                    key={v}
                    className={`variant-option ${selectedVessel === i ? 'selected' : ''}`}
                    onClick={() => setSelectedVessel(i)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div className="product-detail__variants">
              <p className="variant-label">Size</p>
              <div className="variant-options">
                {product.sizes.map((s, i) => (
                  <button
                    key={s}
                    className={`variant-option ${selectedSize === i ? 'selected' : ''}`}
                    onClick={() => setSelectedSize(i)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* ATC */}
            <div className="product-detail__atc">
              <button className="atc-btn" onClick={handleAddToCart}>
                {added ? '✓ Added to Cart' : 'Add to Cart'}
              </button>
            </div>

            {/* Quick details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid var(--beige)' }}>
              {[
                { label: 'Burn Time', val: product.burnTime },
                { label: 'Wax', val: product.waxBlend },
                { label: 'Wick', val: product.wick },
                { label: 'Theme', val: product.theme },
              ].map(d => (
                <div key={d.label} style={{ display: 'flex', gap: 20 }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', minWidth: 80 }}>{d.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--charcoal)' }}>{d.val}</span>
                </div>
              ))}
            </div>

            {/* Accordion */}
            <div className="accordion">
              <Accordion title="The Story Within">
                <p>{product.storyLong || product.story}</p>
              </Accordion>
              <Accordion title="Candle Care + Safety">
                <p>Trim wick to 5mm before each use. Never leave burning unattended. Keep away from flammable materials. Burn for no more than 4 hours at a time. Discontinue use when 10mm of wax remains.</p>
              </Accordion>
              <Accordion title="Shipping & Exchanges">
                <p>Orders are dispatched within 2–3 business days. Free shipping on orders over ₹1000. Returns accepted within 48 hours of delivery for damaged or incorrect items.</p>
              </Accordion>
              <Accordion title="Ingredients & Materials">
                <p>Wax: Premium soy-coconut blend. Wick: 100% cotton, lead-free. Fragrance: Phthalate-free compounds, IFRA compliant. Vessel: {product.vessel.join(' / ')}.</p>
              </Accordion>
            </div>
          </div>
        </div>
      </div>

      {/* Fragrance Journey */}
      <div className="fragrance-journey section-sm" style={{ margin: '0 48px', marginBottom: 80 }}>
        <ScrollReveal>
          <p className="micro-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'block' }}>Fragrance Pyramid</p>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px,2.5vw,40px)', color: 'var(--ivory)', marginBottom: 8 }}>
            Fragrance Journey
          </h2>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'rgba(250,247,242,0.5)', maxWidth: 480, lineHeight: 1.8 }}>
            Each composition is layered to evolve — opening in brightness, settling into warmth, and lingering as atmosphere.
          </p>
        </ScrollReveal>

        <div className="fragrance-notes-display">
          {[
            { label: 'Top Notes', notes: product.fragranceNotes.top },
            { label: 'Heart Notes', notes: product.fragranceNotes.heart },
            { label: 'Base Notes', notes: product.fragranceNotes.base },
          ].map((col, i) => (
            <div key={col.label} className="fn-column">
              <p className="fn-column__label">{col.label}</p>
              <div className="fn-column__notes">
                {col.notes.map(n => (
                  <span key={n} className="fn-column__note">{n}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scent Mood */}
      <div style={{ padding: '64px 48px', background: 'var(--soft-beige)', marginBottom: 80 }}>
        <ScrollReveal>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
            <div>
              <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Scent Mood</span>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px,2.5vw,40px)', marginBottom: 16 }}>
                {product.flamePersona}
              </h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
                {product.moodTags.map(t => (
                  <span key={t} style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', border: '1px solid var(--beige)', padding: '5px 14px', color: 'var(--charcoal)' }}>
                    {t}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: 14, color: 'var(--smoke)', lineHeight: 1.9 }}>{product.lifestyleUse}</p>
            </div>
            <div>
              <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Cultural Reference</span>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.7, color: 'var(--charcoal)' }}>
                {product.culturalReference}
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div style={{ padding: '80px 48px' }}>
          <div style={{ marginBottom: 48, textAlign: 'center' }}>
            <span className="micro-label" style={{ marginBottom: 12, display: 'block' }}>You May Also Like</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px,2.5vw,40px)' }}>
              More From This Chapter
            </h2>
          </div>
          <div className="product-grid">
            {related.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </>
  )
}
