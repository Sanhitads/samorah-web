import { createContext, useContext, useReducer, useEffect, useState } from 'react'

const CartContext = createContext(null)

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const existing = state.find(i => i.key === action.item.key)
      if (existing) {
        return state.map(i => i.key === action.item.key ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...state, { ...action.item, qty: 1 }]
    }
    case 'REMOVE':
      return state.filter(i => i.key !== action.key)
    case 'UPDATE_QTY':
      return state
        .map(i => i.key === action.key ? { ...i, qty: action.qty } : i)
        .filter(i => i.qty > 0)
    case 'CLEAR':
      return []
    default:
      return state
  }
}

function loadCart() {
  try {
    const saved = localStorage.getItem('samorah_cart')
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(cartReducer, null, loadCart)
  const [cartOpen, setCartOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('samorah_cart', JSON.stringify(items))
  }, [items])

  const addItem = (product, vessel, size) => {
    const key = `${product.id}-${vessel}-${size}`
    dispatch({
      type: 'ADD',
      item: {
        key,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        gradClass: product.gradClass,
        chapterName: product.chapterName,
        vessel,
        size,
      },
    })
    setCartOpen(true)
  }

  const removeItem = (key) => dispatch({ type: 'REMOVE', key })
  const updateQty = (key, qty) => dispatch({ type: 'UPDATE_QTY', key, qty })
  const clearCart = () => dispatch({ type: 'CLEAR' })
  const openCart = () => setCartOpen(true)
  const closeCart = () => setCartOpen(false)

  const count = items.reduce((sum, i) => sum + i.qty, 0)
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return (
    <CartContext.Provider value={{ items, count, subtotal, addItem, removeItem, updateQty, clearCart, cartOpen, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
