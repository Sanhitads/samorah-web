import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SearchOverlay from './SearchOverlay'
import { useCart } from '../context/CartContext'

const menuData = {
  SHOP: {
    col1: {
      title: 'Products',
      links: [
        { label: 'Candles', to: '/collections' },
        { label: 'Candle Melts', to: '/shop/melts' },
        { label: 'Room & Linen Sprays', to: '/shop/room-sprays' },
        { label: 'Ritual Bundles', to: '/bundles' },
        { label: 'Best Sellers', to: '/collections' },
        { label: 'New Arrivals', to: '/collections' },
      ],
    },
    campaign: { label: "December's First Flame", sub: 'Warm chai editorial', gradClass: 'grad-chai' },
  },
  CHAPTERS: {
    col1: {
      title: 'Fragrance Chapters',
      links: [
        { label: 'Vol. I — Dessert Chapter', to: '/collections/dessert-chapter' },
        { label: 'Vol. II — The Wild Within', to: '/collections/the-wild-within' },
        { label: 'Vol. III — Mood Library', to: '/collections/mood-library' },
        { label: 'Vol. IV — Nature Chapter', to: '/collections/nature-chapter' },
      ],
    },
    col2: {
      title: 'Collections',
      links: [
        { label: 'The Hours Collection', to: '/shop/room-sprays' },
        { label: 'Volume I — The Everyday', to: '/shop/room-sprays' },
        { label: 'Volume II — The Intimate', to: '/shop/room-sprays' },
      ],
    },
    campaign: { label: 'Dessert Chapter', sub: 'Chai steam · Amber mood', gradClass: 'grad-gajar' },
  },
  ARCHIVE: {
    col1: {
      title: 'The Archive',
      links: [
        { label: 'Retired Fragrances', to: '/archive' },
        { label: 'Past Editions', to: '/archive' },
        { label: 'Collector Releases', to: '/archive' },
        { label: 'Seasonal Archives', to: '/archive' },
      ],
    },
    campaign: { label: 'The Samorah Archive', sub: 'Preserved for legacy', gradClass: 'grad-smoke' },
  },
  ABOUT: {
    col1: {
      title: 'About Samorah',
      links: [
        { label: 'Our Story', to: '/about/our-story' },
        { label: 'Craft & Ingredients', to: '/about/craft-ingredients' },
        { label: 'Meet The Makers', to: '/about/meet-the-makers' },
        { label: 'Contact', to: '/contact' },
      ],
    },
    campaign: { label: 'Made With Intention', sub: 'Every candle, a story', gradClass: 'grad-story' },
  },
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedMobile, setExpandedMobile] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const { count, openCart } = useCart()

  const openSearch = useCallback(() => {
    setActiveMenu(null)
    setMobileOpen(false)
    setSearchOpen(true)
  }, [])

  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const megaRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const handleNavEnter = (key) => setActiveMenu(key)
  const handleNavLeave = () => setActiveMenu(null)

  const menu = activeMenu ? menuData[activeMenu] : null

  return (
    <>
      <header
        className={`header ${scrolled ? 'header--scrolled' : ''}`}
        onMouseLeave={handleNavLeave}
      >
        <div className="header__inner">
          {/* Left Nav */}
          <nav className="header__nav">
            {Object.keys(menuData).slice(0, 2).map(key => (
              <span
                key={key}
                className="header__nav-item"
                onMouseEnter={() => handleNavEnter(key)}
              >
                {key}
              </span>
            ))}
          </nav>

          {/* Mobile toggle */}
          <button
            className={`mobile-menu-btn ${mobileOpen ? 'open' : ''}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>

          {/* Logo */}
          <Link to="/" className="header__logo" onClick={() => setActiveMenu(null)}>
            Samorah
          </Link>

          {/* Right Nav */}
          <div className="header__actions">
            <nav className="header__nav" style={{ justifyContent: 'flex-end' }}>
              {Object.keys(menuData).slice(2).map(key => (
                <span
                  key={key}
                  className="header__nav-item"
                  onMouseEnter={() => handleNavEnter(key)}
                >
                  {key}
                </span>
              ))}
            </nav>

            {/* Icons */}
            <button className="header__icon" aria-label="Search" onClick={openSearch}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L22 22" />
              </svg>
            </button>
            <button className="header__icon" aria-label="Account">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            <button className="header__icon" style={{ position: 'relative' }} aria-label="Cart" onClick={openCart}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 01-8 0" />
              </svg>
              {count > 0 && (
                <span className="cart-badge">{count > 9 ? '9+' : count}</span>
              )}
            </button>
          </div>
        </div>

        {/* Mega Menu */}
        {menu && (
          <div className={`mega-menu ${activeMenu ? 'open' : ''}`} ref={megaRef}>
            <div className="mega-menu__inner">
              {menu.col1 && (
                <div className="mega-menu__col">
                  <p className="mega-menu__col-title">{menu.col1.title}</p>
                  <ul>
                    {menu.col1.links.map(l => (
                      <li key={l.label}>
                        <Link to={l.to} onClick={() => setActiveMenu(null)}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {menu.col2 && (
                <div className="mega-menu__col">
                  <p className="mega-menu__col-title">{menu.col2.title}</p>
                  <ul>
                    {menu.col2.links.map(l => (
                      <li key={l.label}>
                        <Link to={l.to} onClick={() => setActiveMenu(null)}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {menu.campaign && (
                <div className="mega-menu__campaign">
                  <div className={`img-fill ${menu.campaign.gradClass}`} />
                  <div className="mega-menu__campaign-label">
                    <span className="micro-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Featured</span>
                    <p>{menu.campaign.label}</p>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{menu.campaign.sub}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Mobile Nav */}
      <nav className={`mobile-nav ${mobileOpen ? 'open' : ''}`}>
        <button className="mobile-nav__close" onClick={() => setMobileOpen(false)}>✕</button>

        <div className="mobile-nav__item">
          <Link className="mobile-nav__link" to="/" onClick={() => setMobileOpen(false)}>Home</Link>
        </div>

        {Object.entries(menuData).map(([key, val]) => (
          <div className="mobile-nav__item" key={key}>
            <span
              className="mobile-nav__link"
              style={{ cursor: 'pointer' }}
              onClick={() => setExpandedMobile(expandedMobile === key ? null : key)}
            >
              {key}
            </span>
            {expandedMobile === key && (
              <div className="mobile-nav__sub">
                {val.col1?.links.map(l => (
                  <Link key={l.label} to={l.to} onClick={() => setMobileOpen(false)}>{l.label}</Link>
                ))}
                {val.col2?.links.map(l => (
                  <Link key={l.label} to={l.to} onClick={() => setMobileOpen(false)}>{l.label}</Link>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="mobile-nav__item">
          <Link className="mobile-nav__link" to="/bundles" onClick={() => setMobileOpen(false)}>Bundles</Link>
        </div>
        <div className="mobile-nav__item">
          <Link className="mobile-nav__link" to="/faq" onClick={() => setMobileOpen(false)}>FAQ</Link>
        </div>
        <div className="mobile-nav__item">
          <span
            className="mobile-nav__link"
            style={{ cursor: 'pointer', fontSize: 24 }}
            onClick={openSearch}
          >
            Search
          </span>
        </div>
      </nav>

      <SearchOverlay open={searchOpen} onClose={closeSearch} />
    </>
  )
}
