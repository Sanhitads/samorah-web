import { useState } from 'react'
import products from '../data/products.json'
import ScrollReveal from '../components/ScrollReveal'
import { useCart } from '../context/CartContext'

const BUNDLE_SIZE = 3
const BUNDLE_PRICE = 1597
const REGULAR_VALUE = 2097
const SAVING = REGULAR_VALUE - BUNDLE_PRICE

const filters = ['All', 'Ceramic', 'Glass', 'Terracotta']

export default function Bundle() {
  const [selected, setSelected] = useState([])
  const [activeFilter, setActiveFilter] = useState('All')
  const [bundleAdded, setBundleAdded] = useState(false)
  const { addItem } = useCart()

  const filteredProducts = activeFilter === 'All'
    ? products
    : products.filter(p => p.vessel.includes(activeFilter))

  const toggleSelect = (product) => {
    const isSelected = selected.find(s => s.id === product.id)
    if (isSelected) {
      setSelected(selected.filter(s => s.id !== product.id))
    } else if (selected.length < BUNDLE_SIZE) {
      setSelected([...selected, product])
    }
  }

  const isComplete = selected.length === BUNDLE_SIZE

  const statusText = () => {
    if (selected.length === 0) return 'Select 2–3 candles to create your signature bundle'
    if (selected.length === 1) return '1 more candle required'
    if (selected.length === 2) return 'Ready to Add to Cart'
    return 'Curated Bundle Ready'
  }

  return (
    <>
      <div className="bundle-hero">
        <div className="img-fill grad-bundle" style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, color: 'var(--ivory)' }}>
          <span className="micro-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'block' }}>Curated Atmospheres</span>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(36px,4vw,64px)', marginBottom: 12, lineHeight: 1.1 }}>
            Build Your<br />Collection
          </h1>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, opacity: 0.7, maxWidth: 400, lineHeight: 1.6 }}>
            Choose any 2–3 candles and save ₹{SAVING}. A composition as personal as the rooms you live in.
          </p>
        </div>
      </div>

      <div className="bundle-split">
        {/* Left - Products */}
        <div className="bundle-left">
          <ScrollReveal>
            <div className="bundle-filters">
              {filters.map(f => (
                <button
                  key={f}
                  className={`bundle-filter ${activeFilter === f ? 'active' : ''}`}
                  onClick={() => setActiveFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </ScrollReveal>

          <div className="bundle-items">
            {filteredProducts.map(product => {
              const isSelected = selected.find(s => s.id === product.id)
              const isDisabled = isComplete && !isSelected

              return (
                <ScrollReveal key={product.id}>
                  <div className="bundle-item">
                    <div className="bundle-item__img">
                      <div className={`img-fill ${product.gradClass}`} />
                    </div>
                    <div>
                      <h3 className="bundle-item__name">{product.name}</h3>
                      <p className="bundle-item__notes">
                        {[...product.fragranceNotes.top.slice(0,2), ...product.fragranceNotes.base.slice(0,1)].join(' · ')}
                      </p>
                      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 15, marginTop: 6, color: 'var(--charcoal)' }}>
                        ₹{product.price.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <button
                      className={`bundle-item__btn ${isSelected ? 'added' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => !isDisabled && toggleSelect(product)}
                      disabled={isDisabled}
                    >
                      {isSelected ? 'Composition Complete' : isDisabled ? 'Composition Complete' : '+ Add to Composition'}
                    </button>
                  </div>
                </ScrollReveal>
              )
            })}
          </div>
        </div>

        {/* Right - Composition Panel */}
        <div className="bundle-right">
          <div className="composition-panel">
            <h2 className="composition-panel__title">Your Composition</h2>
            <p className="composition-panel__count">
              {selected.length} / {BUNDLE_SIZE} Selected
            </p>
            <p className="composition-panel__status" style={{ fontStyle: isComplete ? 'italic' : 'normal' }}>
              {statusText()}
            </p>

            {/* Tray */}
            <div className="composition-tray">
              {[0, 1, 2].map(i => (
                <div key={i} className={`tray-slot ${selected[i] ? 'filled' : ''}`}>
                  {selected[i] ? (
                    <div className={`img-fill ${selected[i].gradClass}`} />
                  ) : (
                    <span className="tray-slot__placeholder">+</span>
                  )}
                </div>
              ))}
            </div>

            {/* Items */}
            {selected.length > 0 && (
              <div className="composition-items">
                {selected.map(p => (
                  <div key={p.id} className="composition-item">
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14 }}>{p.name}</span>
                    <span
                      className="composition-item__remove"
                      onClick={() => toggleSelect(p)}
                    >
                      Remove
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="composition-total">
              {selected.length >= 2 && (
                <>
                  <div className="composition-total__row main">
                    <span>Composition Total</span>
                    <span>₹{BUNDLE_PRICE.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="composition-total__row">
                    <span>Regular Value</span>
                    <span>₹{REGULAR_VALUE.toLocaleString('en-IN')}</span>
                  </div>
                  <p className="composition-total__saving">
                    Bundle Saving ₹{SAVING.toLocaleString('en-IN')}
                  </p>
                </>
              )}
            </div>

            <button
              className="atc-btn"
              disabled={selected.length < 2}
              style={{ opacity: selected.length < 2 ? 0.5 : 1, cursor: selected.length < 2 ? 'not-allowed' : 'pointer' }}
              onClick={() => {
                if (selected.length < 2) return
                selected.forEach(p => addItem(p, p.vessel[0], p.sizes[1] || p.sizes[0]))
                setBundleAdded(true)
                setTimeout(() => setBundleAdded(false), 2500)
              }}
            >
              {selected.length < 2
                ? `Select ${2 - selected.length} More`
                : bundleAdded
                ? '✓ Bundle Added to Cart'
                : 'Add Bundle to Cart'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
