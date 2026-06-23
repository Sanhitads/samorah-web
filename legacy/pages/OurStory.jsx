import ScrollReveal from '../components/ScrollReveal'

export default function OurStory() {
  return (
    <>
      <div className="page-hero page-hero--dark">
        <span className="page-hero__label">About Samorah</span>
        <h1 className="page-hero__title">Our Story</h1>
        <p className="page-hero__sub">A quiet note about the people, the purpose, and the flame.</p>
      </div>

      {/* The Beginning */}
      <div className="story-section">
        <ScrollReveal className="story-centered">
          <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>The Beginning</span>
          <h2 className="story-heading">It started with a winter morning.</h2>
          <p className="story-text">
            Not with a business plan. Not with a pitch deck. With a cup of Kashmiri chai, a cold room, and the sudden, certain feeling that the right fragrance could hold an entire world inside it.
          </p>
          <p className="story-text">
            Samorah was born from that moment — from the belief that scent is not decoration but documentation. That a candle can do what a photograph cannot: it can make a room smell like a feeling.
          </p>
        </ScrollReveal>
      </div>

      {/* The Shift */}
      <div style={{ background: 'var(--soft-beige)' }}>
        <div className="story-section">
          <div className="story-split container">
            <ScrollReveal>
              <div className="story-full-image" style={{ height: 500, borderRadius: 1 }}>
                <div className="img-fill grad-story" />
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>The Shift</span>
              <h2 className="story-heading">From interest to obsession.</h2>
              <p className="story-text">
                We spent eighteen months in research — reading about olfactory memory, studying how fragrance houses like Trudon and Diptyque layer compositions, learning about the chemistry of top notes and the psychology of base notes.
              </p>
              <p className="story-text">
                We sourced our first batch of soy-coconut wax, ordered cotton wicks from three different suppliers, and built our first fragrance — Kashmiri Chai — across forty iterations. Forty. Because the thirty-ninth was close, but not yet true.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </div>

      {/* Full image break */}
      <div className="story-full-image" style={{ height: 480 }}>
        <div className="img-fill grad-chai" />
      </div>

      {/* Fragrance: A Story */}
      <div className="story-section">
        <ScrollReveal className="story-narrow container-narrow">
          <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Fragrance: A Story</span>
          <h2 className="story-heading">Why we compose in chapters.</h2>
          <p className="story-text">
            We did not want to make a product catalogue. We wanted to make a library. Each collection is a chapter with its own emotional register — a fragrance world that is internally consistent, where every scent belongs.
          </p>
          <p className="story-text">
            Vol. I — The Dessert Chapter opens in warmth and sweetness. Vol. II — The Wild Within moves into something rawer, bolder, more elemental. Each chapter after that is a different key in a long, expanding composition.
          </p>
        </ScrollReveal>
      </div>

      {/* Image Break with overlay */}
      <div className="story-image-overlay">
        <div className="img-fill grad-wild" style={{ height: 400 }} />
        <p className="story-image-overlay__line">
          "The scent you choose is the story you tell about yourself."
        </p>
      </div>

      {/* From Scent to Flame */}
      <div className="story-section">
        <ScrollReveal className="story-narrow container-narrow">
          <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>From Scent to Flame</span>
          <h2 className="story-heading">The making of a candle.</h2>
          <p className="story-text">
            Each Samorah candle begins with a brief — a feeling, a memory, a cultural reference. A Kashmiri kitchen. A forest after rain. A late-night conversation that didn't want to end.
          </p>
          <p className="story-text">
            From that brief, we build a fragrance pyramid: top notes that evaporate first and create the first impression, heart notes that emerge as the candle warms, base notes that anchor the composition for hours after.
          </p>
        </ScrollReveal>
      </div>

      {/* Made with Intention */}
      <div style={{ background: 'var(--soft-beige)' }}>
        <div className="story-section">
          <ScrollReveal className="story-narrow container-narrow">
            <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>Made with Intention</span>
            <h2 className="story-heading">What we will not compromise on.</h2>
            <p className="story-text">
              Every candle uses premium soy-coconut wax. Every wick is 100% cotton. Every fragrance compound is phthalate-free and IFRA compliant.
            </p>
            <p className="story-text">
              We do not use paraffin. We do not use synthetic dyes. We do not rush the curing process. We believe in the radical idea that a luxury product should be luxurious in every invisible detail, not just the visible ones.
            </p>
          </ScrollReveal>
        </div>
      </div>

      {/* Full width image */}
      <div style={{ height: 400 }}>
        <div className="img-fill grad-dark" />
      </div>

      {/* What We Believe */}
      <div className="story-section">
        <ScrollReveal className="story-centered container-narrow">
          <span className="micro-label" style={{ marginBottom: 16, display: 'block' }}>What We Believe</span>
          <h2 className="story-heading">Our convictions.</h2>
        </ScrollReveal>
        <div className="belief-grid">
          {[
            { n: '01', title: 'Scent is memory.', text: 'Fragrance bypasses the thinking mind and speaks directly to feeling. A candle can hold a season, a relationship, a decade.' },
            { n: '02', title: 'Slowness is quality.', text: 'We do not rush. Not the sourcing, not the development, not the curing. Things made slowly tend to last.' },
            { n: '03', title: 'India has stories to tell.', text: 'The richest fragrance traditions in the world live in this country. We are here to translate them for a contemporary audience.' },
          ].map(b => (
            <ScrollReveal key={b.n} className="belief-item">
              <p className="belief-number">{b.n}</p>
              <h3 className="belief-title">{b.title}</h3>
              <p className="belief-text">{b.text}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>

      {/* Closing */}
      <div className="story-closing">
        <h2>The story is still being written.</h2>
        <p>We are glad you found us in this chapter.</p>
      </div>
    </>
  )
}
