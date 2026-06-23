import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import collections from '../data/collections.json'
import ScrollReveal from './ScrollReveal'

export default function SignatureChapters() {
  const [active, setActive] = useState(0)
  const sliderRef = useRef(null)
  const dragStart = useRef(null)

  const handleMouseDown = (e) => {
    dragStart.current = { x: e.clientX, scrollLeft: sliderRef.current.scrollLeft }
    sliderRef.current.classList.add('grabbing')
  }

  const handleMouseMove = (e) => {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    sliderRef.current.scrollLeft = dragStart.current.scrollLeft - dx
  }

  const handleMouseUp = () => {
    dragStart.current = null
    sliderRef.current?.classList.remove('grabbing')
  }

  return (
    <section className="chapters-section">
      <ScrollReveal className="chapters-intro">
        <span className="micro-label">Samorah Collections</span>
        <h2>The Signature Chapters</h2>
        <p>A fragrance library composed through atmosphere, ritual and memory.</p>
      </ScrollReveal>

      <div className="chapters-slider-wrap">
        <div
          className="chapters-slider"
          ref={sliderRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {collections.map((col, i) => (
            <div
              key={col.id}
              className={`chapter-card ${col.comingSoon ? 'chapter-card--coming' : ''}`}
            >
              <div className="chapter-card__image">
                <div className={`img-fill ${col.gradClass}`} />
                <div className="chapter-card__overlay" />
              </div>
              <div className="chapter-card__info">
                <p className="chapter-card__volume">{col.volume}</p>
                <h3 className="chapter-card__name">{col.name}</h3>
                <p className="chapter-card__tagline">{col.tagline}</p>
                {!col.comingSoon ? (
                  <Link
                    to={`/collections/${col.slug}`}
                    className="chapter-card__link"
                    onClick={e => e.stopPropagation()}
                  >
                    Discover
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                ) : (
                  <span style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                    Coming Soon
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="slider-nav">
        {collections.map((_, i) => (
          <button
            key={i}
            className={`slider-dot ${active === i ? 'active' : ''}`}
            onClick={() => {
              setActive(i)
              const card = sliderRef.current?.children[i]
              card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
            }}
          />
        ))}
      </div>
    </section>
  )
}
