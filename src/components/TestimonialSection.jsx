import ScrollReveal from './ScrollReveal'

const testimonials = [
  {
    quote: 'An atmosphere that lingers long after the flame fades.',
    source: '— Editorial Review',
  },
  {
    quote: 'Kashmiri Chai is not just a candle. It is a conversation with memory.',
    source: '— Lifestyle Magazine',
  },
  {
    quote: 'The Dessert Chapter changed how I understand fragrance — as feeling, not just scent.',
    source: '— Verified Customer',
  },
]

export default function TestimonialSection() {
  return (
    <section className="testimonial section">
      <ScrollReveal>
        <span className="testimonial__mark">"</span>
        <blockquote className="testimonial__quote">
          {testimonials[0].quote}
        </blockquote>
        <p className="testimonial__source">{testimonials[0].source}</p>
      </ScrollReveal>
    </section>
  )
}
