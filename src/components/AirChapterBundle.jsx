import { Link } from 'react-router-dom'

export default function AirChapterBundle() {
  return (
    <section className="air-bundle">
      <Link to="/shop/room-sprays" className="air-bundle__block" style={{ display: 'flex' }}>
        <div className={`img-fill grad-air`} style={{ position: 'absolute', inset: 0 }} />
        <div className="air-bundle__block-overlay" />
        <div className="air-bundle__content">
          <p className="air-bundle__label">The Hours Collection</p>
          <h3 className="air-bundle__title">
            Air Chapter<br />Room &amp; Linen Sprays
          </h3>
          <p className="air-bundle__sub">
            Atmospheric. Light. Spatial. Airy.<br />
            The unnoticed moments that shape a day.
          </p>
          <span className="text-link text-link-light">
            Explore Air Chapter
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </Link>

      <Link to="/bundles" className="air-bundle__block" style={{ display: 'flex' }}>
        <div className={`img-fill grad-bundle`} style={{ position: 'absolute', inset: 0 }} />
        <div className="air-bundle__block-overlay" />
        <div className="air-bundle__content">
          <p className="air-bundle__label">Curated Atmospheres</p>
          <h3 className="air-bundle__title">
            The Ritual Set
          </h3>
          <p className="air-bundle__sub">
            Warmer. Richer. Gift-like. Layered.<br />
            Build your own signature bundle.
          </p>
          <span className="text-link text-link-light">
            Build Your Bundle
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </Link>
    </section>
  )
}
