export default function ReturnRefund() {
  return (
    <>
      <div className="page-hero page-hero--dark" style={{ minHeight: '30vh' }}>
        <span className="page-hero__label">Support</span>
        <h1 className="page-hero__title">Return &amp;<br />Refund Policy</h1>
        <p className="page-hero__sub">A thoughtful approach to returns, exchanges, and refunds.</p>
      </div>
      <div className="policy-layout">
        <nav className="policy-toc">
          <p className="policy-toc__title">On This Page</p>
          <ul>
            {['Introduction','Eligibility','Non-Returnable Items','Damaged Orders','Refund Process','Refund Timelines','Exchanges','Cancellations','Contact'].map(s => (
              <li key={s}><a href={`#${s.toLowerCase().replace(/ /g,'-')}`}>{s}</a></li>
            ))}
          </ul>
        </nav>
        <div className="policy-content">
          <h2 id="introduction">Introduction</h2>
          <p>We want your experience with Samorah to feel seamless and reassuring. If something isn't right with your order, we're here to help with care and clarity.</p>

          <h2 id="eligibility">Returns Eligibility</h2>
          <p>You may request a return if:</p>
          <ul>
            <li>The product arrives damaged</li>
            <li>You receive the wrong item</li>
            <li>The product is unused and in its original condition</li>
          </ul>
          <p>Return requests must be made within 48 hours of delivery.</p>

          <h2 id="non-returnable-items">Non-Returnable Items</h2>
          <p>For hygiene and product integrity reasons, the following may not be returned:</p>
          <ul>
            <li>Products that have been lit or used</li>
            <li>Products damaged due to misuse or improper handling</li>
            <li>Products without original packaging</li>
          </ul>

          <h2 id="damaged-orders">Damaged / Incorrect Orders</h2>
          <p>If your order arrives damaged or incorrect, please photograph the damage immediately and email hello@samorah.in with your order number and photos. We will dispatch a replacement within 2 business days at no additional cost.</p>

          <h2 id="refund-process">Refund Process</h2>
          <p>Once your return request is reviewed and approved:</p>
          <ul>
            <li>Refunds will be processed to the original payment method</li>
            <li>Please allow 5–7 working days for the refund to reflect</li>
            <li>You will receive confirmation once the refund has been initiated</li>
          </ul>

          <h2 id="refund-timelines">Refund Timelines</h2>
          <p>UPI and wallet refunds typically process within 1–3 business days. Credit and debit card refunds may take up to 7–10 business days depending on your bank.</p>

          <h2 id="exchanges">Exchanges</h2>
          <p>If you receive a damaged or incorrect product, we may offer a replacement based on product availability. We do not currently facilitate size or variant exchanges.</p>

          <h2 id="cancellations">Cancellation Policy</h2>
          <p>Orders may be cancelled within 6 hours of placement. After that, the order is likely in processing and cancellation may not be possible. Contact us immediately at hello@samorah.in.</p>

          <h2 id="contact">Contact</h2>
          <p>Email: hello@samorah.in · WhatsApp: +91 98765 43210</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 32 }}>We believe every interaction is an opportunity to do right by you.</p>
        </div>
      </div>
    </>
  )
}
