import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import products from '../data/products.json'

function searchProducts(query) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return products.filter(p => {
    const allNotes = [
      ...p.fragranceNotes.top,
      ...p.fragranceNotes.heart,
      ...p.fragranceNotes.base,
    ].join(' ').toLowerCase()

    return (
      p.name.toLowerCase().includes(q) ||
      p.tagline.toLowerCase().includes(q) ||
      p.chapterName.toLowerCase().includes(q) ||
      p.scentGroup.toLowerCase().includes(q) ||
      p.theme.toLowerCase().includes(q) ||
      p.story.toLowerCase().includes(q) ||
      p.moodTags.some(t => t.toLowerCase().includes(q)) ||
      allNotes.includes(q)
    )
  })
}

const suggestions = ['Kashmiri Chai', 'Oud', 'Floral', 'Citrus', 'Dessert Chapter', 'Vanilla', 'Cozy']

export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 80)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleChange = useCallback((e) => {
    const val = e.target.value
    setQuery(val)
    setResults(searchProducts(val))
  }, [])

  const handleSuggestion = (s) => {
    setQuery(s)
    setResults(searchProducts(s))
    inputRef.current?.focus()
  }

  const handleResultClick = () => {
    onClose()
    setQuery('')
    setResults([])
  }

  if (!open) return null

  return (
    <div className="search-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="search-overlay__panel">

        {/* Input row */}
        <div className="search-overlay__input-row">
          <svg className="search-overlay__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L22 22" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-overlay__input"
            placeholder="Search candles, notes, moods..."
            value={query}
            onChange={handleChange}
            autoComplete="off"
          />
          {query && (
            <button className="search-overlay__clear" onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <button className="search-overlay__close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Suggestions (shown when no query) */}
        {!query && (
          <div className="search-overlay__suggestions">
            <p className="search-overlay__section-label">Try searching for</p>
            <div className="search-overlay__chips">
              {suggestions.map(s => (
                <button key={s} className="search-chip" onClick={() => handleSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>

            <p className="search-overlay__section-label" style={{ marginTop: 36 }}>All Collections</p>
            <div className="search-overlay__all-products">
              {products.slice(0, 4).map(p => (
                <Link
                  key={p.id}
                  to={`/product/${p.slug}`}
                  className="search-result-item"
                  onClick={handleResultClick}
                >
                  <div className={`search-result-item__img ${p.gradClass}`} />
                  <div className="search-result-item__info">
                    <p className="search-result-item__chapter">{p.chapterName}</p>
                    <p className="search-result-item__name">{p.name}</p>
                    <p className="search-result-item__notes">
                      {p.fragranceNotes.top.slice(0, 2).join(' · ')}
                    </p>
                  </div>
                  <p className="search-result-item__price">₹{p.price.toLocaleString('en-IN')}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {query && (
          <div className="search-overlay__results">
            {results.length === 0 ? (
              <div className="search-overlay__empty">
                <p className="search-overlay__empty-heading">No results for "{query}"</p>
                <p className="search-overlay__empty-sub">Try searching by scent note, mood, or collection name.</p>
                <div className="search-overlay__chips" style={{ justifyContent: 'center', marginTop: 20 }}>
                  {suggestions.map(s => (
                    <button key={s} className="search-chip" onClick={() => handleSuggestion(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="search-overlay__section-label">
                  {results.length} {results.length === 1 ? 'result' : 'results'} for "{query}"
                </p>
                <div className="search-overlay__all-products">
                  {results.map(p => (
                    <Link
                      key={p.id}
                      to={`/product/${p.slug}`}
                      className="search-result-item"
                      onClick={handleResultClick}
                    >
                      <div className={`search-result-item__img ${p.gradClass}`} />
                      <div className="search-result-item__info">
                        <p className="search-result-item__chapter">{p.chapterName}</p>
                        <p className="search-result-item__name">
                          {highlightMatch(p.name, query)}
                        </p>
                        <p className="search-result-item__notes">
                          {p.fragranceNotes.top.slice(0, 2).join(' · ')} · {p.scentGroup}
                        </p>
                        <div className="search-result-item__tags">
                          {p.moodTags.map(t => (
                            <span key={t} className="search-result-item__tag">{t}</span>
                          ))}
                        </div>
                      </div>
                      <p className="search-result-item__price">₹{p.price.toLocaleString('en-IN')}</p>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function highlightMatch(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--gold)', color: 'var(--ivory)', borderRadius: 2, padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}
