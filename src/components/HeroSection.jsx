import { Link } from 'react-router-dom'

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="hero__text-side">
        <span className="hero__label">Samorah — A Fragrance Story</span>
        <h1 className="hero__heading">
          Light a flame.<br />
          <em>Begin a story.</em>
        </h1>
        <p className="hero__paragraph">
          Luxury handmade scented candles composed through atmosphere, ritual and memory.
          Each collection is a chapter — layered, intentional, deeply felt.
        </p>
        <Link to="/collections" className="btn btn-dark">
          Explore Collections
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <div className="hero__image-side">
        <div className="img-fill grad-chai" style={{ height: '100%' }} />
        <div className="hero__scroll-indicator" style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <div className="hero__scroll-line" />
          <span>Scroll</span>
        </div>
      </div>
    </section>
  )
}
