import { Link } from 'react-router-dom'

export default function ProductCard({ product, size = 'normal' }) {
  const notes = [
    ...product.fragranceNotes.top.slice(0, 2),
    ...product.fragranceNotes.heart.slice(0, 1),
  ].join(' · ')

  return (
    <Link to={`/product/${product.slug}`} className="product-card">
      <div className="product-card__image">
        <div className={`img-fill ${product.gradClass}`} />
        {product.featured && (
          <span className="product-card__badge">Featured</span>
        )}
      </div>
      <p className="product-card__chapter">{product.chapterName}</p>
      <h3 className="product-card__name">{product.name}</h3>
      <p className="product-card__tagline">{product.tagline}</p>
      <p className="product-card__notes">{notes}</p>
      <p className="product-card__price">₹{product.price.toLocaleString('en-IN')}</p>
    </Link>
  )
}
