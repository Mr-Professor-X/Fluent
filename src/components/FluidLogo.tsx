export default function FluidLogo() {
  return (
    <svg className="fluid-logo" viewBox="0 0 64 64" role="img" aria-label="Fluid logo">
      <defs>
        <linearGradient id="fluid-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#2b77b3" />
          <stop offset="1" stopColor="#1a3857" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#fluid-logo-bg)" />
      <path d="M23 13H43A10 10 0 0 1 53 23V33A10 10 0 0 1 43 43H25L12 52V23A10 10 0 0 1 23 13Z" fill="#ffffff" />
      <path d="M19 25.5C23 21.5 27 21.5 31 25.5S39 29.5 45 25.5" fill="none" stroke="#2b77b3" strokeWidth="4" strokeLinecap="round" />
      <path d="M19 33.5C23 29.5 27 29.5 31 33.5S39 37.5 45 33.5" fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
      <circle cx="52" cy="12" r="5" fill="#2dffc4" stroke="#1a3857" strokeWidth="2" />
    </svg>
  );
}
