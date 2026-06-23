import ScrollReveal from '../components/ScrollReveal'

const ingredients = [
  {
    number: '01',
    name: 'The Wax',
    content: 'We use a proprietary soy-coconut blend — soy for its clean burn and slow release, coconut for its creamy texture and superior fragrance throw. No paraffin. No additives. Just two natural waxes working in harmony.',
    gradClass: 'grad-chai',
    alt: false,
  },
  {
    number: '02',
    name: 'The Fragrance',
    content: 'All Samorah fragrances are phthalate-free and IFRA compliant. Each composition is built in consultation with trained perfumers — layered across top, heart and base notes that evolve over the life of the burn. We do not use synthetic shortcuts.',
    gradClass: 'grad-smoke',
    alt: true,
  },
  {
    number: '03',
    name: 'The Wick',
    content: '100% cotton, lead-free, pre-tabbed. Sized precisely for each vessel to ensure an even burn pool and minimal mushrooming. The wick is the engineering behind the experience — we take it seriously.',
    gradClass: 'grad-wild',
    alt: false,
  },
  {
    number: '04',
    name: 'The Vessel',
    content: 'Our vessels are sourced from local artisans — ceramic, glass, and terracotta. Each one is a collaboration with the makers who shape them. When the candle is finished, the vessel lives on.',
    gradClass: 'grad-story',
    alt: true,
  },
]

export default function CraftIngredients() {
  return (
    <>
      <div className="page-hero page-hero--dark">
        <span className="page-hero__label">The Making</span>
        <h1 className="page-hero__title">Craft &amp;<br />Ingredients</h1>
        <p className="page-hero__sub">What goes into every flame.</p>
      </div>

      {/* Intro */}
      <div style={{ padding: '80px 48px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
        <ScrollReveal>
          <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Our Philosophy</span>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px,2.5vw,40px)', marginBottom: 20 }}>
            Luxury lives in the invisible.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--smoke)', lineHeight: 1.9 }}>
            The details no one sees — the wax formulation, the fragrance load percentage, the wick gauge — are where a candle is truly made. We believe in getting every invisible thing right, so the visible experience is effortless.
          </p>
        </ScrollReveal>
      </div>

      {/* Ingredients */}
      {ingredients.map(ing => (
        <div key={ing.number} className={`craft-ingredient ${ing.alt ? 'craft-ingredient--alt' : ''}`}>
          <ScrollReveal>
            <div>
              <p className="craft-ingredient__number">{ing.number}</p>
              <h2 className="craft-ingredient__name">{ing.name}</h2>
              <p className="craft-ingredient__text">{ing.content}</p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <div style={{ height: 360, borderRadius: 1, overflow: 'hidden' }}>
              <div className={`img-fill ${ing.gradClass}`} />
            </div>
          </ScrollReveal>
        </div>
      ))}

      {/* Full image */}
      <div style={{ height: 400 }}>
        <div className="img-fill grad-dark" />
      </div>

      {/* Closing */}
      <div style={{ textAlign: 'center', padding: '80px 48px' }}>
        <ScrollReveal>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 'clamp(20px,2.5vw,36px)', color: 'var(--deep-charcoal)', maxWidth: 560, margin: '0 auto 20px', lineHeight: 1.5 }}>
            "We make candles for people who pay attention to the things that matter."
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            — Samorah
          </p>
        </ScrollReveal>
      </div>
    </>
  )
}
