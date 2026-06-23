import ScrollReveal from './ScrollReveal'

const atmItems = [
  { gradClass: 'grad-atm1', label: 'Kashmiri Chai — candlelight' },
  { gradClass: 'grad-atm2', label: 'Midnight Amethyst — ritual' },
  { gradClass: 'grad-atm3', label: 'Wild Within — forest floor' },
  { gradClass: 'grad-atm4', label: 'Crimson Velvet — evening' },
  { gradClass: 'grad-atm5', label: 'Golden Citrine — golden hour' },
  { gradClass: 'grad-atm6', label: 'Samorah Blush — dawn' },
]

export default function AtmosphereGrid() {
  return (
    <section className="atmosphere section-sm">
      <ScrollReveal className="atmosphere-intro">
        <span className="micro-label">Samorah Atmosphere</span>
        <h2>Inside The World Of Samorah</h2>
      </ScrollReveal>

      <div className="atmosphere-grid">
        {atmItems.map((item, i) => (
          <div key={i} className="atmosphere-grid__item">
            <div className={`img-fill ${item.gradClass}`} style={{ height: '100%', minHeight: 200 }} />
          </div>
        ))}
      </div>
    </section>
  )
}
