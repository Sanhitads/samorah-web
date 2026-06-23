import fragrances from '../data/fragrances.json'
import ScrollReveal from './ScrollReveal'

export default function ScentExperience() {
  return (
    <section className="scent-experience">
      <div className="container">
        <ScrollReveal className="scent-intro">
          <span className="micro-label" style={{ color: 'var(--gold)' }}>The Fragrance Experience</span>
          <h2>The Fragrance Experience</h2>
          <p>Each composition is layered to evolve slowly — opening in brightness, settling into warmth, and lingering as atmosphere.</p>
        </ScrollReveal>

        <div className="scent-grid">
          {fragrances.map((f, i) => (
            <ScrollReveal key={f.id} delay={i * 100}>
              <div className="scent-card">
                <p className="scent-card__family">Fragrance Family</p>
                <h3 className="scent-card__name">{f.name}</h3>
                <p className="scent-card__tagline">{f.tagline}</p>

                <div className="scent-notes">
                  <div>
                    <p className="scent-note__label">Opening</p>
                    <div className="scent-note__pills">
                      {f.notes.opening.map(n => (
                        <span key={n} className="scent-note__pill">{n}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="scent-note__label">Heart</p>
                    <div className="scent-note__pills">
                      {f.notes.heart.map(n => (
                        <span key={n} className="scent-note__pill">{n}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="scent-note__label">Base</p>
                    <div className="scent-note__pills">
                      {f.notes.base.map(n => (
                        <span key={n} className="scent-note__pill">{n}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="scent-card__inspired">
                  Inspired by: <span>{f.inspiredBy}</span>
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
