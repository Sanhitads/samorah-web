import { Link } from 'react-router-dom'
import ScrollReveal from '../components/ScrollReveal'

const rooms = [
  {
    hour: 'Hour 01 — 7:00 am',
    name: 'Open Window',
    sub: 'The unnoticed moment of first light filtering through a gap in the curtain. Fresh, airy, quietly expectant.',
    scent: 'Bergamot · White Tea · Morning Dew',
    price: '₹599',
    gradClass: 'grad-air',
    imageLeft: true,
  },
  {
    hour: 'Hour 02 — 2:00 pm',
    name: 'Slow Evening',
    sub: 'The unhurried middle of an afternoon — soft linen, warm light through glass, the sound of nothing in particular.',
    scent: 'Cotton · Iris · Warm Sandalwood',
    price: '₹599',
    gradClass: 'grad-blush',
    imageLeft: false,
  },
  {
    hour: 'Hour 03 — 7:30 pm',
    name: 'After Dinner',
    sub: 'The comfortable haze after a meal — soft conversation, warm lighting, the scent of something good having happened.',
    scent: 'Tonka Bean · Amber · Soft Cedar',
    price: '₹599',
    gradClass: 'grad-chai',
    imageLeft: true,
  },
  {
    hour: 'Hour 04 — 11:00 pm',
    name: 'Private Hours',
    sub: 'The most intimate hour of the day. The one that belongs only to you.',
    scent: 'Lavender · Cashmere · Dark Musk',
    price: '₹599',
    gradClass: 'grad-amethyst',
    imageLeft: false,
  },
]

export default function AirFreshner() {
  return (
    <>
      {/* Hero */}
      <div className="hours-hero" style={{ position: 'relative', background: 'var(--deep-charcoal)' }}>
        <div className="img-fill grad-air" style={{ position: 'absolute', inset: 0, opacity: 0.6 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 30%, transparent 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, color: 'var(--ivory)' }}>
          <span className="micro-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'block' }}>The Hours Collection</span>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px,5vw,72px)', lineHeight: 1.1, marginBottom: 16 }}>
            Volume I<br /><em>The Everyday</em>
          </h1>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, opacity: 0.65, maxWidth: 440, lineHeight: 1.6, marginBottom: 32 }}>
            The unnoticed moments that shape a day.
          </p>
          <span style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', opacity: 0.5 }}>
            ↓ Scroll to Explore
          </span>
        </div>
      </div>

      {/* Hour blocks */}
      <div className="hours-blocks">
        {rooms.map((room, i) => (
          <ScrollReveal key={room.name}>
            <div className={`hours-block ${!room.imageLeft ? 'hours-block--alt' : ''}`}>
              <div className="hours-block__image">
                <div className={`img-fill ${room.gradClass}`} />
              </div>
              <div className="hours-block__content">
                <p className="hours-block__hour">{room.hour}</p>
                <h2 className="hours-block__name">{room.name}</h2>
                <p className="hours-block__text">{room.sub}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.1em', marginBottom: 28 }}>{room.scent}</p>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>{room.price}</span>
                  <button className="btn btn-outline" style={{ padding: '10px 24px' }}>Add to Cart</button>
                </div>
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>

      {/* Volume II teaser */}
      <div style={{ background: 'var(--deep-charcoal)', padding: '80px 48px', textAlign: 'center' }}>
        <span className="micro-label" style={{ color: 'var(--gold)', marginBottom: 16, display: 'block' }}>Coming Next</span>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,3vw,48px)', color: 'var(--ivory)', marginBottom: 12 }}>
          Volume II — The Intimate
        </h2>
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'rgba(250,247,242,0.5)', marginBottom: 32 }}>
          The private hours. The ones that don't need an audience.
        </p>
        <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(250,247,242,0.4)' }}>
          Coming Soon
        </span>
      </div>
    </>
  )
}
