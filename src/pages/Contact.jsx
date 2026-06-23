import { useState } from 'react'
import ScrollReveal from '../components/ScrollReveal'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [sent, setSent] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = e => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <>
      <div className="page-hero page-hero--light" style={{ minHeight: '35vh' }}>
        <span className="page-hero__label">Samorah</span>
        <h1 className="page-hero__title" style={{ color: 'var(--deep-charcoal)' }}>Contact</h1>
        <p className="page-hero__sub" style={{ color: 'var(--smoke)' }}>We read everything. We reply to everything.</p>
      </div>

      <div className="contact-layout">
        <div className="contact-info">
          <ScrollReveal>
            <div className="contact-info__item">
              <p className="contact-info__label">Email</p>
              <p className="contact-info__value">hello@samorah.in</p>
            </div>
            <div className="contact-info__item">
              <p className="contact-info__label">WhatsApp</p>
              <p className="contact-info__value">+91 98765 43210</p>
            </div>
            <div className="contact-info__item">
              <p className="contact-info__label">Studio</p>
              <p className="contact-info__value">Mumbai, India</p>
              <p style={{ fontSize: 13, color: 'var(--smoke)', marginTop: 4 }}>By appointment only</p>
            </div>
            <div className="contact-info__item">
              <p className="contact-info__label">Response Time</p>
              <p style={{ fontSize: 14, color: 'var(--smoke)', lineHeight: 1.7 }}>
                We respond within 24–48 hours on business days. For urgent order queries, WhatsApp is fastest.
              </p>
            </div>
            <div style={{ marginTop: 40 }}>
              <p className="micro-label" style={{ marginBottom: 16 }}>Follow Our World</p>
              <div style={{ display: 'flex', gap: 20 }}>
                {['Instagram', 'Pinterest', 'LinkedIn'].map(s => (
                  <a key={s} href="#" className="text-link" style={{ fontSize: 11 }}>{s}</a>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={100}>
          {sent ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, marginBottom: 16 }}>Message Received.</h2>
              <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--smoke)' }}>
                We will be in touch within 48 hours.
              </p>
            </div>
          ) : (
            <form className="contact-form" onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" name="name" value={form.name} onChange={handleChange} required placeholder="Your name" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} required placeholder="your@email.com" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input className="form-input" name="subject" value={form.subject} onChange={handleChange} required placeholder="Order query, wholesale, collaboration..." />
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-textarea" name="message" value={form.message} onChange={handleChange} required placeholder="Tell us what you need..." />
              </div>
              <button type="submit" className="btn btn-dark" style={{ alignSelf: 'flex-start' }}>
                Send Message
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          )}
        </ScrollReveal>
      </div>

      {/* FAQ nudge */}
      <div style={{ padding: '64px 48px', background: 'var(--soft-beige)', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--smoke)', marginBottom: 16 }}>
          Looking for quick answers?
        </p>
        <a href="/faq" className="text-link">Browse our FAQ</a>
      </div>
    </>
  )
}
