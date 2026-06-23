import { useState } from 'react'
import ScrollReveal from '../components/ScrollReveal'

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

const candleSteps = [
  { n: '01', title: 'Trim before you light.', text: 'Trim the wick to 5mm before every burn. This prevents mushrooming and ensures a clean, smoke-free flame.' },
  { n: '02', title: 'First burn matters.', text: 'Allow the wax to pool to the edges on the first burn (usually 2–3 hours). This prevents tunnelling and ensures a longer, even life.' },
  { n: '03', title: 'Four hours maximum.', text: 'Never burn longer than 4 hours at a time. The vessel gets hot. So do you. Rest it, and yourself.' },
  { n: '04', title: 'Know when to stop.', text: 'Discontinue use when 10mm of wax remains. This protects the vessel and prevents overheating.' },
]

export default function ProductCare() {
  return (
    <>
      <div className="page-hero page-hero--dark">
        <span className="page-hero__label">Ritual</span>
        <h1 className="page-hero__title">Care &amp;<br />Safety</h1>
        <p className="page-hero__sub">How to live well with a Samorah candle.</p>
      </div>

      {/* Candle Ritual */}
      <div style={{ padding: '80px 48px' }}>
        <ScrollReveal>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span className="micro-label" style={{ marginBottom: 12, display: 'block' }}>The Candle Ritual</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px,2.5vw,40px)' }}>
              Four steps to a perfect flame.
            </h2>
          </div>
        </ScrollReveal>
        <div className="ritual-steps">
          {candleSteps.map((s, i) => (
            <ScrollReveal key={s.n} delay={i * 80} className="ritual-step">
              <p className="ritual-step__number">{s.n}</p>
              <h3 className="ritual-step__title">{s.title}</h3>
              <p className="ritual-step__text">{s.text}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>

      {/* Image break */}
      <div style={{ height: 360 }}>
        <div className="img-fill grad-dark" />
      </div>

      {/* Safety accordion */}
      <div style={{ padding: '80px 48px', maxWidth: 720, margin: '0 auto' }}>
        <ScrollReveal>
          <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Safety</span>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, marginBottom: 32 }}>Safety Guidelines</h2>
        </ScrollReveal>
        <div className="accordion">
          <Accordion title="General Candle Safety">
            <p>Never leave a burning candle unattended. Keep away from flammable materials, drafts, and children. Always burn on a heat-resistant surface. Extinguish carefully — do not blow out.</p>
          </Accordion>
          <Accordion title="Vessel Care">
            <p>The vessel gets warm during burning — handle with care. Once the candle is finished, clean the vessel with warm water and repurpose. Our ceramic and terracotta vessels are designed to last a lifetime.</p>
          </Accordion>
          <Accordion title="Fragrance Safety">
            <p>All Samorah fragrances are phthalate-free and IFRA compliant. If you have fragrance sensitivities, begin with a 30-minute burn test in a ventilated room. Discontinue if you experience discomfort.</p>
          </Accordion>
          <Accordion title="Storage">
            <p>Store candles away from direct sunlight and heat. Exposure to light can alter fragrance composition over time. Keep the lid on when not in use.</p>
          </Accordion>
        </div>
      </div>

      {/* Room Spray section */}
      <div style={{ background: 'var(--soft-beige)', padding: '80px 48px' }}>
        <ScrollReveal>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span className="micro-label" style={{ marginBottom: 12, display: 'block' }}>Room &amp; Linen Sprays</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px,2.5vw,40px)' }}>
              The Spray Ritual
            </h2>
          </div>
        </ScrollReveal>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="accordion">
            <Accordion title="How to Use Room Spray">
              <p>Hold the bottle 30–40cm from the surface. Spray 2–3 times into the centre of the room, not directly onto furniture. Allow 60 seconds to diffuse. Repeat as desired.</p>
            </Accordion>
            <Accordion title="How to Use Linen Spray">
              <p>Spray lightly onto bedding, pillows or curtains from a distance of 40cm. Allow to dry before contact. Do not spray directly on silk or delicate fabrics.</p>
            </Accordion>
            <Accordion title="Room Spray Safety">
              <p>Keep away from eyes and face. Do not spray near open flames. Store in a cool, dark place. Not for internal use.</p>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Closing */}
      <div style={{ padding: '60px 48px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'clamp(18px,2vw,28px)', color: 'var(--charcoal)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
          "A ritual is only as good as the attention you bring to it."
        </p>
      </div>
    </>
  )
}
