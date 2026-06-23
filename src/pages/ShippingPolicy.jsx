export default function ShippingPolicy() {
  return (
    <>
      <div className="page-hero page-hero--dark" style={{ minHeight: '30vh' }}>
        <span className="page-hero__label">Support</span>
        <h1 className="page-hero__title">Shipping<br />Policy</h1>
        <p className="page-hero__sub">How your candles find their way to you.</p>
      </div>
      <div className="policy-layout">
        <nav className="policy-toc">
          <p className="policy-toc__title">On This Page</p>
          <ul>
            {['Overview','Delivery Timelines','Shipping Charges','Order Processing','Tracking','Delays','Damaged Orders','Contact'].map(s => (
              <li key={s}><a href={`#${s.toLowerCase().replace(/ /g, '-')}`}>{s}</a></li>
            ))}
          </ul>
        </nav>
        <div className="policy-content">
          <h2 id="overview">Shipping Overview</h2>
          <p>We ship across India using trusted courier partners including Shiprocket, Delhivery, and BlueDart. Every order is carefully packaged to arrive in perfect condition.</p>

          <h2 id="delivery-timelines">Delivery Timelines</h2>
          <p>Metro cities (Delhi, Mumbai, Bangalore, Chennai, Hyderabad, Kolkata): 2–3 business days</p>
          <p>Tier 2 & Tier 3 cities: 3–5 business days</p>
          <p>Remote areas: 5–7 business days</p>
          <p>These are estimated timelines and not guaranteed delivery dates.</p>

          <h2 id="shipping-charges">Shipping Charges</h2>
          <p>Free shipping on all orders over ₹1,000. Orders below ₹1,000 incur a flat shipping fee of ₹80. Express shipping is available at checkout for an additional charge.</p>

          <h2 id="order-processing">Order Processing</h2>
          <p>Orders are processed within 1–2 business days of placement. Orders placed on weekends or public holidays are processed on the next business day.</p>

          <h2 id="tracking">Tracking Orders</h2>
          <p>Once your order is dispatched, you will receive a tracking number via email and SMS. You can track your order directly on our courier partner's website.</p>

          <h2 id="delays">Delays & Exceptions</h2>
          <p>During peak periods (Diwali, Christmas, New Year), please allow 1–2 additional business days. We are not responsible for delays caused by courier partners, natural disasters, or government-imposed restrictions.</p>

          <h2 id="damaged-orders">Damaged / Lost Orders</h2>
          <p>If your order arrives damaged or is lost in transit, please contact us at hello@samorah.in within 48 hours of expected delivery. We will investigate and resolve promptly.</p>

          <h2 id="contact">Contact</h2>
          <p>For shipping queries: hello@samorah.in · WhatsApp: +91 98765 43210</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 32 }}>Every Samorah candle is packed with intention. We want it to arrive the way it left us — perfect.</p>
        </div>
      </div>
    </>
  )
}
