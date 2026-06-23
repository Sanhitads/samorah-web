import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__statement">
        <h2 className="footer__statement-heading">
          Every flame holds a story.<br />
          <em style={{ fontStyle: 'italic', color: 'var(--gold)' }}>Find yours.</em>
        </h2>
        <p className="footer__statement-sub">Handcrafted in India. Composed with intention.</p>
      </div>

      <div className="footer__nav">
        <div className="footer__brand-col">
          <span className="footer__logo">Samorah</span>
          <p>Luxury handmade scented candles. Each collection is a fragrance library composed through atmosphere, ritual and memory.</p>
        </div>

        <div className="footer__col">
          <p className="footer__col-title">Shop</p>
          <ul>
            <li><Link to="/collections">All Collections</Link></li>
            <li><Link to="/shop/room-sprays">Room Sprays</Link></li>
            <li><Link to="/bundles">Ritual Bundles</Link></li>
            <li><Link to="/collections">Best Sellers</Link></li>
            <li><Link to="/collections">New Arrivals</Link></li>
          </ul>
        </div>

        <div className="footer__col">
          <p className="footer__col-title">Chapters</p>
          <ul>
            <li><Link to="/collections/dessert-chapter">Vol. I — Dessert</Link></li>
            <li><Link to="/collections/the-wild-within">Vol. II — Wild Within</Link></li>
            <li><Link to="/collections/mood-library">Vol. III — Mood Library</Link></li>
            <li><Link to="/collections/nature-chapter">Vol. IV — Nature</Link></li>
            <li><Link to="/archive">Archive</Link></li>
          </ul>
        </div>

        <div className="footer__col">
          <p className="footer__col-title">About</p>
          <ul>
            <li><Link to="/about/our-story">Our Story</Link></li>
            <li><Link to="/about/craft-ingredients">Craft & Ingredients</Link></li>
            <li><Link to="/about/meet-the-makers">Meet The Makers</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/faq">FAQ</Link></li>
          </ul>
        </div>

        <div className="footer__col">
          <p className="footer__col-title">Help</p>
          <ul>
            <li><Link to="/shipping">Shipping Policy</Link></li>
            <li><Link to="/returns">Returns & Refunds</Link></li>
            <li><Link to="/care-safety">Care & Safety</Link></li>
            <li><Link to="/privacy-policy">Privacy Policy</Link></li>
            <li><Link to="/terms">Terms & Conditions</Link></li>
          </ul>
        </div>
      </div>

      <div className="footer__bottom">
        <p className="footer__copyright">© 2025 Samorah. All rights reserved.</p>
        <div className="footer__social">
          <a href="#">Instagram</a>
          <a href="#">Pinterest</a>
          <a href="#">WhatsApp</a>
        </div>
      </div>
    </footer>
  )
}
