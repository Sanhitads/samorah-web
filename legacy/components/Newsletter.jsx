import { useState } from 'react'
import ScrollReveal from './ScrollReveal'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (email) setSubmitted(true)
  }

  return (
    <section className="newsletter section">
      <ScrollReveal>
        <span className="micro-label newsletter__label">Stay Close</span>
        <h2 className="newsletter__heading">
          Receive moments,<br />
          <em style={{ fontStyle: 'italic' }}>not promotions.</em>
        </h2>
        <p className="newsletter__sub">New chapters. Quiet stories. The occasional flame.</p>

        {submitted ? (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--charcoal)' }}>
              Welcome to the story.
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
              You'll hear from us when it matters.
            </p>
          </div>
        ) : (
          <form className="newsletter__form" onSubmit={handleSubmit}>
            <input
              type="email"
              className="newsletter__input"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <button type="submit" className="newsletter__btn">Subscribe</button>
          </form>
        )}

        <p className="newsletter__note">No spam. Unsubscribe anytime. We mean it.</p>
      </ScrollReveal>
    </section>
  )
}
