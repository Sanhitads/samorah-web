import { useEffect, useRef } from 'react'

export default function ScrollReveal({ children, className = '', delay = 0, style = {} }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          observer.disconnect()
        }
      },
      { threshold: 0.12 }
    )

    const timer = setTimeout(() => observer.observe(el), 50)
    return () => { clearTimeout(timer); observer.disconnect() }
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  )
}
