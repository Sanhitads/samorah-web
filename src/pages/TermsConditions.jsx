export default function TermsConditions() {
  const sections = [
    { id: 'intro', title: 'Introduction', content: 'By accessing and using this website, you accept and agree to be bound by the terms and conditions of this agreement. If you do not agree, please do not use our website.' },
    { id: 'use', title: 'Use of Website', content: 'This website is for personal, non-commercial use. You agree not to use this site for any unlawful purpose or in any way that could damage, disable, or impair the site.' },
    { id: 'products', title: 'Products & Information', content: 'We reserve the right to modify product descriptions, pricing, and availability at any time without prior notice. Product colours may vary slightly from screen representations due to monitor settings.' },
    { id: 'pricing', title: 'Pricing & Payments', content: 'All prices are in Indian Rupees (₹) and inclusive of applicable taxes. We accept UPI, credit/debit cards, net banking, and digital wallets through our secure payment partners.' },
    { id: 'orders', title: 'Orders & Acceptance', content: 'An order confirmation does not constitute acceptance. We reserve the right to cancel any order for any reason, including stock unavailability or suspected fraud, with a full refund.' },
    { id: 'shipping', title: 'Shipping & Delivery', content: 'We aim to dispatch all orders within 1–2 business days. Delivery timelines are estimates and not guaranteed. We are not responsible for delays caused by courier partners or force majeure events.' },
    { id: 'returns', title: 'Returns & Refunds', content: 'Returns are accepted within 48 hours of delivery for damaged or incorrect items. Opened or used products cannot be returned. Please refer to our Return & Refund Policy for full details.' },
    { id: 'ip', title: 'Intellectual Property', content: 'All content on this website — including text, photography, brand identity, fragrance names, and product descriptions — is the intellectual property of Samorah. Reproduction without written consent is prohibited.' },
    { id: 'liability', title: 'Limitation of Liability', content: 'Samorah is not liable for any indirect, incidental, or consequential damages arising from the use of our products or website. Our liability is limited to the purchase price of the relevant product.' },
    { id: 'governing', title: 'Governing Law (India)', content: 'These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.' },
    { id: 'contact', title: 'Contact', content: 'For any queries regarding these terms, please contact: legal@samorah.in' },
  ]

  return (
    <>
      <div className="page-hero page-hero--dark" style={{ minHeight: '30vh' }}>
        <span className="page-hero__label">Legal</span>
        <h1 className="page-hero__title">Terms &amp;<br />Conditions</h1>
        <p className="page-hero__sub">Last updated: January 2025</p>
      </div>
      <div className="policy-layout">
        <nav className="policy-toc">
          <p className="policy-toc__title">On This Page</p>
          <ul>
            {sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          </ul>
        </nav>
        <div className="policy-content">
          {sections.map(s => (
            <div key={s.id}>
              <h2 id={s.id}>{s.title}</h2>
              <p>{s.content}</p>
            </div>
          ))}
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 32 }}>
            We are committed to being a fair and transparent brand. These terms exist to protect both you and us.
          </p>
        </div>
      </div>
    </>
  )
}
