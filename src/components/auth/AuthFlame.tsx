/** A softly flickering candle flame — the brand's loading mark ("beyond the flame"). */
export function Flame({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 40 56" fill="none" className={className} aria-hidden="true">
      {/* outer glow */}
      <ellipse className="flame__glow" cx="20" cy="30" rx="15" ry="22" fill="url(#glow)" />
      {/* flame body */}
      <path className="flame" d="M20 4C20 4 32 16 32 30C32 40 26.6 47 20 47C13.4 47 8 40 8 30C8 22 14 18 15 12C18 16 16 20 20 22C22 18 20 10 20 4Z" fill="url(#flame)" />
      {/* inner cool core */}
      <path className="flame" d="M20 24C20 24 26 30 26 37C26 42 23.3 45 20 45C16.7 45 14 42 14 37C14 32 18 30 20 24Z" fill="#FBE7B0" opacity="0.9" />
      <defs>
        <linearGradient id="flame" x1="20" y1="4" x2="20" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4B483" /><stop offset="0.55" stopColor="#C9A96E" /><stop offset="1" stopColor="#A8843C" />
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(20 30) scale(15 22)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A96E" stopOpacity="0.5" /><stop offset="1" stopColor="#C9A96E" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Full-card loading overlay (shown during auth actions / OAuth redirect). */
export function AuthLoader({ label = "One moment" }: { label?: string }) {
  return (
    <div className="auth-overlay" role="status" aria-live="polite">
      <Flame />
      <span className="auth-overlay__label">{label}</span>
    </div>
  );
}
