export default function PrivacyPolicy() {
  return (
    <>
      <div className="page-hero page-hero--dark" style={{ minHeight: '30vh' }}>
        <span className="page-hero__label">Legal</span>
        <h1 className="page-hero__title">Privacy Policy</h1>
        <p className="page-hero__sub">Last updated: January 2025</p>
      </div>
      <div className="policy-layout">
        <nav className="policy-toc">
          <p className="policy-toc__title">On This Page</p>
          <ul>
            {['Introduction','Information We Collect','How We Use It','Sharing','Cookies','Data Security','Your Rights','Contact'].map(s => (
              <li key={s}><a href={`#${s.toLowerCase().replace(/ /g,'-')}`}>{s}</a></li>
            ))}
          </ul>
        </nav>
        <div className="policy-content">
          <h2 id="introduction">Introduction</h2>
          <p>Samorah ("we," "us," or "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or make a purchase.</p>

          <h2 id="information-we-collect">Information We Collect</h2>
          <p>We collect information you provide directly to us, including:</p>
          <ul>
            <li>Name, email address, phone number when you create an account or place an order</li>
            <li>Billing and shipping address for order fulfilment</li>
            <li>Payment information (processed securely through our payment partners)</li>
            <li>Communication preferences and newsletter subscription status</li>
          </ul>
          <p>We also collect certain information automatically, including your IP address, browser type, pages visited, and time spent on the site.</p>

          <h2 id="how-we-use-it">How We Use Your Information</h2>
          <p>We use the information we collect to process orders, send transactional emails, improve our website, personalise your experience, and communicate with you about new products or collections (if you have opted in).</p>

          <h2 id="sharing">Sharing of Information</h2>
          <p>We do not sell your personal information. We share data only with trusted service providers who assist in operating our website, conducting our business, or servicing you — subject to confidentiality agreements.</p>

          <h2 id="cookies">Cookies & Tracking</h2>
          <p>We use cookies to enhance your experience. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. If you do not accept cookies, some portions of our site may not function properly.</p>

          <h2 id="data-security">Data Security</h2>
          <p>We implement industry-standard security measures to maintain the safety of your personal information. All payment data is encrypted via SSL and processed by PCI-DSS compliant gateways.</p>

          <h2 id="your-rights">Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal data. You may also withdraw consent for marketing communications at any time by clicking "Unsubscribe" in any email or contacting us directly.</p>

          <h2 id="contact">Contact</h2>
          <p>For any privacy-related queries, please contact us at: privacy@samorah.in</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 32 }}>We believe privacy is a form of respect. We treat yours accordingly.</p>
        </div>
      </div>
    </>
  )
}
