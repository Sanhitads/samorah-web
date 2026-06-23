import { useState } from 'react'
import ScrollReveal from '../components/ScrollReveal'

function Accordion({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`accordion__item ${open ? 'open' : ''}`}>
      <button className="accordion__header" onClick={() => setOpen(!open)}>
        {question}
        <span className="accordion__icon">+</span>
      </button>
      <div className="accordion__body">
        <div className="accordion__content">{answer}</div>
      </div>
    </div>
  )
}

const faqs = {
  'Orders & Delivery': [
    { q: 'How long does delivery take?', a: 'Most orders arrive within 2–5 working days, depending on your location. We dispatch within 1–2 business days of your order being placed.' },
    { q: 'Do you ship internationally?', a: 'Currently we ship within India. International shipping is coming in Phase 2. Join our newsletter to be notified when it launches.' },
    { q: 'Can I change or cancel my order?', a: 'Orders can be modified or cancelled within 6 hours of placement. After that, the candle has likely already begun its journey. Contact us immediately at hello@samorah.in.' },
    { q: 'Will my order arrive safely?', a: 'All orders are carefully packaged to prevent breakage. Ceramic and glass vessels are wrapped in protective materials and cushioned with sustainable packaging.' },
    { q: 'Is this suitable for gifting?', a: 'Absolutely. All Samorah products come in beautiful minimal packaging. If you would like a gift note included, leave your message in the order notes.' },
  ],
  'Products & Usage': [
    { q: 'How strong is the fragrance? Will it fill my room?', a: 'Our candles have a fragrance load of 10–12%, which is on the higher end for luxury candles. In a medium room (15–20 sqm), you should notice the scent within 15–20 minutes of lighting.' },
    { q: 'How do I choose the right scent?', a: 'Start with our Scent Experience guide on the homepage, which organises our fragrances by family. If you like warm, spiced scents — start with the Dessert Chapter. If you prefer something fresher — try the Wild Within.' },
    { q: 'Can I use candle and room spray together?', a: 'Yes, and we encourage it. Layering the same scent in candle and spray form creates a full atmospheric experience. The spray activates quickly; the candle sustains it.' },
    { q: 'How long do your candles last?', a: 'Our 100g candles have a burn time of approximately 25–30 hours, our 200g candles 40–50 hours, and our 350g candles 60–75 hours. Proper wick trimming significantly extends burn life.' },
    { q: 'Why does the scent feel subtle compared to cheaper candles?', a: 'Cheaper candles often use synthetic fragrance boosters that create an immediate, intense "cold throw" (scent before lighting). Our fragrances are designed to evolve with heat — they bloom as the candle burns, rather than overwhelming at first sniff.' },
  ],
  'Care & Safety': [
    { q: 'Do I need to trim the wick every time?', a: 'Yes. Trim to 5mm before every burn. A longer wick causes the flame to flicker, produce soot, and burn faster. A properly trimmed wick gives you a cleaner, longer burn.' },
    { q: 'Why is my candle tunnelling?', a: 'Tunnelling happens when the candle is not burned long enough during the first burn. The wax has a "memory" — it will only melt as far as the first burn pool reached. Always burn until the wax pool reaches the edges on first use.' },
    { q: 'What surfaces can I place my candle on?', a: 'Always use a heat-resistant surface. While our vessels are designed to contain heat, direct contact with delicate surfaces can cause damage over time. A coaster or tray is ideal.' },
  ],
  'Returns & Support': [
    { q: 'What is your return policy?', a: 'We accept returns within 48 hours of delivery for damaged or incorrect items. Products must be unused and in original condition. Please photograph the damage and contact hello@samorah.in.' },
    { q: 'My candle arrived damaged. What do I do?', a: 'We are so sorry. Please photograph the damage immediately and email hello@samorah.in with your order number. We will dispatch a replacement within 2 business days.' },
    { q: 'How do I reach customer support?', a: 'Email: hello@samorah.in (response within 24–48 hours). WhatsApp: +91 98765 43210 (fastest response). We read everything and we reply to everything.' },
  ],
}

export default function FAQ() {
  return (
    <>
      <div className="page-hero page-hero--light" style={{ minHeight: '35vh' }}>
        <span className="page-hero__label">Support</span>
        <h1 className="page-hero__title" style={{ color: 'var(--deep-charcoal)' }}>Frequently Asked<br />Questions</h1>
        <p className="page-hero__sub" style={{ color: 'var(--smoke)' }}>Answers to the questions you may have — shared with clarity, care, and simplicity.</p>
      </div>

      <div className="container" style={{ paddingBlock: '80px' }}>
        {Object.entries(faqs).map(([category, questions]) => (
          <div key={category} className="faq-category">
            <ScrollReveal>
              <p className="faq-category__title">{category}</p>
            </ScrollReveal>
            <div className="accordion">
              {questions.map((faq, i) => (
                <Accordion key={i} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        ))}

        <div style={{ textAlign: 'center', padding: '48px 0 0', borderTop: '1px solid var(--beige)', marginTop: 40 }}>
          <p style={{ fontSize: 15, color: 'var(--smoke)', marginBottom: 16 }}>
            Still have a question?
          </p>
          <a href="/contact" className="btn btn-dark" style={{ display: 'inline-flex' }}>
            Contact Us
          </a>
        </div>
      </div>
    </>
  )
}
