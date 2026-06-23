import { Link } from 'react-router-dom'
import ScrollReveal from './ScrollReveal'

export default function BrandStory() {
  return (
    <section className="brand-story">
      <div className="brand-story__image">
        <div className="img-fill grad-story" />
      </div>

      <div className="brand-story__content">
        <ScrollReveal>
          <span className="micro-label brand-story__label">Our Philosophy</span>
          <h2 className="brand-story__heading">
            Scent as a form of<br />
            <em>memory-keeping.</em>
          </h2>
          <p className="brand-story__text">
            Samorah was born from a simple conviction — that fragrance is not decoration.
            It is documentation. Every candle we compose is an attempt to preserve something
            ephemeral: the warmth of a winter morning, the electricity of a summer storm,
            the quiet of a room after laughter has left.
          </p>
          <p className="brand-story__text">
            We source premium soy-coconut wax, 100% cotton wicks, and fragrance compounds
            built layer by layer — top notes that greet you, heart notes that hold you,
            base notes that linger long after the flame fades.
          </p>
          <div className="brand-story__cta">
            <Link to="/about/our-story" className="text-link">
              Read Our Story
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
