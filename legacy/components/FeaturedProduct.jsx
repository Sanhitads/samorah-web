import { Link } from 'react-router-dom'
import products from '../data/products.json'
import ScrollReveal from './ScrollReveal'

export default function FeaturedProduct() {
  const product = products.find(p => p.hero) || products[0]

  return (
    <section className="featured-product section">
      <div className="container">
        <div className="featured-product__inner">
          <ScrollReveal>
            <div className="featured-product__image">
              <div className={`img-fill ${product.gradClass}`} />
            </div>
          </ScrollReveal>

          <ScrollReveal delay={150}>
            <p className="featured-product__label micro-label">Hero Candle</p>
            <h2 className="featured-product__name">{product.name}</h2>
            <p className="featured-product__tagline">{product.tagline}</p>
            <p className="featured-product__story">{product.story}</p>

            <div className="featured-product__notes">
              {[
                { label: 'Opening', notes: product.fragranceNotes.top },
                { label: 'Heart', notes: product.fragranceNotes.heart },
                { label: 'Base', notes: product.fragranceNotes.base },
              ].map(row => (
                <div key={row.label} className="featured-product__note">
                  <span className="featured-product__note-label">{row.label}</span>
                  <span className="featured-product__note-pills">{row.notes.join(' · ')}</span>
                </div>
              ))}
            </div>

            <p className="featured-product__price">₹{product.price.toLocaleString('en-IN')}</p>

            <Link to={`/product/${product.slug}`} className="btn btn-dark">
              Discover This Candle
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
