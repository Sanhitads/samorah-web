import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'

export default function CartDrawer() {
  const { items, count, subtotal, removeItem, updateQty, cartOpen, closeCart } = useCart()

  useEffect(() => {
    if (cartOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [cartOpen])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeCart() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeCart])

  if (!cartOpen) return null

  return (
    <div className="cart-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeCart() }}>
      <div className="cart-drawer">
        <div className="cart-drawer__header">
          <div>
            <h3 className="cart-drawer__title">Your Cart</h3>
            {count > 0 && (
              <span className="cart-drawer__count">{count} {count === 1 ? 'item' : 'items'}</span>
            )}
          </div>
          <button className="cart-drawer__close" onClick={closeCart} aria-label="Close cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="cart-drawer__empty">
            <div className="cart-drawer__empty-icon">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
            </div>
            <p className="cart-drawer__empty-title">Your cart is empty</p>
            <p className="cart-drawer__empty-sub">Discover a scent that speaks to you.</p>
            <Link
              to="/collections"
              className="btn btn-dark"
              style={{ marginTop: 28, display: 'inline-block', padding: '14px 32px' }}
              onClick={closeCart}
            >
              Explore Collections
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-drawer__items">
              {items.map(item => (
                <div key={item.key} className="cart-item">
                  <Link to={`/product/${item.slug}`} className={`cart-item__img ${item.gradClass}`} onClick={closeCart} />
                  <div className="cart-item__info">
                    <p className="cart-item__chapter">{item.chapterName}</p>
                    <Link to={`/product/${item.slug}`} className="cart-item__name" onClick={closeCart}>
                      {item.name}
                    </Link>
                    <p className="cart-item__meta">{item.vessel} · {item.size}</p>
                    <p className="cart-item__price">₹{(item.price * item.qty).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="cart-item__controls">
                    <div className="cart-item__qty">
                      <button
                        className="cart-item__qty-btn"
                        onClick={() => updateQty(item.key, item.qty - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="cart-item__qty-val">{item.qty}</span>
                      <button
                        className="cart-item__qty-btn"
                        onClick={() => updateQty(item.key, item.qty + 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <button className="cart-item__remove" onClick={() => removeItem(item.key)} aria-label="Remove item">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-drawer__footer">
              {subtotal < 1000 ? (
                <p className="cart-drawer__shipping-note">
                  Add ₹{(1000 - subtotal).toLocaleString('en-IN')} more for free shipping
                </p>
              ) : (
                <p className="cart-drawer__shipping-note cart-drawer__shipping-note--free">
                  ✓ You've unlocked free shipping
                </p>
              )}
              <div className="cart-drawer__subtotal">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <p className="cart-drawer__tax-note">Taxes and shipping calculated at checkout</p>
              <button
                className="btn btn-dark"
                style={{ width: '100%', padding: '16px', fontSize: 12, letterSpacing: '0.18em', marginTop: 16 }}
              >
                PROCEED TO CHECKOUT
              </button>
              <button className="cart-drawer__continue" onClick={closeCart}>
                Continue Shopping
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
