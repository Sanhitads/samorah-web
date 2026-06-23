import ScrollReveal from '../components/ScrollReveal'

const makers = [
  {
    name: 'Priya Sharma',
    role: 'Co-Founder & Creative Director',
    bio: 'Priya spent a decade in luxury fragrance retail before founding Samorah. She built the Dessert Chapter alone over eighteen months — forty iterations of Kashmiri Chai before she felt it was true. She believes a fragrance house is built one honest composition at a time.',
    gradClass: 'grad-story',
    imageRight: false,
  },
  {
    name: 'Arjun Mehta',
    role: 'Co-Founder & Head of Craft',
    bio: 'Arjun comes from a background in material science and an obsession with the chemistry of natural waxes. He developed Samorah\'s signature soy-coconut blend after two years of testing. He believes luxury lives in the invisible — in a wick that doesn\'t mushroom, a wax that pools perfectly.',
    gradClass: 'grad-wild',
    imageRight: true,
  },
]

const team = [
  { name: 'Meera Nair', role: 'Fragrance Composer', bio: 'Trained in Grasse, raised in Kerala. Meera builds the heart notes.' },
  { name: 'Rahul Verma', role: 'Vessel Artist', bio: 'Ceramicist and terracotta specialist. Every vessel is a collaboration.' },
  { name: 'Sana Iqbal', role: 'Brand Storyteller', bio: 'Words are her medium. Every candle gets a story it deserves.' },
  { name: 'Dev Patel', role: 'Operations & Logistics', bio: 'Ensures every order arrives as it left — perfect.' },
]

export default function MeetMakers() {
  return (
    <>
      <div className="page-hero page-hero--dark">
        <span className="page-hero__label">The People</span>
        <h1 className="page-hero__title">Meet The<br />Makers</h1>
        <p className="page-hero__sub">A quiet note about the people behind Samorah.</p>
      </div>

      {/* Co-founders */}
      {makers.map((m, i) => (
        <div key={m.name} className={`makers-feature ${m.imageRight ? 'makers-feature--reversed' : ''}`}>
          <div className="makers-feature__image">
            <div className={`img-fill ${m.gradClass}`} />
          </div>
          <div className="makers-feature__content">
            <ScrollReveal delay={100}>
              <span className="micro-label" style={{ marginBottom: 20, display: 'block' }}>{m.role}</span>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,3vw,48px)', marginBottom: 20 }}>
                {m.name}
              </h2>
              <p style={{ fontSize: 15, color: 'var(--smoke)', lineHeight: 1.9 }}>{m.bio}</p>
            </ScrollReveal>
          </div>
        </div>
      ))}

      {/* Team grid */}
      <div style={{ padding: '80px 48px' }}>
        <ScrollReveal>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span className="micro-label" style={{ marginBottom: 12, display: 'block' }}>The Studio</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px,3vw,44px)' }}>
              The Artists &amp; Makers
            </h2>
          </div>
        </ScrollReveal>
        <div className="makers-grid">
          {team.map((m, i) => (
            <ScrollReveal key={m.name} delay={i * 80} className="maker-card">
              <div style={{ width: 64, height: 64, borderRadius: '50%', marginBottom: 20, overflow: 'hidden' }}>
                <div className={`img-fill grad-atm${i + 1}`} />
              </div>
              <h3 className="maker-card__name">{m.name}</h3>
              <p className="maker-card__role">{m.role}</p>
              <p className="maker-card__bio">{m.bio}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>

      {/* Closing */}
      <div style={{ textAlign: 'center', padding: '80px 48px', background: 'var(--deep-charcoal)' }}>
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'clamp(20px,2.5vw,36px)', color: 'var(--ivory)', maxWidth: 600, margin: '0 auto', lineHeight: 1.5 }}>
          "Every hand that touches a Samorah candle leaves something of itself behind."
        </p>
      </div>
    </>
  )
}
