export default function AnnouncementBar() {
  const items = [
    'Free shipping on all orders over ₹1000',
    'New launches coming soon',
    'Light it now — handcrafted with intention',
    'Soy-coconut blend · Lead-free wicks',
    'Free shipping on all orders over ₹1000',
    'New launches coming soon',
    'Light it now — handcrafted with intention',
    'Soy-coconut blend · Lead-free wicks',
  ]

  return (
    <div className="announcement-bar">
      <div className="announcement-bar__inner">
        {items.map((item, i) => (
          <span key={i}>
            {item}
            <span style={{ marginInline: '20px', opacity: 0.3 }}>·</span>
          </span>
        ))}
      </div>
    </div>
  )
}
